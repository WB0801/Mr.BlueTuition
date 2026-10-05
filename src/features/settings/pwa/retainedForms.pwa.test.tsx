import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ClassScheduleRule, ClassSession, TuitionClass } from '../../../types/domain'
import { ExtraSessionForm } from '../../schedule/components/ExtraSessionForm'
import { ScheduleChangeForm } from '../../schedule/components/ScheduleChangeForm'
import { RescheduleSessionForm } from '../../schedule/components/RescheduleSessionForm'
import { NewEnrollmentForm } from '../../enrollments/components/NewEnrollmentForm'
import { TemporaryClassRegistrationPanel } from '../../temporary-classes/components/TemporaryClassRegistrationPanel'
import { createFormProtection, updateProtection } from './updateProtection'
import { createExtraSession, changeClassSchedule, previewScheduleChange, rescheduleSession } from '../../schedule/api/scheduleService'
import { createEnrollment } from '../../enrollments/api/enrollmentsService'
import { listStudents } from '../../students/api/studentsService'
import { createStudentForTemporaryClass } from '../../temporary-classes/api/temporaryClassesService'

vi.mock('../../schedule/api/scheduleService', () => ({ createExtraSession: vi.fn(), changeClassSchedule: vi.fn(), previewScheduleChange: vi.fn(), rescheduleSession: vi.fn() }))
vi.mock('../../enrollments/api/enrollmentsService', () => ({ createEnrollment: vi.fn() }))
vi.mock('../../students/api/studentsService', () => ({ listStudents: vi.fn(async () => []) }))
vi.mock('../../temporary-classes/api/temporaryClassesService', () => ({ createStudentForTemporaryClass: vi.fn(), addStudentToTemporaryClass: vi.fn() }))
const tuitionClass = { id: 'class-a', name: '隔离班级', subject_id: 'subject-a', status: 'active', monthly_fee: 120, start_date: '2025-01-01', weekday: 2, start_time: '14:00', end_time: '15:30' } as TuitionClass
const rule = { id: 'rule-a', class_id: 'class-a', weekday: 2, start_time: '14:00', end_time: '15:30', effective_from: '2025-01-01', effective_to: null } as ClassScheduleRule
const session = { id: 'session-a', class_id: 'class-a', current_start_at: '2026-10-05T06:00:00Z', current_end_at: '2026-10-05T07:30:00Z' } as ClassSession
let protection: ReturnType<typeof createFormProtection> | undefined
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listStudents).mockResolvedValue([])
  vi.mocked(previewScheduleChange).mockResolvedValue({ affected_count: 3, manually_adjusted_count: 1 })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); protection?.dispose(); protection = undefined; vi.restoreAllMocks() })
