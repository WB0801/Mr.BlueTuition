import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageLoading } from '../../components/feedback/FullPageLoading'
import { useAuth } from './authContext'

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageLoading label="正在确认登录状态…" />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
