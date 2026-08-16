import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/authContext'
import { PwaUpdatePrompt } from '../../features/settings/pwa/PwaUpdatePrompt'
import { AppHeader } from './AppHeader'

export function AppLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('退出登录失败', error)
      window.alert('退出失败，请检查网络后重试。')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader isSigningOut={isSigningOut} onSignOut={() => void handleSignOut()} />
      <main className="page-container">
        <Outlet />
      </main>
      <PwaUpdatePrompt />
    </div>
  )
}
