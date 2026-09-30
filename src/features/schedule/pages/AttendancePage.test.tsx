import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import { listAttendanceSessions, listAttendanceHistoryPage, loadStudentAttendanceScope, listStudentAttendanceHistoryPage } from '../api/scheduleService'
import { AllDayStopPanel } from '../components/AllDayStopPanel'
import { AttendancePage } from './AttendancePage'
import { malaysiaDateTime, todayInMalaysia } from '../../../utils/format'
import { getStudent } from '../../students/api/studentsService'
import type { Student } from '../../../types/domain'

vi.mock('../../attendance/api/attendanceService', () => ({ getSessionRoster: vi.fn() }))
vi.mock('../../students/api/studentsService', () => ({ getStudent: vi.fn() }))
vi.mock('../api/scheduleService', () => ({ listAttendanceSessions: vi.fn(), listAttendanceHistoryPage: vi.fn(), loadStudentAttendanceScope: vi.fn(), listStudentAttendanceHistoryPage: vi.fn() }))
vi.mock('../components/AllDayStopPanel', () => ({ AllDayStopPanel: vi.fn(() => null) }))
const sessions = ['a', 'b'].map((id) => ({ id: `session-${id}`, class_id: `class-${id}`, class: { name: `班级${id}` }, status: 'scheduled', current_start_at: '2026-09-29T06:00:00Z' })) as ClassSessionWithClass[]
function Probe() { return <output data-testid="search">{useLocation().search}</output> }
function renderPage(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><AttendancePage /><Probe /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.mocked(getStudent).mockReset().mockResolvedValue({ id: 'student-a', name: '蓝炜滨' } as Student)
  vi.mocked(AllDayStopPanel).mockClear()
  vi.mocked(listAttendanceSessions).mockClear()
  vi.mocked(listAttendanceHistoryPage).mockClear()
  vi.mocked(loadStudentAttendanceScope).mockClear()
  vi.mocked(listStudentAttendanceHistoryPage).mockClear()
  vi.mocked(getSessionRoster).mockClear()
  vi.mocked(listAttendanceSessions).mockResolvedValue(sessions)
  vi.mocked(listAttendanceHistoryPage).mockResolvedValue({ sessions, nextCursor: null, pastCount: 2 })
  vi.mocked(loadStudentAttendanceScope).mockResolvedValue({ enrollments: [], temporaryClassIds: [], makeupSessionIds: [] })
  vi.mocked(listStudentAttendanceHistoryPage).mockResolvedValue({ sessions, nextCursor: null, pastCount: 2 })
  vi.mocked(getSessionRoster).mockImplementation(async (id) => [{ student_id: id === 'session-a' ? 'student-a' : 'student-b', attendance_record_id: null }] as SessionRosterEntry[])
})
it('uses the actual scoped student name without changing the loaded course query', async () => {
  renderPage('/attendance?studentId=student-a&view=history')
  expect(await screen.findByRole('heading', { name: '蓝炜滨', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '出席记录', level: 2 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '显示全部课程' })).toBeInTheDocument()
})
it('does not guess the name while loading and can retry identity failure without discarding courses', async () => {
  vi.mocked(getStudent).mockRejectedValueOnce(new Error('offline'))
  renderPage('/attendance?studentId=student-a&view=history')
  expect(await screen.findByRole('link', { name: /班级a/ })).toBeInTheDocument()
  expect(await screen.findByText('学生姓名读取失败。')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '蓝炜滨' })).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: '重试学生姓名' }))
  expect(await screen.findByRole('heading', { name: '蓝炜滨', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /班级a/ })).toBeInTheDocument()
})
it('groups only loaded courses by Malaysia month, keeping the course ordering and older-page control', async () => {
  const boundary = [
    { ...sessions[0], id: 'session-a', current_start_at: '2025-08-31T17:00:00Z' },
    { ...sessions[0], id: 'session-c', current_start_at: '2025-08-31T15:00:00Z' },
  ] as ClassSessionWithClass[]
  vi.mocked(getSessionRoster).mockResolvedValue([{ student_id: 'student-a', attendance_record_id: null }] as SessionRosterEntry[])
  vi.mocked(listStudentAttendanceHistoryPage).mockResolvedValue({ sessions: boundary, nextCursor: { startAt: '2025-08-31T15:00:00Z', id: 'session-c' }, pastCount: 2 })
  renderPage('/attendance?studentId=student-a&view=history')
  expect(await screen.findByRole('heading', { name: '2025年9月' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '2025年8月' })).toBeInTheDocument()
  const links = screen.getAllByRole('link', { name: /班级a/ })
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/attendance/session/session-a', '/attendance/session/session-c'])
  expect(screen.getByRole('button', { name: '继续查看更早课程' })).toBeInTheDocument()
})
it('does not load the all-day stop preview until its closed control is opened', async () => {
  renderPage('/attendance?studentId=student-a&view=history')
  await screen.findByRole('link', { name: /班级a/ })
  expect(AllDayStopPanel).not.toHaveBeenCalled()
  await userEvent.setup().click(screen.getByText('全日停课', { exact: true }))
  await waitFor(() => expect(AllDayStopPanel).toHaveBeenCalled())
})
it('loads an older student course directly without requesting rosters for 100 unrelated system courses', async () => {
  const unrelated = Array.from({ length: 100 }, (_, index) => ({ ...sessions[1], id: `unrelated-${index}` }))
  vi.mocked(listAttendanceHistoryPage).mockResolvedValue({ sessions: unrelated, nextCursor: { startAt: '2026-01-01T00:00:00Z', id: 'unrelated-99' }, pastCount: 100 })
  vi.mocked(listStudentAttendanceHistoryPage).mockResolvedValue({ sessions: [sessions[0]], nextCursor: null, pastCount: 1 })
  renderPage('/attendance?studentId=student-a&view=history')
  expect(await screen.findByRole('link', { name: /班级a/ })).toBeInTheDocument()
  expect(listAttendanceHistoryPage).not.toHaveBeenCalled()
  expect(listStudentAttendanceHistoryPage).toHaveBeenCalledTimes(1)
  expect(getSessionRoster).toHaveBeenCalledTimes(1)
})
it('continues to older courses even when the first student-filtered batch is empty', async () => {
  vi.mocked(listStudentAttendanceHistoryPage).mockImplementation(async (cursor) => cursor
    ? { sessions: [sessions[0]], nextCursor: null, pastCount: 1 }
    : { sessions: [sessions[1]], nextCursor: { startAt: '2026-08-01T00:00:00Z', id: 'session-b' }, pastCount: 100 })
  renderPage('/attendance?studentId=student-a&view=history')
  const more = await screen.findByRole('button', { name: '继续查看更早课程' }, { timeout: 5000 })
  expect(screen.getByText(/已加载至：/)).toHaveTextContent('仅显示已加载记录')
  expect(screen.queryByText(/已读取 \d+ 堂/)).not.toBeInTheDocument()
  await userEvent.setup().click(more)
  expect(await screen.findByRole('link', { name: /班级a/ })).toBeInTheDocument()
  expect(await screen.findByText('没有更早的课程')).toBeInTheDocument()
})
it('preserves student scope across date tabs and shows only matching course rosters', async () => {
  const user = userEvent.setup()
  renderPage('/attendance?studentId=student-a&view=history')
  await screen.findByRole('link', { name: /班级a/ })
  await waitFor(() => expect(screen.queryByRole('link', { name: /班级b/ })).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '本周' }))
  expect(screen.getByTestId('search')).toHaveTextContent('studentId=student-a')
  expect(screen.getByTestId('search')).toHaveTextContent('view=week')
  expect(screen.getByRole('link', { name: /班级a/ })).toHaveAttribute('href', '/attendance/session/session-a')
})
it('filters a class entry without dropping its contextual scope', async () => {
  renderPage('/attendance?classId=class-b')
  await screen.findByRole('link', { name: /班级b/ })
  expect(screen.queryByRole('link', { name: /班级a/ })).not.toBeInTheDocument()
})
it('does not claim an empty student history when a roster could not be read', async () => {
  vi.mocked(getSessionRoster).mockRejectedValue(new Error('unavailable'))
  renderPage('/attendance?studentId=student-a&view=history')
  await screen.findByText(/部分点名名单载入失败/)
  expect(screen.queryByText('历史没有符合条件的课程。')).not.toBeInTheDocument()
})

