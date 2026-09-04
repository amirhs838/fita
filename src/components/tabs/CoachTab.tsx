'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiClientError } from '@/lib/client'
import { cn } from '@/lib/utils'
import type { CoachConversationData, CoachMessageDto, CoachReplyData } from '@/lib/types'

export type CoachAction =
  | 'LOG_FOOD'
  | 'OPEN_PLAN'
  | 'REPLACE_MEAL'
  | 'SCAN_FOOD'
  | 'DRINK_WATER'
  | 'VIEW_PROGRESS'

interface CoachTabProps {
  onAction: (action: CoachAction) => void
}

const SUGGESTION_LABEL: Record<string, string> = {
  LOG_FOOD: 'ثبت غذای امروز',
  OPEN_PLAN: 'دیدن برنامه هفتگی',
  REPLACE_MEAL: 'جایگزینی یک وعده',
  SCAN_FOOD: 'اسکن با عکس',
  DRINK_WATER: 'ثبت آب',
  VIEW_PROGRESS: 'دیدن پیشرفت',
}

const STARTERS = [
  'امروز شام چی بخورم؟',
  'چطور پروتئینم رو کامل کنم؟',
  'برای ناهار یه جایگزین می‌خوام',
  'امروز عملکردم چطور بود؟',
]

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3.5" aria-live="polite" aria-label="مربی در حال نوشتن">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

export function CoachTab({ onAction }: CoachTabProps) {
  const [messages, setMessages] = useState<CoachMessageDto[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [failedText, setFailedText] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api<CoachConversationData>('/api/coach/conversations')
      .then((data) => {
        if (!cancelled) setMessages(data.messages)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length < 2 || sending) return
    setSending(true)
    setFailedText(null)
    setInput('')
    const optimistic: CoachMessageDto = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      suggestion: null,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...(prev ?? []), optimistic])
    try {
      const data = await api<CoachReplyData>('/api/coach/message', {
        method: 'POST',
        body: JSON.stringify({ text: trimmed }),
      })
      setMessages((prev) => [...(prev ?? []).filter((m) => m.id !== optimistic.id), optimistic, data.reply])
    } catch (err) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id))
      setFailedText(trimmed)
      if (err instanceof ApiClientError) {
        // Persian server message surfaced via inline retry bubble below
      }
    } finally {
      setSending(false)
    }
  }, [sending])

  const empty = !messages || messages.length === 0

  if (loading) {
    return (
      <div className="space-y-4 pt-6">
        <Skeleton className="h-12 w-3/4 rounded-2xl" />
        <Skeleton className="ms-auto h-10 w-1/2 rounded-2xl" />
        <Skeleton className="h-14 w-2/3 rounded-2xl" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center px-6 pt-24 text-center">
        <p className="text-sm font-bold">مربی بارگذاری نشد</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-4 cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
        >
          تلاش مجدد
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-17rem)] flex-col">
      {/* Header — personal coach, not a chatbot */}
      <header className="pb-5 pt-1">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-5" strokeWidth={1.7} aria-hidden />
        </span>
        <h1 className="mt-3 text-[22px] font-bold leading-8">مربی فیتا</h1>
        <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
          بر اساس برنامه و وضعیت امروزت کمکت می‌کنم — بدون توصیه پزشکی.
        </p>
      </header>

      <div className="scroll-thin flex-1 space-y-2.5 overflow-y-auto pb-3">
        {empty && (
          <div className="pt-2">
            <p className="text-sm leading-7 text-foreground/85">
              سلام! هر سوالی درباره غذاهای ایرانی، برنامه‌ات یا انگیزه‌ی ادامه دادن داری بپرس.
            </p>
            <div className="mt-4 flex flex-col items-start gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="cursor-pointer rounded-full bg-brand-soft px-4 py-2 text-[13px] font-medium text-brand-strong transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages?.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn('max-w-[86%]', m.role === 'user' ? 'ms-auto' : 'me-auto')}
          >
            <div
              className={cn(
                'px-4 py-2.5 text-sm leading-7',
                m.role === 'user'
                  ? 'rounded-2xl rounded-ss-md bg-primary text-primary-foreground'
                  : 'rounded-2xl rounded-se-md bg-muted/70 text-foreground',
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
            {m.role === 'assistant' && m.suggestion && SUGGESTION_LABEL[m.suggestion] && (
              <button
                type="button"
                onClick={() => onAction(m.suggestion as CoachAction)}
                className="mt-1.5 flex cursor-pointer items-center gap-1.5 rounded-full border border-border/80 px-3.5 py-1.5 text-xs font-bold transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
              >
                <Sparkles className="size-3 text-brand" aria-hidden />
                {SUGGESTION_LABEL[m.suggestion]}
              </button>
            )}
          </motion.div>
        ))}

        {sending && (
          <div className="me-auto w-20 rounded-2xl rounded-se-md bg-muted/70">
            <TypingDots />
          </div>
        )}

        {failedText && !sending && (
          <div className="rounded-2xl bg-muted/50 p-3.5 text-center">
            <p className="text-xs text-muted-foreground">پیام ارسال نشد.</p>
            <button
              type="button"
              onClick={() => void send(failedText)}
              className="mt-2 cursor-pointer text-xs font-bold text-foreground underline underline-offset-4"
            >
              تلاش مجدد
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — static (content scrolls; main's pb clears the dock band) */}
      <div className="pt-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            rows={1}
            maxLength={800}
            placeholder="سؤالت را بنویس…"
            aria-label="پیام به مربی"
            className="scroll-thin max-h-28 min-h-12 w-full resize-none rounded-3xl border border-border/80 bg-card px-5 py-3.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length < 2}
            aria-label="ارسال"
            className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30 active:scale-95"
          >
            {sending ? (
              <Loader2 className="size-4.5 animate-spin" aria-hidden />
            ) : (
              <svg viewBox="0 0 24 24" className="size-5 -scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m5 12 14-7-5 7 5 7z" />
                <path d="M5 12h9" />
              </svg>
            )}
          </button>
        </form>
        <p className="pt-1.5 text-center text-[10px] text-muted-foreground">
          مربی فیتا جایگزین پزشک نیست؛ برای توصیه پزشکی به متخصص مراجعه کن.
        </p>
      </div>
    </div>
  )
}
