import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/authContext'
import { PwaUpdatePrompt } from '../../features/settings/pwa/PwaUpdatePrompt'
import { AppHeader } from './AppHeader'
import { useContextScrollRestoration } from '../navigation/useContextScrollRestoration'

export function AppLayout() {
  useContextScrollRestoration()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const contentRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const content = contentRef.current
    if (!content?.animate || !window.matchMedia) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const animation = preference.matches ? undefined : content.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    const cancel = () => { if (preference.matches) animation?.cancel() }
    preference.addEventListener('change', cancel)
    return () => { animation?.cancel(); preference.removeEventListener('change', cancel) }
  }, [pathname])
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('退出登录失败', error)
      setSignOutError('退出失败，请检查网络后重试。')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader isSigningOut={isSigningOut} onSignOut={() => void handleSignOut()} />
      {signOutError && <div className="app-shell-alert" role="alert">{signOutError}</div>}
      <main className="page-container ui-page-enter" ref={contentRef}>
        <Outlet />
      </main>
      <PwaUpdatePrompt />
    </div>
  )
}
