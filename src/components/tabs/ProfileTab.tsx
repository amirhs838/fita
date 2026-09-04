'use client'

import { Bell, LogOut, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ListGroup, ListRow, ListSeparator } from '@/components/fita/List'
import { PrivacySheet } from '@/components/settings/PrivacySheet'
import { api, clearToken } from '@/lib/client'
import type { MeData, SubscriptionTier } from '@/lib/types'
import { formatPhone, enDigits } from '@/lib/phone'
import { BUDGET_LABEL, GOAL_LABEL } from '@/lib/labels'
import type { BudgetLevel, GoalType } from '@/lib/nutrition/engine'

const TIER_LABEL: Record<SubscriptionTier, string> = {
  FREE_TRIAL: 'دوره آزمایشی',
  PRO: 'فیتا پلاس',
  EXPIRED: 'اشتراک منقضی‌شده',
}

function trialEndDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    )
  } catch {
    return ''
  }
}

interface ProfileTabProps {
  me: MeData
  onLogout: () => void
  onOpenSubscription?: () => void
  onOpenNotifications?: () => void
}

export function ProfileTab({ me, onLogout, onOpenSubscription, onOpenNotifications }: ProfileTabProps) {
  const initial = me.user.name?.trim()[0] ?? 'ف'
  const [loggingOut, setLoggingOut] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // Even if the request fails, drop the local session client-side.
    } finally {
      clearToken()
      onLogout()
    }
  }

  return (
    <div className="space-y-7">
      {/* Account header */}
      <div className="flex items-center gap-4 pt-1">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{me.user.name ?? 'کاربر فیتا'}</h1>
          <p dir="ltr" className="tnum mt-0.5 text-right text-[13px] text-muted-foreground">
            {enDigits(formatPhone(me.user.phone))}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            me.subscription.tier === 'PRO'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {TIER_LABEL[me.subscription.tier]}
        </span>
      </div>

      {/* پروفایل */}
      <section aria-label="پروفایل">
        <h2 className="eyebrow mb-2 px-1">پروفایل</h2>
        <ListGroup>
          <ListRow
            title="اطلاعات شخصی"
            value={
              me.profile?.currentWeightKg && me.profile?.heightCm
                ? `${enDigits(me.profile.currentWeightKg)} کیلو · ${enDigits(me.profile.heightCm)} سانتی‌متر`
                : undefined
            }
          />
          <ListSeparator />
          <ListRow
            title="هدف"
            value={
              me.goal
                ? `${GOAL_LABEL[me.goal.type as GoalType] ?? me.goal.type}${me.goal.targetWeightKg ? ` · تا ${enDigits(me.goal.targetWeightKg)} کیلو` : ''}`
                : undefined
            }
          />
          <ListSeparator />
          <ListRow
            title="ترجیحات غذایی و حساسیت‌ها"
            value={
              me.profile
                ? `${enDigits(me.profile.mealsPerDay)} وعده در روز${me.profile.budgetLevel ? ` · ${BUDGET_LABEL[me.profile.budgetLevel as BudgetLevel]?.title ?? ''}` : ''}`
                : undefined
            }
          />
          <ListSeparator />
          <ListRow title="اطلاعات بدنی" value={me.profile?.activityLevel ? 'ثبت‌شده' : undefined} />
        </ListGroup>
      </section>

      {/* تنظیمات */}
      <section aria-label="تنظیمات">
        <h2 className="eyebrow mb-2 px-1">تنظیمات</h2>
        <ListGroup>
          <ListRow icon={Bell} title="اعلان‌ها" onClick={onOpenNotifications} />
          <ListSeparator />
          <ListRow
            icon={ShieldCheck}
            title="اشتراک"
            value={
              me.subscription.tier === 'FREE_TRIAL' && me.subscription.trialEndsAt
                ? `تا ${trialEndDate(me.subscription.trialEndsAt)}`
                : undefined
            }
            onClick={onOpenSubscription}
            accent={me.subscription.tier !== 'PRO'}
          />
        </ListGroup>
      </section>

      {/* داده‌ها */}
      <section aria-label="داده‌ها">
        <h2 className="eyebrow mb-2 px-1">داده‌ها</h2>
        <ListGroup>
          <ListRow title="حریم خصوصی و داده‌ها" onClick={() => setPrivacyOpen(true)} />
        </ListGroup>
      </section>

      <p className="px-1 text-xs leading-6 text-muted-foreground">
        {me.subscription.tier === 'PRO'
          ? 'فیتا پلاس فعال است — اسکن و مربی نامحدود.'
          : 'ویرایش بخش‌های پروفایل به‌زودی اضافه می‌شود.'}
      </p>

      <Button
        variant="outline"
        onClick={() => void handleLogout()}
        disabled={loggingOut}
        className="h-12 w-full rounded-full border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
      >
        {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
        خروج از حساب
      </Button>

      <p className="pt-1 pb-2 text-center text-[11px] text-muted-foreground">
        فیتا — نسخه {enDigits('0.1')}
      </p>

      <PrivacySheet
        open={privacyOpen}
        onOpenChange={setPrivacyOpen}
        onDeleted={() => {
          clearToken()
          onLogout()
        }}
      />
    </div>
  )
}
