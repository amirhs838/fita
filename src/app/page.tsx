'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client'
import type { MeData } from '@/lib/types'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { MainShell } from '@/components/app/MainShell'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { Logo } from '@/components/app/Logo'

type SessionState = 'loading' | 'anon' | 'authed'

export default function FitaApp() {
  const [state, setState] = useState<SessionState>('loading')
  const [me, setMe] = useState<MeData | null>(null)

  const loadSession = useCallback(async () => {
    try {
      const data = await api<MeData>('/api/me')
      setMe(data)
      setState('authed')
    } catch {
      setMe(null)
      setState('anon')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api<MeData>('/api/me')
      .then((data) => {
        if (cancelled) return
        setMe(data)
        setState('authed')
      })
      .catch(() => {
        if (cancelled) return
        setMe(null)
        setState('anon')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = useCallback(() => {
    // Session cookie is cleared server-side by the logout call inside ProfileTab.
    setMe(null)
    setState('anon')
  }, [])

  if (state === 'loading') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center bg-background sm:border-x">
        <Logo className="text-3xl animate-pulse" />
      </div>
    )
  }

  if (state === 'anon' || !me) {
    return <AuthScreen onAuthed={() => void loadSession()} />
  }

  if (!me.onboarded) {
    return <OnboardingWizard onComplete={() => void loadSession()} />
  }

  return <MainShell me={me} onLogout={handleLogout} onRefreshMe={() => void loadSession()} />
}
