import { NextRequest } from 'next/server'
import { handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_MESSAGES_PER_CONVERSATION = 40

/**
 * GET /api/coach/conversations — the current conversation + messages.
 * Lazily opens a new conversation when the latest one is full or none exists.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()

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

    return ok({
      conversationId: conversation.id,
      messages: conversation.messages.map((m) => {
        let suggestion: string | null = null
        if (m.metaJson) {
          try {
            const meta = JSON.parse(m.metaJson) as { suggestion?: unknown }
            if (typeof meta.suggestion === 'string') suggestion = meta.suggestion
          } catch {
            suggestion = null
          }
        }
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          suggestion,
          createdAt: m.createdAt.toISOString(),
        }
      }),
    })
  } catch (err) {
    return handleError(err)
  }
}
