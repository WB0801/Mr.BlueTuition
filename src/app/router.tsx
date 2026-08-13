import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { FullPageLoading } from '../components/feedback/FullPageLoading'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { HomePage } from '../features/home/pages/HomePage'
import { PlaceholderPage } from '../features/home/pages/PlaceholderPage'
import { NotFoundPage } from '../pages/NotFoundPage'

const StudentListPage = lazy(() => import('../features/students/pages/StudentListPage').then((module) => ({ default: module.StudentListPage })))
const StudentFormPage = lazy(() => import('../features/students/pages/StudentFormPage').then((module) => ({ default: module.StudentFormPage })))
const StudentDetailPage = lazy(() => import('../features/students/pages/StudentDetailPage').then((module) => ({ default: module.StudentDetailPage })))
const EnrollmentDetailPage = lazy(() => import('../features/enrollments/pages/EnrollmentDetailPage').then((module) => ({ default: module.EnrollmentDetailPage })))
const ClassesListPage = lazy(() => import('../features/classes/pages/ClassesListPage').then((module) => ({ default: module.ClassesListPage })))
const ClassFormPage = lazy(() => import('../features/classes/pages/ClassFormPage').then((module) => ({ default: module.ClassFormPage })))
const ClassDetailPage = lazy(() => import('../features/classes/pages/ClassDetailPage').then((module) => ({ default: module.ClassDetailPage })))
const SubjectsPage = lazy(() => import('../features/classes/pages/SubjectsPage').then((module) => ({ default: module.SubjectsPage })))
const AttendancePage = lazy(() => import('../features/schedule/pages/AttendancePage').then((module) => ({ default: module.AttendancePage })))
const SessionDetailPage = lazy(() => import('../features/schedule/pages/SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })))

function routePage(page: React.ReactNode) {
  return <Suspense fallback={<FullPageLoading label="正在载入页面…" />}>{page}</Suspense>
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="students" element={routePage(<StudentListPage />)} />
            <Route path="students/new" element={routePage(<StudentFormPage />)} />
            <Route path="students/:studentId" element={routePage(<StudentDetailPage />)} />
            <Route path="students/:studentId/edit" element={routePage(<StudentFormPage />)} />
            <Route path="students/:studentId/enrollments/:enrollmentId" element={routePage(<EnrollmentDetailPage />)} />
            <Route path="classes" element={routePage(<ClassesListPage />)} />
            <Route path="classes/new" element={routePage(<ClassFormPage />)} />
            <Route path="classes/subjects" element={routePage(<SubjectsPage />)} />
            <Route path="classes/:classId" element={routePage(<ClassDetailPage />)} />
            <Route path="classes/:classId/edit" element={routePage(<ClassFormPage />)} />
            <Route path="attendance" element={routePage(<AttendancePage />)} />
            <Route path="attendance/session/:sessionId" element={routePage(<SessionDetailPage />)} />
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
