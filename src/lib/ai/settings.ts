import { db } from '@/lib/db'
import { AppConfig } from '@/lib/config'

/**
 * Runtime AI configuration — the admin panel (/admin → هوش مصنوعی) stores an
 * OpenRouter API key + model names in the DB (SystemSetting rows), so the
 * owner can swap provider credentials without a redeploy.
 *
 * Resolution order:
 *   API key      → DB value, else env OPENROUTER_API_KEY, else none
 *   text model   → DB value, else env OPENROUTER_TEXT_MODEL, else default
 *   vision model → DB value, else DB text model, else env, else default
 *   provider     → explicit AI_PROVIDER=mock wins; a key anywhere → openrouter;
 *                  otherwise the sandbox z-ai provider.
 */

export type AiProviderName = 'openrouter' | 'zai' | 'mock'

export interface AiRuntimeConfig {
  provider: AiProviderName
  openRouterKey: string
  textModel: string
  visionModel: string
  /** Where the active API key comes from — surfaced in the admin panel. */
  keySource: 'db' | 'env' | 'none'
}

export const AI_SETTING_KEYS = {
  apiKey: 'ai.openrouter.apiKey',
  textModel: 'ai.openrouter.textModel',
  visionModel: 'ai.openrouter.visionModel',
} as const

let cache: { cfg: AiRuntimeConfig; at: number } | null = null
const CACHE_TTL_MS = 5_000

function first(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim()
    if (t) return t
  }
  return ''
}

export async function getAiRuntimeConfig(): Promise<AiRuntimeConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cfg

  let dbKey = ''
  let dbText = ''
  let dbVision = ''
  try {
    const rows = await db.systemSetting.findMany({
      where: { key: { in: Object.values(AI_SETTING_KEYS) } },
    })
    for (const row of rows) {
      if (row.key === AI_SETTING_KEYS.apiKey) dbKey = row.value.trim()
      else if (row.key === AI_SETTING_KEYS.textModel) dbText = row.value.trim()
      else if (row.key === AI_SETTING_KEYS.visionModel) dbVision = row.value.trim()
    }
  } catch {
    // DB hiccup → env-only config; AI features must never crash on settings.
  }

  const envKey = AppConfig.ai.openRouterKey
  const openRouterKey = first(dbKey, envKey)
  const explicitProvider = process.env.AI_PROVIDER?.trim().toLowerCase()

  let provider: AiProviderName
  if (explicitProvider === 'mock') provider = 'mock'
  else if (openRouterKey) provider = 'openrouter'
  else if (explicitProvider === 'openrouter') provider = 'openrouter'
  else provider = 'zai'

  const cfg: AiRuntimeConfig = {
    provider,
    openRouterKey,
    textModel: first(dbText, AppConfig.ai.textModel),
    visionModel: first(dbVision, dbText, AppConfig.ai.visionModel),
    keySource: dbKey ? 'db' : envKey ? 'env' : 'none',
  }

  cache = { cfg, at: Date.now() }
  return cfg
}

/** Called after the admin panel saves new settings — next request reads fresh. */
export function invalidateAiRuntimeConfig(): void {
  cache = null
}

/** sk-or-v1-ab12••••••••wxyz — safe to render in the admin panel. */
export function maskApiKey(key: string): string {
  const t = key.trim()
  if (!t) return ''
  if (t.length <= 12) return `${t.slice(0, 3)}••••`
  return `${t.slice(0, 10)}••••••••${t.slice(-4)}`
}
