import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/authContext'

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
      <header className="app-header">
        <div className="header-inner">
          <Link className="header-brand" to="/" aria-label="返回首页">蓝老师补习班</Link>
          <button className="button button-text" type="button" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? '退出中…' : '退出'}
          </button>
        </div>
      </header>
      <main className="page-container">
        <Outlet />
      </main>
    </div>
  )
}
