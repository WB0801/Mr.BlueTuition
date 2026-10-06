import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StudentDetailPage } from './students/pages/StudentDetailPage'
import { ClassDetailPage } from './classes/pages/ClassDetailPage'
import { AddStudentToClass } from './classes/components/AddStudentToClass'
import { ContextDataWorkspace } from '../components/contextual/ContextDataWorkspace'
import { TemporaryClassDetailPage } from './temporary-classes/pages/TemporaryClassDetailPage'
import { SessionDetails } from './schedule/components/SessionDetails'
import { TemporaryClassesPage } from './temporary-classes/pages/TemporaryClassesPage'
import { SchoolExamDetailPage } from './grades/pages/SchoolExamDetailPage'
import { TuitionQuizDetailPage } from './grades/pages/TuitionQuizDetailPage'
import * as grades from './grades/api/gradesService'
import * as temporary from './temporary-classes/api/temporaryClassesService'
import * as attendance from './attendance/api/attendanceService'
import * as schedule from './schedule/api/scheduleService'
import * as students from './students/api/studentsService'
import * as enrollments from './enrollments/api/enrollmentsService'
import * as classes from './classes/api/classesService'

vi.mock('./students/api/studentsService', () => ({ getStudent: vi.fn(), listStudents: vi.fn() }))
vi.mock('./enrollments/api/enrollmentsService', () => ({ listStudentEnrollments: vi.fn(), listClassEnrollments: vi.fn(), createEnrollment: vi.fn() }))
vi.mock('./classes/api/classesService', () => ({ getClass: vi.fn(), listClasses: vi.fn(), endClass: vi.fn() }))
vi.mock('./temporary-classes/api/temporaryClassesService', () => ({ getTemporaryClass: vi.fn(), getTemporaryClassSession: vi.fn(), listTemporaryClassEnrollments: vi.fn(), listTemporaryClasses: vi.fn(), addStudentToTemporaryClass: vi.fn(), createStudentForTemporaryClass: vi.fn(), endTemporaryClass: vi.fn(), updateTemporaryClassPaymentAmount: vi.fn(), markTemporaryClassPaymentPaid: vi.fn(), undoTemporaryClassPayment: vi.fn() }))
vi.mock('./attendance/api/attendanceService', () => ({ getSessionRoster: vi.fn(), listCrossClassCandidates: vi.fn().mockResolvedValue([]) }))
vi.mock('./schedule/api/scheduleService', () => ({ getSession: vi.fn(), listSessionChanges: vi.fn(), stopSession: vi.fn(), restoreSession: vi.fn() }))
vi.mock('./grades/api/gradesService', () => ({ getSchoolExam: vi.fn(), listSchoolExamRoster: vi.fn().mockResolvedValue([]), listSchoolExamScores: vi.fn().mockResolvedValue([]), listSchoolExamHistoricalCandidates: vi.fn().mockResolvedValue([]), getTuitionQuiz: vi.fn(), listTuitionQuizRoster: vi.fn().mockResolvedValue([]), listTuitionQuizScores: vi.fn().mockResolvedValue([]), previewTuitionQuizTopThree: vi.fn().mockResolvedValue({candidates:[], missing_students:[]}), confirmTuitionQuizTopThree: vi.fn() }))

