import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { signatureReturnTarget } from '../../attendance/signatureFlow'
import { SessionDetails } from './SessionDetails'
import { getSession, listSessionChanges } from '../api/scheduleService'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
vi.mock('../api/scheduleService', () => ({ getSession: vi.fn(), listSessionChanges: vi.fn(), stopSession: vi.fn(), restoreSession: vi.fn() }))
vi.mock('../../attendance/api/attendanceService', () => ({ getSessionRoster: vi.fn() }))
const session = { id: 'course-a', class_id: 'class-a', class: { id: 'class-a', name: '会计甲班' }, current_start_at: '2025-08-01T06:00:00Z', current_end_at: '2025-08-01T07:00:00Z', original_start_at: '2025-08-01T06:00:00Z', original_end_at: '2025-08-01T07:00:00Z', status: 'scheduled', session_type: 'regular' } as ClassSessionWithClass
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSession).mockResolvedValue(session); vi.mocked(listSessionChanges).mockResolvedValue([]); vi.mocked(getSessionRoster).mockResolvedValue([{ student_id: 'a', student_name: '学生甲', attendance_record_id: null, participation_type: 'regular' }] as SessionRosterEntry[]) })
function setup(scope: { classId?: string; studentId?: string }) { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/students/a?panel=attendance&attendance.record=course-a']}><SessionDetails sessionId="course-a" scope={scope} prefix="attendance" /></MemoryRouter></QueryClientProvider>) }
it('does not render a course belonging to a different class', async () => { setup({ classId: 'class-b' }); expect(await screen.findByText('这堂课程不属于当前资料范围。')).toBeInTheDocument(); expect(screen.queryByText('会计甲班')).not.toBeInTheDocument(); expect(getSessionRoster).not.toHaveBeenCalled() })
it('does not render an unrelated student course even if the URL was manually altered', async () => { setup({ studentId: 'b' }); expect(await screen.findByText('这堂课程不属于当前资料范围。')).toBeInTheDocument(); expect(screen.queryByText('学生甲')).not.toBeInTheDocument() })
it('keeps independent signing links with the current embedded route as source', async () => { setup({ studentId: 'a' }); expect(await screen.findByRole('link', { name: '补签' })).toHaveAttribute('href', '/attendance/session/course-a/sign/a'); expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument() })

function CourseLoop() {
  const { get, set } = useRecordParams('attendance')
  const location = useLocation()
  const id = get('record')
  return <><output data-testid="state">{JSON.stringify(location.state)}</output>
    {id ? <button onClick={() => set('record', '', true)}>返回课程列表</button>
      : <>{['course-a','course-b'].map(course => <button key={course} onClick={() => set('record', course, true)}>打开 {course}</button>)}</>}
    {['course-a','course-b'].map(course => <div key={course} hidden={id !== course}><SessionDetails sessionId={course} prefix="attendance" active={id === course} /></div>)}
  </>
}
it('consumes the saved feedback at course A and never shows it on B or on a later return to A', async () => {
  vi.mocked(getSession).mockImplementation(async id => ({ ...session, id, class: { ...session.class!, name: id } }))
  const returned = signatureReturnTarget('course-a', '学生甲', { contextBack: { to: '/students/a?panel=attendance&attendance.record=course-a&attendance.roster=signed', label: '学生', state: { contextBack: { to: '/classes/class-a?panel=students', label: '班级' }, restoreContextScroll: true } } })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[{ pathname: '/students/a', search: '?' + returned.to.split('?')[1], state: returned.state }]}><CourseLoop /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('学生甲的签名已保存。请选择下一位学生。')).toBeVisible()
  await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('signatureSaved'))
  expect(screen.getByTestId('state')).toHaveTextContent('/classes/class-a?panel=students')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '返回课程列表' }))
  await user.click(screen.getByRole('button', { name: '打开 course-b' }))
  await screen.findByRole('heading', { name: 'course-b' })
  expect(screen.queryByText(/的签名已保存/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '返回课程列表' }))
  await user.click(screen.getByRole('button', { name: '打开 course-a' }))
  await screen.findByRole('heading', { name: 'course-a' })
  expect(screen.queryByText(/的签名已保存/)).not.toBeInTheDocument()
})
it('rejects a saved notice belonging to another course', async () => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[{ pathname: '/attendance/session/course-a', state: { signatureSaved: true, signedSessionId: 'course-b', signedStudentName: '学生乙' } }]}><SessionDetails sessionId="course-a" /></MemoryRouter></QueryClientProvider>)
  await screen.findByRole('heading', { name: '会计甲班' })
  expect(screen.queryByText(/的签名已保存/)).not.toBeInTheDocument()
})