it('shows the scoped student attendance instead of the whole-course count on past cards', async () => {
  const past = ['signed', 'backfill', 'absent', 'madeup', 'makeup', 'extra'].map((id) => ({
    ...sessions[0], id: 'session-' + id, class: { name: '班级-' + id },
    current_start_at: '2025-05-01T06:00:00Z',
  })) as ClassSessionWithClass[]
  vi.mocked(listStudentAttendanceHistoryPage).mockResolvedValue({ sessions: past, nextCursor: null, pastCount: past.length })
  vi.mocked(getSessionRoster).mockImplementation(async (id) => [{
    student_id: 'student-a', student_name: '学生甲', participation_type: id === 'session-makeup' ? 'makeup' : id === 'session-extra' ? 'extra' : 'regular',
    attendance_record_id: ['session-signed', 'session-backfill', 'session-makeup'].includes(id) ? 'attendance-a' : null,
    signing_type: id === 'session-backfill' ? 'backfill' : 'checkin',
    made_up_at: id === 'session-madeup' ? '2025-05-08T06:00:00Z' : null,
    made_up_session_id: id === 'session-madeup' ? 'session-makeup' : null,
  }] as SessionRosterEntry[])
  renderPage('/attendance?studentId=student-a&view=history')
  const card = async (name: string) => within(await screen.findByRole('link', { name: new RegExp('班级-' + name) }))
  expect(await (await card('signed')).findByText('已签到')).toBeInTheDocument()
  expect(await (await card('backfill')).findByText('已补签')).toBeInTheDocument()
  expect(await (await card('absent')).findByText('缺席')).toBeInTheDocument()
  expect(await (await card('madeup')).findByText('缺席 · 已补课')).toBeInTheDocument()
  expect(await (await card('makeup')).findByText('跨班补课')).toBeInTheDocument()
  expect(await (await card('extra')).findByText('额外参加')).toBeInTheDocument()
  expect(screen.queryByText(/已签到 \d+\/\d+/)).not.toBeInTheDocument()
})

it('does not call an unsigned student absent before the course date has passed', async () => {
  const today = todayInMalaysia()
  vi.mocked(listAttendanceSessions).mockResolvedValue([
    { ...sessions[0], id: 'session-today', class: { name: '今日课程' }, current_start_at: malaysiaDateTime(today, '08:00') },
    { ...sessions[0], id: 'session-future', class: { name: '未来课程' }, current_start_at: '2099-01-01T06:00:00Z' },
  ] as ClassSessionWithClass[])
  vi.mocked(getSessionRoster).mockResolvedValue([{ student_id: 'student-a', attendance_record_id: null }] as SessionRosterEntry[])
  renderPage('/attendance?studentId=student-a')
  const todayCard = within(await screen.findByRole('link', { name: /今日课程/ }))
  const futureCard = within(await screen.findByRole('link', { name: /未来课程/ }))
  expect(await todayCard.findByText('尚未签到')).toBeInTheDocument()
  expect(await futureCard.findByText('尚未点名')).toBeInTheDocument()
  expect(screen.queryByText('缺席')).not.toBeInTheDocument()
})