const student = { id: 'student-a', name: '示例学生', owner_id: 'demo', school_class: '高一示例', phone: null }
const tuitionClass = { id: 'class-a', name: '示例班', status: 'active', subject_id: 'subject-a', monthly_fee: 40, start_date: '2026-01-01' }
const temp = { ...tuitionClass, id: 'temp-a', fee_amount: 40, start_at: '2026-10-06T06:00:00Z', end_at: '2026-10-06T08:00:00Z' }
const session = { id: 'session-a', class_id: 'class-a', class: tuitionClass, session_type: 'regular', status: 'scheduled', current_start_at: temp.start_at, current_end_at: temp.end_at, original_start_at: temp.start_at, original_end_at: temp.end_at }
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.mocked(students.getStudent).mockResolvedValue(student as never)
  vi.mocked(students.listStudents).mockResolvedValue([student] as never)
  vi.mocked(classes.getClass).mockResolvedValue(tuitionClass as never)
  vi.mocked(classes.listClasses).mockResolvedValue([])
  vi.mocked(enrollments.listStudentEnrollments).mockResolvedValue([{ id: 'ended-a', student_id: student.id, class_id: tuitionClass.id, class: tuitionClass, student, join_date: '2026-01-01', end_date: '2026-08-01', status: 'ended' }] as never)
  vi.mocked(enrollments.listClassEnrollments).mockResolvedValue([{ id: 'ended-a', student_id: student.id, class_id: tuitionClass.id, class: tuitionClass, student, join_date: '2026-01-01', end_date: '2026-08-01', status: 'ended' }] as never)
  vi.mocked(temporary.getTemporaryClass).mockResolvedValue(temp as never)
  vi.mocked(temporary.getTemporaryClassSession).mockResolvedValue({ ...session, session_type: 'temporary' } as never)
  vi.mocked(temporary.listTemporaryClassEnrollments).mockResolvedValue([])
  vi.mocked(temporary.listTemporaryClasses).mockResolvedValue([])
  vi.mocked(attendance.getSessionRoster).mockResolvedValue([])
  vi.mocked(schedule.getSession).mockResolvedValue(session as never)
  vi.mocked(schedule.listSessionChanges).mockResolvedValue([])
})
function mount(element: React.ReactNode, path: string, route: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter></QueryClientProvider>)
}
it('student history is selected above the list and its detail returns to that same history', async () => {
  mount(<StudentDetailPage />, '/students/student-a', '/students/:studentId')
  await screen.findByRole('heading', { name: student.name })
  const user = userEvent.setup()
  expect(screen.queryByRole('button', { name: /示例班/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '历史报读' }))
  await user.click(screen.getByRole('button', { name: /示例班/ }))
  await user.click(screen.getByRole('button', { name: /返回历史报读/ }))
  expect(screen.getByRole('button', { name: /示例班/ })).toBeVisible()
  await waitFor(() => expect(screen.getByRole('button', { name: /示例班/ })).toHaveFocus())
})
it('class history is an upper selection and is not repeated below current students', async () => {
  mount(<ClassDetailPage />, '/classes/class-a', '/classes/:classId')
  await screen.findByRole('heading', { name: tuitionClass.name })
  const user = userEvent.setup()
  expect(screen.queryByRole('link', { name: /示例学生/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '历史报读' }))
  expect(screen.getByRole('link', { name: /示例学生/ })).toHaveAttribute('href', '/students/student-a/enrollments/ended-a')
})
it('temporary class loads registration and roster only when chosen and keeps a registration selection across panels', async () => {
  mount(<TemporaryClassDetailPage />, '/temporary-classes/temp-a', '/temporary-classes/:temporaryClassId')
  await screen.findByRole('heading', { name: tuitionClass.name })
  expect(students.listStudents).not.toHaveBeenCalled()
  expect(attendance.getSessionRoster).not.toHaveBeenCalled()
  expect(screen.queryByText('永久删除临时班')).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '加入学生' }))
  await screen.findByText(student.name)
  const picker = screen.getByRole('region', { name: '加入学生' })
  await user.click(within(picker).getAllByRole('checkbox')[1])
  await user.click(screen.getByRole('button', { name: '学生与收费' }))
  await user.click(screen.getByRole('button', { name: '加入学生' }))
  expect(within(picker).getAllByRole('checkbox')[1]).toBeChecked()
  await user.click(screen.getByRole('button', { name: '临时班管理' }))
  expect(screen.getByText('永久删除临时班')).toBeVisible()
})
it('temporary registration locks column switches during save and retains a later selection', async () => {
  vi.mocked(students.listStudents).mockResolvedValue([student, { ...student, id: 'student-b', name: '另一示例学生' }] as never)
  let resolveSave!: () => void
  vi.mocked(temporary.addStudentToTemporaryClass).mockImplementation(() => new Promise(resolve => { resolveSave = () => resolve({} as never) }))
  mount(<TemporaryClassDetailPage />, '/temporary-classes/temp-a', '/temporary-classes/:temporaryClassId')
  await screen.findByRole('heading', { name: tuitionClass.name })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '加入学生' }))
  await screen.findByText('另一示例学生')
  const picker = screen.getByRole('region', { name: '加入学生' })
  const choices = within(picker).getAllByRole('checkbox')
  await user.click(choices[1])
  await user.click(screen.getByRole('button', { name: '确认加入' }))
  expect(screen.getByRole('button', { name: '学生与收费' })).toBeDisabled()
  await user.click(choices[2])
  await act(async () => resolveSave())
  expect(choices[2]).toBeChecked()
  expect(choices[1]).not.toBeChecked()
  expect(temporary.addStudentToTemporaryClass).toHaveBeenCalledWith('temp-a', student.id)
  expect(temporary.addStudentToTemporaryClass).toHaveBeenCalledTimes(1)
})
it('course management/history is lazy while the roster filter survives a panel round trip', async () => {
  mount(<SessionDetails sessionId="session-a" />, '/attendance/session/session-a', '/attendance/session/:sessionId')
  await screen.findByRole('heading', { name: tuitionClass.name })
  expect(schedule.listSessionChanges).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '已签到 0' }))
  await user.click(screen.getByRole('button', { name: '课程管理与历史' }))
  await screen.findByText('只修改这一次')
  expect(schedule.listSessionChanges).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: '当前名单' }))
  expect(screen.getByRole('button', { name: '已签到 0' })).toHaveAttribute('aria-pressed', 'true')
})
it('regular class registration clears only the submitted snapshot and preserves later choices', async () => {
  vi.mocked(students.listStudents).mockResolvedValue([student, { ...student, id: 'student-b', name: '另一示例学生' }] as never)
  let resolveSave!: () => void
  vi.mocked(enrollments.createEnrollment).mockImplementation(() => new Promise(resolve => { resolveSave = () => resolve({} as never) }))
  mount(<ContextDataWorkspace label="班级栏目" defaultPanel="join" sections={[
    { id: 'join', label: '加入学生', render: () => <AddStudentToClass classId="class-a" enrolledStudentIds={[]} /> },
    { id: 'roster', label: '当前名单', render: () => <p>名单</p> },
  ]} />, '/classes/class-a', '/classes/:classId')
  await screen.findByText('另一示例学生')
  const user = userEvent.setup()
  const choices = screen.getAllByRole('checkbox')
  await user.click(choices[1])
  await user.click(screen.getByRole('button', { name: '确认加入' }))
  expect(screen.getByRole('button', { name: '当前名单' })).toBeDisabled()
  await user.click(choices[2])
  await act(async () => resolveSave())
  expect(choices[2]).toBeChecked()
  expect(choices[1]).not.toBeChecked()
  expect(enrollments.createEnrollment).toHaveBeenCalledTimes(1)
  expect(enrollments.createEnrollment).toHaveBeenCalledWith(student.id, 'class-a', expect.any(String))
})
it('ended temporary class list is lazy and stays available after switching back', async () => {
  mount(<TemporaryClassesPage />, '/temporary-classes', '/temporary-classes')
  await screen.findByText('目前没有进行中的临时班。')
  expect(temporary.listTemporaryClasses).toHaveBeenCalledWith('active')
  expect(temporary.listTemporaryClasses).not.toHaveBeenCalledWith('ended')
  await userEvent.setup().click(screen.getByRole('button', { name: '已结束临时班' }))
  expect(await screen.findByText('还没有已结束临时班。')).toBeVisible()
})