function setup(content: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter>{content}</MemoryRouter></QueryClientProvider>)
  protection = createFormProtection(document)
  return client
}
function deferred() {
  let resolve!: (value?: never) => void, reject!: (error: Error) => void
  const promise = new Promise<never>((ok, fail) => { resolve = () => ok(undefined as never); reject = fail })
  return { promise, resolve, reject }
}
const cases = [
  { name: 'extra session', content: <ExtraSessionForm classId="class-a" defaultStartTime="14:00" defaultEndTime="15:30" />, field: '日期', action: '新增额外补课', api: createExtraSession },
  { name: 'new enrollment', content: <NewEnrollmentForm studentId="student-a" classes={[tuitionClass, { ...tuitionClass, id: 'class-b', name: '另一隔离班' }]} />, field: '加入日期', action: '加入班级', api: createEnrollment },
  { name: 'schedule change', content: <ScheduleChangeForm classId="class-a" currentRule={rule} />, field: '生效日期', action: '检查影响并修改', api: changeClassSchedule },
  { name: 'reschedule session', content: <RescheduleSessionForm session={session} />, field: '新日期', action: '确认改期', api: rescheduleSession },
]
function edit(c: typeof cases[number]) {
  if (c.name === 'new enrollment') fireEvent.change(screen.getByLabelText('班级'), { target: { value: 'class-a' } })
  const field = screen.getByLabelText(new RegExp(`^${c.field}`))
  fireEvent.change(field, { target: { value: '2027-01-20' } })
  if (c.name !== 'new enrollment') {
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByLabelText('结束时间'), { target: { value: '17:00' } })
  }
  return field
}
for (const c of cases) {
  it(`${c.name}: acknowledges only saved values after mutation settles`, async () => {
    const client = setup(c.content), field = edit(c), saving = deferred()
    vi.mocked(c.api).mockReturnValueOnce(saving.promise)
    expect(updateProtection.reason()).toContain('未保存')
    fireEvent.submit(field.closest('form')!)
    await waitFor(() => expect(client.isMutating()).toBe(1))
    await act(async () => saving.resolve())
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(field).toHaveValue('2027-01-20')
    if (c.name === 'new enrollment') expect(screen.getByLabelText('班级')).toHaveValue('')
    expect(updateProtection.reason()).toBe('')
  })
  it(`${c.name}: a failed save stays protected`, async () => {
    const client = setup(c.content), field = edit(c), saving = deferred()
    vi.mocked(c.api).mockReturnValueOnce(saving.promise)
    fireEvent.submit(field.closest('form')!); await waitFor(() => expect(client.isMutating()).toBe(1))
    await act(async () => saving.reject(new Error('isolated failure')))
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(updateProtection.reason()).toContain('未保存')
  })
  it(`${c.name}: an edit during submission survives acknowledgement`, async () => {
    const client = setup(c.content), field = edit(c), saving = deferred()
    vi.mocked(c.api).mockReturnValueOnce(saving.promise)
    fireEvent.submit(field.closest('form')!); await waitFor(() => expect(client.isMutating()).toBe(1))
    fireEvent.change(field, { target: { value: '2027-02-21' } })
    if (c.name === 'new enrollment') fireEvent.change(screen.getByLabelText('班级'), { target: { value: 'class-b' } })
    if (c.name === 'new enrollment') expect(createEnrollment).toHaveBeenCalledWith('student-a', 'class-a', '2027-01-20')
    await act(async () => saving.resolve()); await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(field).toHaveValue('2027-02-21'); expect(updateProtection.reason()).toContain('未保存')
    if (c.name === 'new enrollment') expect(screen.getByLabelText('班级')).toHaveValue('class-b')
  })
}
it('schedule preview cancellation does not acknowledge unsaved changes', async () => {
  const c = cases[2]; setup(c.content); const field = edit(c)
  vi.mocked(window.confirm).mockReturnValue(false)
  fireEvent.submit(field.closest('form')!); await waitFor(() => expect(window.confirm).toHaveBeenCalled())
  expect(changeClassSchedule).not.toHaveBeenCalled(); expect(updateProtection.reason()).toContain('未保存')
})
it('schedule preview itself blocks updating even before the mutation starts', async () => {
  const c = cases[2], client = setup(c.content), preview = deferred()
  vi.mocked(previewScheduleChange).mockReturnValueOnce(preview.promise)
  fireEvent.submit(screen.getByLabelText(/^生效日期/).closest('form')!)
  expect(client.isMutating()).toBe(0); expect(updateProtection.reason()).not.toBe('')
  await act(async () => preview.reject(new Error('preview failed')))
  expect(updateProtection.reason()).toBe('') // No edit was made; a failed check must release only the busy guard.
})
it('retained student form in temporary registration acknowledges success without clearing a later edit', async () => {
  const client = setup(<TemporaryClassRegistrationPanel classId="temporary-a" enrollments={[]} />)
  fireEvent.click(screen.getByText('新增学生并报名'))
  const field = screen.getByLabelText('姓名'), saving = deferred()
  fireEvent.change(field, { target: { value: '隔离学生甲' } }); vi.mocked(createStudentForTemporaryClass).mockReturnValueOnce(saving.promise)
  fireEvent.submit(field.closest('form')!); await waitFor(() => expect(client.isMutating()).toBe(1))
  await act(async () => saving.resolve()); await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(field).toHaveValue('隔离学生甲'); expect(updateProtection.reason()).toBe('')
  const second = deferred(); vi.mocked(createStudentForTemporaryClass).mockReturnValueOnce(second.promise)
  fireEvent.change(field, { target: { value: '隔离学生乙' } }); fireEvent.submit(field.closest('form')!)
  await waitFor(() => expect(client.isMutating()).toBe(1)); fireEvent.change(field, { target: { value: '未保存学生丙' } })
  await act(async () => second.resolve()); await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(field).toHaveValue('未保存学生丙'); expect(updateProtection.reason()).toContain('未保存')
})
it('retained student registration keeps failed input protected', async () => {
  const client = setup(<TemporaryClassRegistrationPanel classId="temporary-a" enrollments={[]} />)
  fireEvent.click(screen.getByText('新增学生并报名'))
  const field = screen.getByLabelText('姓名'), saving = deferred()
  fireEvent.change(field, { target: { value: '隔离失败学生' } })
  vi.mocked(createStudentForTemporaryClass).mockReturnValueOnce(saving.promise)
  fireEvent.submit(field.closest('form')!); await waitFor(() => expect(client.isMutating()).toBe(1))
  await act(async () => saving.reject(new Error('isolated failure')))
  await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(within(field.closest('form')!).getByRole('alert')).toHaveTextContent('操作失败'); expect(field).toHaveValue('隔离失败学生')
  expect(updateProtection.reason()).toContain('未保存')
})
