import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { HomePage } from '../features/home/pages/HomePage'
import { PlaceholderPage } from '../features/home/pages/PlaceholderPage'
import { NotFoundPage } from '../pages/NotFoundPage'

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="students/*" element={<PlaceholderPage title="学生" phase="Phase 2" />} />
            <Route path="classes/*" element={<PlaceholderPage title="班级" phase="Phase 2" />} />
            <Route path="attendance/*" element={<PlaceholderPage title="点名" phase="Phase 4" />} />
            <Route path="fees/*" element={<PlaceholderPage title="学费" phase="Phase 5" />} />
            <Route path="grades/*" element={<PlaceholderPage title="成绩" phase="Phase 6" />} />
            <Route path="temporary-classes/*" element={<PlaceholderPage title="临时班" phase="Phase 7" />} />
            <Route path="settings/*" element={<PlaceholderPage title="设置" phase="Phase 8" />} />
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}