it('school exam supplement and deletion are selected above the normal entry list', async () => {
  vi.mocked(grades.getSchoolExam).mockResolvedValue({id:'exam-a',name:'示例考试',exam_date:'2026-10-01',subject_id:'subject-a',max_score:100} as never)
  mount(<SchoolExamDetailPage />, '/grades/school/exam-a', '/grades/school/:examId')
  await screen.findByRole('heading', {name:'示例考试'})
  expect(screen.queryByPlaceholderText('输入学生姓名')).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', {name:'补录插班前成绩'}))
  expect(screen.getByPlaceholderText('输入学生姓名')).toBeVisible()
  await userEvent.setup().click(screen.getByRole('button', {name:'考试管理'}))
  expect(screen.getByText('永久删除考试')).toBeVisible()
})
it('quiz rankings do not read until the ranking column is selected', async () => {
  vi.mocked(grades.getTuitionQuiz).mockResolvedValue({id:'quiz-a',class_id:'class-a',name:'示例小测',quiz_date:'2026-10-01',max_score:100} as never)
  mount(<TuitionQuizDetailPage />, '/grades/quizzes/quiz-a', '/grades/quizzes/:quizId')
  await screen.findByRole('heading', {name:'示例小测'})
  expect(grades.previewTuitionQuizTopThree).not.toHaveBeenCalled()
  await userEvent.setup().click(screen.getByRole('button', {name:'前三名与奖励'}))
  expect(await screen.findByRole('heading', {name:'本次前三名'})).toBeVisible()
  expect(grades.previewTuitionQuizTopThree).toHaveBeenCalledWith('quiz-a')
})
