import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import {
  AI_SETTING_KEYS,
  getAiRuntimeConfig,
  invalidateAiRuntimeConfig,
  maskApiKey,
  type AiProviderName,
} from '@/lib/ai/settings'

/**
 * /api/admin/ai-settings — owner-only AI provider configuration.
 * The OpenRouter API key + model names live in the SystemSetting table so the
 * owner can load/rotate them from the admin panel without a redeploy.
 *
 * PUT semantics:
 *   apiKey   — omitted → untouched; "" → delete stored key; otherwise upsert
 *   textModel / visionModel — "" → delete row (fall back to defaults)
 */

interface AdminAiSettingsData {
  provider: AiProviderName
  hasKey: boolean
  keySource: 'db' | 'env' | 'none'
  apiKeyMasked: string
  textModel: string
  visionModel: string
  /** Values actually stored in DB (the panel's editable state). */
  dbTextModel: string
  dbVisionModel: string
}

async function readSettingsData(): Promise<AdminAiSettingsData> {
  const cfg = await getAiRuntimeConfig()
  const rows = await db.systemSetting.findMany({
    where: { key: { in: Object.values(AI_SETTING_KEYS) } },
  })
  const dbText = rows.find((r) => r.key === AI_SETTING_KEYS.textModel)?.value.trim() ?? ''
  const dbVision = rows.find((r) => r.key === AI_SETTING_KEYS.visionModel)?.value.trim() ?? ''
  return {
    provider: cfg.provider,
    hasKey: Boolean(cfg.openRouterKey),
    keySource: cfg.keySource,
    apiKeyMasked: maskApiKey(cfg.openRouterKey),
    textModel: cfg.textModel,
    visionModel: cfg.visionModel,
    dbTextModel: dbText,
    dbVisionModel: dbVision,
  }
}

// OpenRouter ids look like "openai/gpt-4o-mini" or "deepseek/deepseek-chat-v3-0324:free"
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._/:-]{1,119}$/

const PutSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .max(200)
    // '' = remove stored key; otherwise an OpenRouter key (sk-or-v1-…)
    .refine((v) => v === '' || /^[A-Za-z0-9_\-\.]+$/.test(v), 'کلید API فقط حروف، اعداد و خط تیره.')
    .optional(),
  textModel: z.string().trim().max(120).optional(),
  visionModel: z.string().trim().max(120).optional(),
})

/** GET /api/admin/ai-settings — current effective + stored configuration. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const rl = rateLimit(`admin-ai-get:${clientIp(req)}`, 60, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های مکرر.')
    return ok(await readSettingsData())
  } catch (err) {
    return handleError(err)
  }
}

/** PUT /api/admin/ai-settings — save key / models (empty string = remove). */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin()
    const rl = rateLimit(`admin-ai-put:${clientIp(req)}`, 30, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های مکرر. کمی بعد تلاش کن.')

    const body = PutSchema.parse(await req.json())

    if (body.apiKey !== undefined) {
      if (body.apiKey === '') {
        await db.systemSetting.deleteMany({ where: { key: AI_SETTING_KEYS.apiKey } })
      } else {
        if (body.apiKey.length < 20) {
          throw new ApiError(422, 'INVALID_KEY', 'کلید API خیلی کوتاه است — کلید کامل OpenRouter را وارد کن.')
        }
        await db.systemSetting.upsert({
          where: { key: AI_SETTING_KEYS.apiKey },
          create: { key: AI_SETTING_KEYS.apiKey, value: body.apiKey },
          update: { value: body.apiKey },
        })
      }
    }

    for (const [field, settingKey] of [
      ['textModel', AI_SETTING_KEYS.textModel],
      ['visionModel', AI_SETTING_KEYS.visionModel],
    ] as const) {
      const value = body[field]
      if (value === undefined) continue
      if (value === '') {
        await db.systemSetting.deleteMany({ where: { key: settingKey } })
      } else {
        if (!MODEL_RE.test(value)) {
          throw new ApiError(422, 'INVALID_MODEL', 'اسم مدل معتبر نیست — مثل openai/gpt-4o-mini بنویس.')
        }
        await db.systemSetting.upsert({
          where: { key: settingKey },
          create: { key: settingKey, value },
          update: { value },
        })
      }
    }

    invalidateAiRuntimeConfig()
    return ok(await readSettingsData())
  } catch (err) {
    return handleError(err)
  }
}
