'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera } from 'lucide-react'
import { ScanSheet } from '@/components/scan/ScanSheet'
import { SubscriptionSheet } from '@/components/subscription/SubscriptionSheet'
import { NotificationSettingsSheet } from '@/components/settings/NotificationSettingsSheet'
import { Logo } from '@/components/app/Logo'
import { BottomNav, type TabId } from '@/components/app/BottomNav'
import { HomeTab } from '@/components/tabs/HomeTab'
import { DiaryTab } from '@/components/tabs/DiaryTab'
import { PlanTab } from '@/components/tabs/PlanTab'
import { CoachTab, type CoachAction } from '@/components/tabs/CoachTab'
import { ProgressTab } from '@/components/tabs/ProgressTab'
import { ProfileTab } from '@/components/tabs/ProfileTab'
import type { MeData, ReminderAction } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MainShellProps {
  me: MeData
  onLogout: () => void
  /** Reloads /api/me (after subscription activation etc.). */
  onRefreshMe?: () => void
}

const BROWSER_NOTIF_KEY = 'fita_browser_notif'
const REMINDER_POLL_MS = 5 * 60 * 1000

export function MainShell({ me, onLogout, onRefreshMe }: MainShellProps) {
  const [tab, setTab] = useState<TabId>('home')
  const [scanOpen, setScanOpen] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [diaryRefreshKey, setDiaryRefreshKey] = useState(0)

  useBrowserNotifications()

  const handleReminderAction = (action: ReminderAction) => {
    if (action === 'OPEN_PLAN') setTab('plan')
    else if (action === 'LOG_WEIGHT') setTab('progress')
    else setTab('diary') // LOG_FOOD / LOG_WATER live in the diary
  }

  const initial = me.user.name?.trim()[0] ?? 'ف'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-5">
          <Logo className="text-[17px]" />
          <button
            type="button"
            onClick={() => setTab('profile')}
            aria-label="پروفایل"
            className={cn(
              'flex size-9 cursor-pointer items-center justify-center rounded-full text-sm font-bold transition-all duration-200',
              tab === 'profile'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground/80 hover:bg-muted/70',
            )}
          >
            {initial}
          </button>
        </div>
      </header>

      {/* pb clears the floating dock + scan FAB band (~198px above viewport bottom) */}
      <main className="flex-1 px-5 pb-[208px] pt-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {tab === 'home' && (
              <HomeTab
                me={me}
                onGoProfile={() => setTab('profile')}
                onOpenScan={() => setScanOpen(true)}
                onReminderAction={handleReminderAction}
                onGoPlan={() => setTab('plan')}
              />
            )}
            {tab === 'diary' && <DiaryTab refreshSignal={diaryRefreshKey} />}
            {tab === 'plan' && <PlanTab />}
            {tab === 'coach' && (
              <CoachTab
                onAction={(action) => {
                  if (action === 'OPEN_PLAN' || action === 'REPLACE_MEAL') setTab('plan')
                  else if (action === 'VIEW_PROGRESS') setTab('progress')
                  else if (action === 'SCAN_FOOD') setScanOpen(true)
                  else setTab('diary') // LOG_FOOD / DRINK_WATER
                }}
              />
            )}
            {tab === 'progress' && <ProgressTab />}
            {tab === 'profile' && (
              <ProfileTab
                me={me}
                onLogout={onLogout}
                onOpenSubscription={() => setPaywallOpen(true)}
                onOpenNotifications={() => setNotifOpen(true)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating dock: canvas fade + scan FAB + stadium pill nav */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="relative mx-auto max-w-md px-4 pb-safe pt-10">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-background via-background/85 to-transparent"
            aria-hidden
          />
          <motion.button
            type="button"
            aria-label="اسکن غذا"
            onClick={() => setScanOpen(true)}
            whileTap={{ scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="absolute -top-[80px] end-6 flex size-14 cursor-pointer items-center justify-center rounded-full bg-energy text-foreground shadow-lg shadow-energy/40 ring-4 ring-background transition-colors"
          >
            <Camera className="size-[22px]" strokeWidth={1.9} aria-hidden />
          </motion.button>
          <BottomNav active={tab} onChange={setTab} />
        </div>
      </div>

      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onLogged={() => {
          setDiaryRefreshKey((k) => k + 1)
          setTab('diary')
        }}
        onManualEntry={() => setTab('diary')}
        onOpenPaywall={() => setPaywallOpen(true)}
      />

      <SubscriptionSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        onSubscribed={() => onRefreshMe?.()}
      />

      <NotificationSettingsSheet open={notifOpen} onOpenChange={setNotifOpen} />
    </div>
  )
}

/**
 * Phase 11 — best-effort system notifications while the app is open.
 * Only fires when the user granted permission in settings; reminders already
 * shown are tracked in-session so no duplicates, and the first poll seeds
 * silently (no backlog spam on page load).
 */
function useBrowserNotifications() {
  const shown = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    let flag = false
    try {
      flag = window.localStorage.getItem(BROWSER_NOTIF_KEY) === '1'
    } catch {
      return
    }
    if (!flag || Notification.permission !== 'granted') return

    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/reminders', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { ok: boolean; data?: { reminders: { id: string; titleFa: string; bodyFa: string }[] } }
        const list = json.ok && json.data ? json.data.reminders : []
        if (shown.current === null) {
          shown.current = new Set(list.map((r) => r.id)) // seed — don't fire old ones
          return
        }
        for (const r of list) {
          if (shown.current.has(r.id)) continue
          shown.current.add(r.id)
          try {
            new Notification(`فیتا — ${r.titleFa}`, { body: r.bodyFa, icon: '/logo.svg' })
          } catch {
            // some browsers require SW registration — in-app cards still cover it
          }
        }
      } catch {
        // best-effort only
      }
    }

    void poll()
    const timer = setInterval(() => void poll(), REMINDER_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])
}
