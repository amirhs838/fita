/**
 * In-memory sliding-window rate limiter (sandbox-appropriate).
 * Interface matches a future Redis implementation (same signature).
 */

type Bucket = number[]

const globalForLimiter = globalThis as unknown as {
  fitaRateBuckets: Map<string, Bucket> | undefined
}

const buckets: Map<string, Bucket> =
  globalForLimiter.fitaRateBuckets ?? new Map()
globalForLimiter.fitaRateBuckets = buckets

export interface RateResult {
  allowed: boolean
  retryAfterSec: number
}

export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)

  if (hits.length >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000))
    buckets.set(key, hits)
    return { allowed: false, retryAfterSec }
  }

  hits.push(now)
  buckets.set(key, hits)

  // Opportunistic pruning to keep memory bounded in long-lived dev sessions.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t > windowMs)) buckets.delete(k)
    }
  }

  return { allowed: true, retryAfterSec: 0 }
}
