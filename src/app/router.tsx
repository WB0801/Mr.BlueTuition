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
const GradesHomePage = lazy(() => import('../features/grades/pages/GradesHomePage').then((module) => ({ default: module.GradesHomePage })))
const SchoolExamsPage = lazy(() => import('../features/grades/pages/SchoolExamsPage').then((module) => ({ default: module.SchoolExamsPage })))
const SchoolExamFormPage = lazy(() => import('../features/grades/pages/SchoolExamFormPage').then((module) => ({ default: module.SchoolExamFormPage })))
const SchoolExamDetailPage = lazy(() => import('../features/grades/pages/SchoolExamDetailPage').then((module) => ({ default: module.SchoolExamDetailPage })))
const SchoolExamEntryPage = lazy(() => import('../features/grades/pages/SchoolExamEntryPage').then((module) => ({ default: module.SchoolExamEntryPage })))
const TuitionQuizzesPage = lazy(() => import('../features/grades/pages/TuitionQuizzesPage').then((module) => ({ default: module.TuitionQuizzesPage })))
const TuitionQuizFormPage = lazy(() => import('../features/grades/pages/TuitionQuizFormPage').then((module) => ({ default: module.TuitionQuizFormPage })))
const TuitionQuizDetailPage = lazy(() => import('../features/grades/pages/TuitionQuizDetailPage').then((module) => ({ default: module.TuitionQuizDetailPage })))
const TemporaryClassesPage = lazy(() => import('../features/temporary-classes/pages/TemporaryClassesPage').then((module) => ({ default: module.TemporaryClassesPage })))
const TemporaryClassFormPage = lazy(() => import('../features/temporary-classes/pages/TemporaryClassFormPage').then((module) => ({ default: module.TemporaryClassFormPage })))
const TemporaryClassDetailPage = lazy(() => import('../features/temporary-classes/pages/TemporaryClassDetailPage').then((module) => ({ default: module.TemporaryClassDetailPage })))

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
        { path: 'grades', element: routePage(<GradesHomePage />) },
        { path: 'grades/school', element: routePage(<SchoolExamsPage />) },
        { path: 'grades/school/new', element: routePage(<SchoolExamFormPage />) },
        { path: 'grades/school/:examId', element: routePage(<SchoolExamDetailPage />) },
        { path: 'grades/school/:examId/classes/:classId', element: routePage(<SchoolExamEntryPage />) },
        { path: 'grades/quizzes', element: routePage(<TuitionQuizzesPage />) },
        { path: 'grades/quizzes/new', element: routePage(<TuitionQuizFormPage />) },
        { path: 'grades/quizzes/:quizId', element: routePage(<TuitionQuizDetailPage />) },
        { path: 'temporary-classes', element: routePage(<TemporaryClassesPage />) },
        { path: 'temporary-classes/new', element: routePage(<TemporaryClassFormPage />) },
        { path: 'temporary-classes/:temporaryClassId', element: routePage(<TemporaryClassDetailPage />) },
        { path: 'temporary-classes/:temporaryClassId/edit', element: routePage(<TemporaryClassFormPage />) },
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
