import { lazy, Suspense } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
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
const ClassSessionsPage = lazy(() => import('../features/schedule/pages/ClassSessionsPage').then((module) => ({ default: module.ClassSessionsPage })))
const AttendancePage = lazy(() => import('../features/schedule/pages/AttendancePage').then((module) => ({ default: module.AttendancePage })))
const SessionDetailPage = lazy(() => import('../features/schedule/pages/SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })))
const SignaturePage = lazy(() => import('../features/attendance/pages/SignaturePage').then((module) => ({ default: module.SignaturePage })))
const AttendanceRecordPage = lazy(() => import('../features/attendance/pages/AttendanceRecordPage').then((module) => ({ default: module.AttendanceRecordPage })))
const MonthlyFeesPage = lazy(() => import('../features/fees/pages/MonthlyFeesPage').then((module) => ({ default: module.MonthlyFeesPage })))
const ReceiptsPage = lazy(() => import('../features/fees/pages/ReceiptsPage').then((module) => ({ default: module.ReceiptsPage })))

function routePage(page: React.ReactNode) {
  return <Suspense fallback={<FullPageLoading label="正在载入页面…" />}>{page}</Suspense>
}

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [{
      element: <AppLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'students', element: routePage(<StudentListPage />) },
        { path: 'students/new', element: routePage(<StudentFormPage />) },
        { path: 'students/:studentId', element: routePage(<StudentDetailPage />) },
        { path: 'students/:studentId/edit', element: routePage(<StudentFormPage />) },
        { path: 'students/:studentId/enrollments/:enrollmentId', element: routePage(<EnrollmentDetailPage />) },
        { path: 'classes', element: routePage(<ClassesListPage />) },
        { path: 'classes/new', element: routePage(<ClassFormPage />) },
        { path: 'classes/subjects', element: routePage(<SubjectsPage />) },
        { path: 'classes/:classId', element: routePage(<ClassDetailPage />) },
        { path: 'classes/:classId/edit', element: routePage(<ClassFormPage />) },
        { path: 'classes/:classId/sessions', element: routePage(<ClassSessionsPage />) },
        { path: 'attendance', element: routePage(<AttendancePage />) },
        { path: 'attendance/session/:sessionId', element: routePage(<SessionDetailPage />) },
        { path: 'attendance/session/:sessionId/sign/:studentId', element: routePage(<SignaturePage />) },
        { path: 'attendance/session/:sessionId/record/:attendanceId', element: routePage(<AttendanceRecordPage />) },
        { path: 'fees', element: routePage(<MonthlyFeesPage view="current" />) },
        { path: 'fees/unpaid', element: routePage(<MonthlyFeesPage view="unpaid" />) },
        { path: 'fees/receipts', element: routePage(<ReceiptsPage />) },
        { path: 'fees/history', element: routePage(<MonthlyFeesPage view="history" />) },
        { path: 'grades/*', element: <PlaceholderPage title="成绩" phase="Phase 6" /> },
        { path: 'temporary-classes/*', element: <PlaceholderPage title="临时班" phase="Phase 7" /> },
        { path: 'settings/*', element: <PlaceholderPage title="设置" phase="Phase 8" /> },
        { path: 'home', element: <Navigate to="/" replace /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    }],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
