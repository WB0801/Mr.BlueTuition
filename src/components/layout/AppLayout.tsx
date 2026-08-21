import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/authContext'
import { PwaUpdatePrompt } from '../../features/settings/pwa/PwaUpdatePrompt'
import { AppHeader } from './AppHeader'
import { useContextScrollRestoration } from '../navigation/useContextScrollRestoration'

export function AppLayout() {
  useContextScrollRestoration()
  const { signOut } = useAuth()
  const navigate = useNavigate()
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
      <main className="page-container">
        <Outlet />
      </main>
      <PwaUpdatePrompt />
    </div>
  )
}
