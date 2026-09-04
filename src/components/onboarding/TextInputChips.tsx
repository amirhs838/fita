'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TextInputChipsProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  addLabel?: string
}

/** Free-text chip input (likes/dislikes/custom allergies). Enter or + adds, X removes. */
export function TextInputChips({ values, onChange, placeholder, addLabel = 'افزودن' }: TextInputChipsProps) {
  const [text, setText] = useState('')

  function add() {
    const v = text.trim().replace(/\s+/g, ' ')
    if (v.length < 2 || values.includes(v) || values.length >= 20) {
      setText('')
      return
    }
    onChange([...values, v])
    setText('')
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          maxLength={40}
          className="h-13 rounded-2xl border-border/80 bg-card"
        />
        <button
          type="button"
          onClick={add}
          aria-label={addLabel}
          className="flex size-13 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-muted transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground',
              )}
            >
              {v}
              <button
                type="button"
                aria-label={`حذف ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="cursor-pointer text-primary-foreground/60 transition-colors hover:text-primary-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
