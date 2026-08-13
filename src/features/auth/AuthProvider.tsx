import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return

    let isMounted = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return

      if (error) console.error('读取登录状态失败', error)
      setSession(data.session)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: isSupabaseConfigured,
      async signIn(email, password) {
        if (!supabase) throw new Error('尚未配置 Supabase。')

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signOut() {
        if (!supabase) return

        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [isLoading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
