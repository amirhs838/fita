import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { askCoach, buildCoachContext } from '@/lib/ai/coach'
import { AiError } from '@/lib/ai/gateway'
import { getScanEntitlement } from '@/lib/entitlements'

const BodySchema = z.object({ text: z.string().trim().min(2, 'پیام کوتاه است.').max(800) })
const MAX_MESSAGES_PER_CONVERSATION = 40

/**
 * POST /api/coach/message — one coach turn: save user msg → guarded context →
 * provider call (zod-validated, 1 retry) → save assistant msg with a
 * whitelisted suggestion code. Expired subscriptions are blocked; trial/PRO ok.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const rl = rateLimit(`coach:${user.id}`, 10, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'کمی صبر کن و دوباره بپرس.')

    const { text } = BodySchema.parse(await req.json())

    const entitlement = await getScanEntitlement(user.id)
    if (!entitlement.canScan && entitlement.reason === 'EXPIRED') {
      throw new ApiError(403, 'SUBSCRIPTION_EXPIRED', 'برای استفاده از مربی، اشتراک را فعال کن.')
    }

    const built = await buildCoachContext(user.id)
    if (!built) throw new ApiError(400, 'NOT_ONBOARDED', 'ابتدا رویboarding را کامل کن.')

    // Reuse the open conversation or roll over when it is full.
    let conversation = await db.aIConversation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!conversation || conversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION) {
      conversation = await db.aIConversation.create({
        data: { userId: user.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      })
    }

    const userMsg = await db.aIMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: text },
    })

    const history = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    try {
      const { reply, suggestion } = await askCoach(built.contextJson, history, text)
      const assistantMsg = await db.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          metaJson: suggestion ? JSON.stringify({ suggestion }) : null,
        },
      })
      return ok({
        conversationId: conversation.id,
        reply: {
          id: assistantMsg.id,
          role: 'assistant',
          content: assistantMsg.content,
          suggestion,
          createdAt: assistantMsg.createdAt.toISOString(),
        },
      })
    } catch (err) {
      // The user message is kept so a retry has full context.
      void userMsg
      if (err instanceof AiError) {
        // Structured replies occasionally fail on adversarial input — answer
        // with a canned safe reply instead of an error bubble (never crash).
        if (err.code === 'AI_INVALID_RESPONSE') {
          const fallback = await db.aIMessage.create({
            data: {
              conversationId: conversation.id,
              role: 'assistant',
              content:
                'الان نتونستم جواب دقیقی پیدا کنم. یک سؤال دیگه بپرس یا از دفتر و برنامه فیتا استفاده کن. 🌱',
            },
          })
          return ok({
            conversationId: conversation.id,
            reply: {
              id: fallback.id,
              role: 'assistant',
              content: fallback.content,
              suggestion: null,
              createdAt: fallback.createdAt.toISOString(),
            },
          })
        }
        throw new ApiError(502, err.code, err.message)
      }
      throw err
    }
  } catch (err) {
    return handleError(err)
  }
}
