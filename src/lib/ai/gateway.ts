import { getAiRuntimeConfig, type AiRuntimeConfig } from '@/lib/ai/settings'

/**
 * AI Gateway — the only module allowed to talk to model providers.
 * Features depend on the interface, never on a specific model (see AI.md).
 *
 * Providers:
 *  - openrouter  → primary when an API key is configured (admin panel or env)
 *  - zai         → sandbox default (z-ai-web-dev-sdk, backend only)
 *  - mock        → offline deterministic responses for UI development
 */

export interface GatewayTextMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TextRequest {
  system: string
  messages: GatewayTextMessage[]
  /** Ask the provider for JSON-only output (validated downstream by zod). */
  json?: boolean
  maxTokens?: number
}

export interface VisionRequest {
  system: string
  /** Data URL (base64) — images are in-memory only and never persisted. */
  imageDataUrl: string
  maxTokens?: number
}

export class AiError extends Error {
  constructor(
    public code: 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
  }
}

export interface AiProvider {
  readonly name: 'openrouter' | 'zai' | 'mock'
  completeText(req: TextRequest): Promise<string>
  analyzeImage(req: VisionRequest): Promise<string>
}

// ─────────────────────────── OpenRouter ───────────────────────────

async function openRouterCall(model: string, messages: unknown[], key: string): Promise<string> {
  let res: Response
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fita.app',
        'X-Title': 'Fita',
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new AiError('AI_UNAVAILABLE', 'سرویس هوش مصنوعی در دسترس نیست.')
  }
  if (!res.ok) {
    // Read the provider's error body so failures become actionable in Persian.
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } }
      detail = (body.error?.message ?? body.error?.code ?? '').toLowerCase()
    } catch {
      // body unreadable — fall through to the status-based mapping
    }
    if (res.status === 404 || detail.includes('no endpoints') || detail.includes('not found')) {
      throw new AiError(
        'AI_UNAVAILABLE',
        `مدل «${model}» در OpenRouter پیدا نشد — در پنل ادمین اسم مدل را اصلاح کن.`,
      )
    }
    if (
      detail.includes('image') ||
      detail.includes('modalit') ||
      detail.includes('multimodal') ||
      detail.includes('input_format')
    ) {
      throw new AiError(
        'AI_UNAVAILABLE',
        `مدل «${model}» عکس قبول نمی‌کند — در پنل ادمین یک مدل بینایی انتخاب کن (مثل minimax/minimax-m3:free).`,
      )
    }
    throw new AiError('AI_UNAVAILABLE', `سرویس هوش مصنوعی خطا برگرداند (${res.status}).`)
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مدل.')
  return content
}

function makeOpenRouterProvider(cfg: AiRuntimeConfig): AiProvider {
  return {
    name: 'openrouter',
    async completeText(req) {
      return openRouterCall(
        cfg.textModel,
        [
          { role: 'system', content: req.system },
          ...(req.json ? [{ role: 'system', content: ' Respond with valid JSON only.' }] : []),
          ...req.messages,
        ],
        cfg.openRouterKey,
      )
    },
    async analyzeImage(req) {
      return openRouterCall(
        cfg.visionModel,
        [
          { role: 'system', content: req.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this food image.' },
              { type: 'image_url', image_url: { url: req.imageDataUrl } },
            ],
          },
        ],
        cfg.openRouterKey,
      )
    },
  }
}

// ─────────────────────────── Z.ai (sandbox) ───────────────────────────

const zaiProvider: AiProvider = {
  name: 'zai',
  async completeText(req) {
    try {
      const { default: ZAI } = await import('z-ai-web-dev-sdk')
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: req.system + (req.json ? ' Respond with valid JSON only.' : '') },
          ...req.messages,
        ],
        thinking: { type: 'disabled' },
      })
      const content = completion.choices[0]?.message?.content
      if (!content) throw new Error('empty')
      return content
    } catch (err) {
      if (err instanceof AiError) throw err
      throw new AiError('AI_UNAVAILABLE', 'سرویس هوش مصنوعی در دسترس نیست.')
    }
  },
  async analyzeImage(req) {
    try {
      const { default: ZAI } = await import('z-ai-web-dev-sdk')
      const zai = await ZAI.create()
      // Vision uses the dedicated createVision endpoint (SDK contract);
      // system text travels inside the user content array. The sandbox SDK
      // defaults the model at runtime — its TS type demands a `model` field,
      // so we cast the model-less body (env-driven model stays for openrouter).
      type VisionBody = Parameters<typeof zai.chat.completions.createVision>[0]
      const body = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${req.system} Respond with valid JSON only.` },
              { type: 'image_url', image_url: { url: req.imageDataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      } as unknown as VisionBody
      const completion = await zai.chat.completions.createVision(body)
      const content = completion.choices[0]?.message?.content
      if (!content) throw new Error('empty')
      return content
    } catch (err) {
      if (err instanceof AiError) throw err
      throw new AiError('AI_UNAVAILABLE', 'سرویس بینایی در دسترس نیست.')
    }
  },
}

// ─────────────────────────── Mock (offline dev) ───────────────────────────

const mockProvider: AiProvider = {
  name: 'mock',
  async completeText() {
    return JSON.stringify({ reply: 'پاسخ نمونه (حالت آفلاین توسعه).' })
  },
  async analyzeImage() {
    return JSON.stringify({
      isFood: true,
      name: 'rice and stew',
      nameFa: 'برنج با خورشت',
      estimatedGrams: 420,
      confidence: 0.65,
      per100g: { kcal: 150, protein: 5, carbs: 22, fat: 4 },
    })
  },
}

// ─────────────────────────── Resolution ───────────────────────────

export async function getAiProvider(): Promise<AiProvider> {
  const cfg = await getAiRuntimeConfig()
  switch (cfg.provider) {
    case 'openrouter':
      return makeOpenRouterProvider(cfg)
    case 'mock':
      return mockProvider
    default:
      return zaiProvider
  }
}
