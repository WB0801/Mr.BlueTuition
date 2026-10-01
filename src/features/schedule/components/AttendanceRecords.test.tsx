import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AttendanceRecords } from './AttendanceRecords'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import { listStudentAttendanceHistoryPage, loadStudentAttendanceScope, listAttendanceSessions } from '../api/scheduleService'
import * as dates from '../../../utils/format'
vi.mock('../../attendance/api/attendanceService', () => ({ getSessionRoster: vi.fn() }))
vi.mock('../api/scheduleService', () => ({ listStudentAttendanceHistoryPage: vi.fn(), loadStudentAttendanceScope: vi.fn(), listAttendanceSessions: vi.fn(), listAttendanceHistoryPage: vi.fn(), ensureRollingSessions: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../students/api/studentsService', () => ({ getStudent: vi.fn() }))
const course = (id: string) => ({ id, class_id: 'class-a', class: { id: 'class-a', name: '会计甲班' }, session_type: 'regular', status: 'scheduled', current_start_at: '2025-08-01T06:00:00Z', current_end_at: '2025-08-01T07:00:00Z' }) as ClassSessionWithClass
function Probe() { return <output data-testid="url">{useLocation().pathname}</output> }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadStudentAttendanceScope).mockResolvedValue({ enrollments: [], temporaryClassIds: [], makeupSessionIds: [] }); vi.mocked(getSessionRoster).mockResolvedValue([{ student_id: 'a', attendance_record_id: 'signed-a', participation_type: 'regular', signing_type: 'checkin' }] as SessionRosterEntry[]); vi.mocked(listStudentAttendanceHistoryPage).mockImplementation(async cursor => ({ sessions: [course(cursor ? 'older' : 'newer')], pastCount: 1, nextCursor: cursor ? null : { id: 'newer', startAt: '2025-08-01T06:00:00Z' } })) })
it('retains loaded older pages when changing sections and opens a record without changing the student route', async () => {
  const user = userEvent.setup(); const select = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/students/a?panel=attendance']}><ContextDataWorkspace label="学生相关资料" defaultPanel="other" sections={[
    { id: 'other', label: '班级与报读', render: () => <p>报读</p> },
    { id: 'attendance', label: '出席与课程', render: active => <AttendanceRecords scope={{ studentId: 'a' }} prefix="attendance" active={active} onSelect={select} /> },
  ]} /><Probe /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('已签到')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '继续查看更早课程' }))
  await screen.findByText('没有更早的课程')
  expect(screen.getAllByRole('button', { name: /会计甲班/ })).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: '班级与报读' }))
  await user.click(screen.getByRole('button', { name: '出席与课程' }))
  expect(screen.getAllByRole('button', { name: /会计甲班/ })).toHaveLength(2)
  expect(listStudentAttendanceHistoryPage).toHaveBeenCalledTimes(2)
  await user.click(screen.getAllByRole('button', { name: /会计甲班/ })[1])
  expect(select).toHaveBeenCalledWith('older')
  expect(screen.getByTestId('url')).toHaveTextContent('/students/a')
})
it('requests only current-class sessions and never exposes a clear-scope control', async () => {
  vi.mocked(listAttendanceSessions).mockResolvedValue([course('class-course')])
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AttendanceRecords scope={{ classId: 'class-a' }} prefix="attendance" onSelect={() => {}} /></MemoryRouter></QueryClientProvider>)
  await waitFor(() => expect(listAttendanceSessions).toHaveBeenCalledWith('today', 'class-a', false))
  expect(screen.queryByRole('button', { name: '显示全部课程' })).not.toBeInTheDocument()
})

it('refreshes relative today/week ranges after a Malaysia day boundary without reusing yesterday', async () => {
  const date = vi.spyOn(dates, 'todayInMalaysia').mockReturnValue('2026-10-01')
  vi.mocked(listAttendanceSessions).mockImplementation(async () => [course(date.mock.results.at(-1)?.value === '2026-10-02' ? 'today-new' : 'today-old')])
  const client = new QueryClient(); const content = (active: boolean) => <QueryClientProvider client={client}><MemoryRouter><AttendanceRecords scope={{ classId: 'class-a' }} prefix="attendance" active={active} /></MemoryRouter></QueryClientProvider>
  const page = render(content(true)); await waitFor(() => expect(listAttendanceSessions).toHaveBeenCalledTimes(1))
  page.rerender(content(false)); date.mockReturnValue('2026-10-02'); page.rerender(content(true))
  await waitFor(() => expect(listAttendanceSessions).toHaveBeenCalledTimes(2))
  date.mockRestore()
})
