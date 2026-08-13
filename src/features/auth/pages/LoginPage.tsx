import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FullPageLoading } from '../../../components/feedback/FullPageLoading'
import { useAuth } from '../authContext'

interface LocationState {
  from?: string
}

export function LoginPage() {
  const { user, isLoading, isConfigured, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const from = (location.state as LocationState | null)?.from ?? '/'

  useEffect(() => {
    document.title = '登录 · 蓝老师补习班'
  }, [])

  if (isLoading) return <FullPageLoading label="正在确认登录状态…" />
  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch (caughtError) {
      console.error(caughtError)
      setError('登录失败，请检查电邮和密码后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">蓝</div>
        <h1 id="login-title">蓝老师补习班</h1>
        <p className="muted">请登录以继续</p>

        {!isConfigured && (
          <div className="notice" role="status">
            尚未配置 Supabase。请先根据 <code>.env.example</code> 建立 <code>.env.local</code>。
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            <span>电邮</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={!isConfigured || isSubmitting}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={!isConfigured || isSubmitting}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={!isConfigured || isSubmitting}>
            {isSubmitting ? '登录中…' : '登录'}
          </button>
        </form>
      </section>
    </main>
  )
}
