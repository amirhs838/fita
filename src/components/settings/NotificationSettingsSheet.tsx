'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellRing, Check, Droplets, LineChart, Flame, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import type { NotificationPrefsData } from '@/lib/types'

const BROWSER_NOTIF_KEY = 'fita_browser_notif'

interface NotificationSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ToggleRow({
  icon: Icon,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof BellRing
  title: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3.5 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </div>
  )
}

/**
 * Phase 11 — reminder preferences. Browser (system) notifications are
 * best-effort: while the app is open, due reminders fire via the
 * Notification API when permission is granted.
 */
export function NotificationSettingsSheet({ open, onOpenChange }: NotificationSettingsSheetProps) {
  const [prefs, setPrefs] = useState<NotificationPrefsData | null>(null)
  const [saving, setSaving] = useState(false)
  const [browserNotif, setBrowserNotif] = useState(false)
  const [browserSupported, setBrowserSupported] = useState(true)

  const load = useCallback(() => {
    api<NotificationPrefsData>('/api/notification-preferences')
      .then((d) => setPrefs(d))
      .catch(() => toast.error('تنظیمات بارگذاری نشد.'))
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    load()
    Promise.resolve().then(() => {
      if (cancelled) return
      try {
        setBrowserSupported(typeof window !== 'undefined' && 'Notification' in window)
        setBrowserNotif(
          typeof window !== 'undefined' &&
            window.localStorage.getItem(BROWSER_NOTIF_KEY) === '1' &&
            'Notification' in window &&
            Notification.permission === 'granted',
        )
      } catch {
        // storage blocked — browser notifications stay off
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, load])

  function patch(next: Partial<NotificationPrefsData>) {
    if (!prefs) return
    const optimistic = { ...prefs, ...next }
    setPrefs(optimistic)
    setSaving(true)
    api<NotificationPrefsData>('/api/notification-preferences', {
      method: 'PATCH',
      body: JSON.stringify(next),
    })
      .then((d) => setPrefs(d))
      .catch(() => {
        setPrefs(prefs)
        toast.error('ذخیره نشد. دوباره تلاش کن.')
      })
      .finally(() => setSaving(false))
  }

  function toggleBrowserNotif(v: boolean) {
    if (!v) {
      try {
        window.localStorage.removeItem(BROWSER_NOTIF_KEY)
      } catch {
        // noop
      }
      setBrowserNotif(false)
      return
    }
    if (!('Notification' in window)) {
      toast.error('مرورگر تو از اعلان پشتیبانی نمی‌کند.')
      return
    }
    void Notification.requestPermission()
      .then((perm) => {
        if (perm === 'granted') {
          try {
            window.localStorage.setItem(BROWSER_NOTIF_KEY, '1')
          } catch {
            // noop
          }
          setBrowserNotif(true)
          toast.success('اعلان مرورگر فعال شد')
        } else {
          toast.error('اجازه اعلان در مرورگر داده نشد.')
        }
      })
      .catch(() => toast.error('درخواست اجازه ناموفق بود.'))
  }

  function setMealTime(idx: number, value: string) {
    if (!prefs) return
    const times = [...prefs.mealTimes]
    times[idx] = value
    if (times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
      patch({ mealTimes: times })
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[86dvh] overflow-y-auto rounded-t-[28px] px-5 pb-8 pt-3 scroll-thin sm:max-w-md sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      >
        <SheetHeader className="px-1 text-start">
          <SheetTitle className="text-lg font-bold">اعلان‌ها و یادآورها</SheetTitle>
          <SheetDescription className="text-[13px]">
            یادآورها داخل اپ نشان داده می‌شوند؛ فقط حین استفاده از فیتا
          </SheetDescription>
        </SheetHeader>

        {!prefs ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="divide-y divide-border/60 rounded-2xl bg-card px-4 shadow-[0_1px_2px_oklch(0.175_0_0/0.04)]">
              <ToggleRow
                icon={BellRing}
                title="یادآورهای فیتا"
                hint="سوئیچ اصلی؛ با خاموشی، همه یادآورها می‌ایستند"
                checked={prefs.pushEnabled}
                onChange={(v) => patch({ pushEnabled: v })}
              />
              <ToggleRow
                icon={Check}
                title="یادآور وعده‌ها"
                hint="اگر سر ساعت وعده‌ای ثبت نشده باشد یادآوری می‌کنیم"
                checked={prefs.mealReminder}
                disabled={!prefs.pushEnabled}
                onChange={(v) => patch({ mealReminder: v })}
              />
              <ToggleRow
                icon={Droplets}
                title="یادآور آب"
                hint="بعدازظهر اگر آب کافی ننوشته باشی"
                checked={prefs.waterReminder}
                disabled={!prefs.pushEnabled}
                onChange={(v) => patch({ waterReminder: v })}
              />
              <ToggleRow
                icon={LineChart}
                title="توزین هفتگی"
                hint="روزی که نوبت توزین است یادت می‌آوریم"
                checked={prefs.weeklyWeightReminder}
                disabled={!prefs.pushEnabled}
                onChange={(v) => patch({ weeklyWeightReminder: v })}
              />
              <ToggleRow
                icon={Flame}
                title="نگهبان زنجیره"
                hint="شب‌ها اگر هنوز چیزی ثبت نکرده باشی"
                checked={prefs.streakReminder}
                disabled={!prefs.pushEnabled}
                onChange={(v) => patch({ streakReminder: v })}
              />
              <ToggleRow
                icon={Check}
                title="خلاصه هفتگی"
                hint="جمع‌بندی رفتار هفته در پایان هر هفته"
                checked={prefs.weeklySummary}
                disabled={!prefs.pushEnabled}
                onChange={(v) => patch({ weeklySummary: v })}
              />
            </div>

            {prefs.mealReminder && prefs.pushEnabled && (
              <div className="rounded-2xl bg-card p-4 shadow-[0_1px_2px_oklch(0.175_0_0/0.04)]">
                <p className="text-sm font-medium">ساعت وعده‌ها</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  زمان‌های یادآور وعده‌ها را تنظیم کن
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {prefs.mealTimes.map((t, i) => (
                    <label key={i} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                      <span className="tnum text-xs text-muted-foreground">
                        وعده {enDigits(i + 1)}
                      </span>
                      <Input
                        type="time"
                        dir="ltr"
                        value={t}
                        onChange={(e) => setMealTime(i, e.target.value)}
                        className="tnum h-8 border-0 bg-transparent px-0 text-start shadow-none focus-visible:ring-0"
                        aria-label={`ساعت وعده ${enDigits(i + 1)}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3.5 rounded-2xl bg-card px-4 py-3 shadow-[0_1px_2px_oklch(0.175_0_0/0.04)]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <BellRing className="size-4" strokeWidth={1.8} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">اعلان مرورگر</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {browserSupported
                    ? 'یادآورها به‌صورت اعلان سیستمی هم نشان داده شوند (فقط وقتی اپ باز است)'
                    : 'مرورگر تو از اعلان پشتیبانی نمی‌کند'}
                </p>
              </div>
              <Switch
                checked={browserNotif}
                disabled={!browserSupported || !prefs.pushEnabled || saving}
                onCheckedChange={toggleBrowserNotif}
                aria-label="اعلان مرورگر"
              />
            </div>

            <p className={cn('flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground', saving && 'opacity-70')}>
              {saving && <Loader2 className="size-3 animate-spin" aria-hidden />}
              تغییرات خودکار ذخیره می‌شوند
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
