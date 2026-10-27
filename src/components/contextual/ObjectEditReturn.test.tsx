import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createFormProtection } from '../../features/settings/pwa/updateProtection'
import { updateProtection } from '../../features/settings/pwa/updateProtection'
import { UpdateController } from '../../features/settings/pwa/updateController'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, Link, Outlet, useLocation } from 'react-router-dom'
import { ContextLink } from '../navigation/ContextLink'
import { StudentFormPage } from '../../features/students/pages/StudentFormPage'
import { ClassFormPage } from '../../features/classes/pages/ClassFormPage'
import { FeeRecords } from '../../features/fees/components/FeeRecords'
import { installContextDataInvalidation } from './contextDataInvalidation'
import { getStudent, updateStudent, createStudent } from '../../features/students/api/studentsService'
import { getClass, updateClass, createClass } from '../../features/classes/api/classesService'
import { listSubjects } from '../../features/classes/api/subjectsService'
import { ensureMonthlyFees, listMonthlyFees } from '../../features/fees/api/feesService'
import type { MonthlyFeeDetails, Student, TuitionClass } from '../../types/domain'

vi.mock('../../features/auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }))
vi.mock('../../features/students/api/studentsService', () => ({ getStudent: vi.fn(), updateStudent: vi.fn(), createStudent: vi.fn(), findPotentialDuplicateStudents: vi.fn().mockResolvedValue([]) }))
vi.mock('../../features/classes/api/classesService', () => ({ getClass: vi.fn(), updateClass: vi.fn(), createClass: vi.fn() }))
vi.mock('../../features/classes/api/subjectsService', () => ({ listSubjects: vi.fn() }))
vi.mock('../../features/fees/api/feesService', () => ({ ensureMonthlyFees: vi.fn(), listMonthlyFees: vi.fn(), markMonthlyFeePaid: vi.fn(), undoMonthlyFeePayment: vi.fn(), updateMonthlyFeeAmount: vi.fn(), waiveMonthlyFee: vi.fn(), completeReceipts: vi.fn(), restoreReceipt: vi.fn() }))
let student: Student
let tuitionClass: TuitionClass
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  student = { id: 'a', name: '学生甲', school_class: '高一', phone: '0120000001', updated_at: 'before' } as Student
  tuitionClass = { id: 'a', name: '会计甲班', subject_id: 'subject', weekday: 6, start_time: '14:00', end_time: '15:30', monthly_fee: 120, start_date: '2025-01-01', status: 'active', updated_at: 'before' } as TuitionClass
  vi.mocked(getStudent).mockImplementation(async () => ({ ...student }))
  vi.mocked(getClass).mockImplementation(async () => ({ ...tuitionClass }))
  vi.mocked(updateStudent).mockImplementation(async (_id, input) => { student = { ...student, ...input, updated_at: 'after' }; return student })
  vi.mocked(updateClass).mockImplementation(async (_id, input) => { tuitionClass = { ...tuitionClass, ...input, updated_at: 'after' }; return tuitionClass })
  vi.mocked(createStudent).mockResolvedValue({ ...student, id: 'created' })
  vi.mocked(createClass).mockResolvedValue({ ...tuitionClass, id: 'created' })
  vi.mocked(listSubjects).mockResolvedValue([{ id: 'subject', name: '会计' }] as Awaited<ReturnType<typeof listSubjects>>)
  vi.mocked(ensureMonthlyFees).mockResolvedValue({ created_count: 0 })
  vi.mocked(listMonthlyFees).mockImplementation(async () => [{ id: 'fee', owner_id: 'owner', student_id: 'a', enrollment_id: 'enrollment', fee_month: '2026-09-01', actual_amount: 120, normal_amount: 120, payment_status: 'paid', receipt_status: 'pending', paid_at: '2026-09-01T06:00:00Z', receipt_completed_at: null, created_at: '', updated_at: '', student: { ...student }, enrollment: { id: 'enrollment', class_id: 'a', join_date: '2025-01-01', end_date: null, status: 'active', class: { ...tuitionClass } } }] as MonthlyFeeDetails[])
})
function Probe() { const location = useLocation(); return <output data-testid="location">{JSON.stringify({ url: location.pathname + location.search, state: location.state })}</output> }
function Detail({ kind }: { kind: 'students' | 'classes' }) {
  return <><ContextLink to={`/${kind}/a/edit`} backLabel={kind === 'students' ? '学生' : '班级'}>编辑资料</ContextLink><FeeRecords scope={kind === 'students' ? { studentId: 'a' } : { classId: 'a' }} /><Probe /></>
}
function setup(kind: 'students' | 'classes', entry: { pathname: string; search?: string; state?: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); installContextDataInvalidation(client)
  const router = createMemoryRouter([{ element: <><Link to="/elsewhere">离开编辑</Link><Outlet /></>, children: [
    { path: `/${kind}/a`, element: <Detail kind={kind} /> },
    { path: `/${kind}/:${kind === 'students' ? 'studentId' : 'classId'}/edit`, element: kind === 'students' ? <StudentFormPage /> : <ClassFormPage /> },
    { path: `/${kind}/new`, element: kind === 'students' ? <StudentFormPage /> : <ClassFormPage /> },
    { path: '*', element: <Probe /> },
  ] }], { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return Object.assign(router, { queryClient: client })
}

it.each(['students','classes'] as const)('restores the %s URL, filters and source after a real edit/save, and refreshes receipt identity without generation', async kind => {
  const search = '?panel=fees&fees.month=all&fees.status=paid&fees.record=fee&fees.receipt=1'
  const source = { contextBack: { to: '/attendance?classId=a', label: '点名' } }
  setup(kind, { pathname: `/${kind}/a`, search, state: source })
  expect(await screen.findByText('学生甲 · 会计甲班')).toBeVisible()
  const user = userEvent.setup(); await user.click(screen.getByRole('link', { name: '编辑资料' }))
  const name = await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称')
  await user.clear(name); await user.type(name, '新身份')
  await user.click(screen.getByRole('button', { name: '保存修改' }))
  expect(await screen.findByText(kind === 'students' ? '新身份 · 会计甲班' : '学生甲 · 新身份')).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent(`/${kind}/a${search}`)
  expect(screen.getByTestId('location')).toHaveTextContent('/attendance?classId=a')
  expect(screen.getByTestId('location')).toHaveTextContent('restoreContextScroll')
  expect(ensureMonthlyFees).toHaveBeenCalledTimes(1)
  expect(listMonthlyFees).toHaveBeenCalledTimes(2)
  expect(listMonthlyFees).toHaveBeenLastCalledWith(expect.objectContaining(kind === 'students' ? { studentId: 'a', classId: undefined } : { classId: 'a', studentId: undefined }))
})

it.each((['students','classes'] as const).flatMap(kind => [undefined, { contextBack: { to: `/${kind}/b?panel=fees`, label: '资料' } }, { contextBack: { to: 'https://evil.example', label: '外部' } }, { contextBack: { to: `/${kind}/a/edit?panel=fees`, label: '编辑' } }].map(state => ({ kind, state }))))('uses the safe default for missing or mismatched edit sources $kind $state', async ({ kind, state }) => {
  setup(kind, { pathname: `/${kind}/a/edit`, state })
  await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称'); await userEvent.setup().click(screen.getByRole('button', { name: '保存修改' }))
  await screen.findByRole('link', { name: '编辑资料' })
  expect(screen.getByTestId('location')).toHaveTextContent(`"url":"/${kind}/a"`)
})
it.each(['students','classes'] as const)('never returns a newly created %s to an existing source object', async kind => {
  setup(kind, { pathname: `/${kind}/new`, state: { contextBack: { to: `/${kind}/a?panel=fees`, label: '资料' } } })
  const user = userEvent.setup(); await user.type(await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称'), '新增对象')
  if (kind === 'classes') await user.selectOptions(screen.getByLabelText('科目'), 'subject')
  await user.click(screen.getByRole('button', { name: kind === 'students' ? '新增学生' : '新增班级' }))
  expect(await screen.findByTestId('location')).toHaveTextContent(`"url":"/${kind}/created"`)
})

it.each(['students','classes'] as const)('keeps the real %s form and later draft after an earlier save updates its query cache', async kind => {
  let finish!: () => void
  if (kind === 'students') vi.mocked(updateStudent).mockImplementationOnce(async (_id, input) => {
    await new Promise<void>(resolve => { finish = resolve }); student = { ...student, ...input, updated_at: 'saved' }; return student
  })
  else vi.mocked(updateClass).mockImplementationOnce(async (_id, input) => {
    await new Promise<void>(resolve => { finish = resolve }); tuitionClass = { ...tuitionClass, ...input, updated_at: 'saved' }; return tuitionClass
  })
  setup(kind, { pathname: `/${kind}/a/edit`, state: { contextBack: { to: `/${kind}/a?panel=management`, label: '资料' } } })
  const protection = createFormProtection(document), user = userEvent.setup()
  try {
    const name = await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称')
    fireEvent.change(name, { target: { value: '第一份修改' } })
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    fireEvent.change(name, { target: { value: '稍后的新草稿' } })
    await act(async () => finish())
    expect(screen.getByLabelText(kind === 'students' ? '姓名' : '班级名称')).toBe(name)
    expect(name).toHaveValue('稍后的新草稿')
    expect(screen.getByRole('status')).toHaveTextContent('本次提交已保存，后续修改尚未保存')
    expect(protection.reason()).toContain('未保存')
    const worker = Object.assign(new EventTarget(), { state: 'activated', postMessage: vi.fn() })
    const registration = Object.assign(new EventTarget(), { scope: 'https://example.test/Mr.BlueTuition/', active: worker, waiting: worker, update: vi.fn().mockResolvedValue(undefined) })
    const container = Object.assign(new EventTarget(), { controller: worker, register: vi.fn().mockResolvedValue(registration) })
    const reload = vi.fn()
    const controller = new UpdateController({ baseUrl: registration.scope, buildId: 'A', container: container as unknown as ServiceWorkerContainer, fetchVersion: async () => 'B', online: () => true, blocked: updateProtection.reason, reload, saveConfirmation: vi.fn() })
    try {
      await controller.check(); await controller.apply()
      expect(worker.postMessage).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled()
      expect(controller.state.message).toContain('未保存')
      container.controller = { ...worker } as typeof worker; container.dispatchEvent(new Event('controllerchange'))
      await controller.apply(); expect(reload).not.toHaveBeenCalled()
    } finally { controller.dispose() }
    fireEvent.change(name, { target: { value: '第一份修改' } })
    expect(protection.reason()).toBe('')
    fireEvent.change(name, { target: { value: '最终修改' } })
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    await screen.findByRole('link', { name: '编辑资料' })
    expect(screen.getByTestId('location')).toHaveTextContent(`/${kind}/a?panel=management`)
    expect(kind === 'students' ? student.name : tuitionClass.name).toBe('最终修改')
    expect(protection.reason()).toBe('')
  } finally { protection.dispose() }
})

it.each(['students','classes'] as const)('keeps a failed %s save editable and protected; never retries by itself', async kind => {
  const update = kind === 'students' ? updateStudent : updateClass
  vi.mocked(update).mockRejectedValueOnce(new Error('isolated failure'))
  setup(kind, { pathname: `/${kind}/a/edit` })
  const protection = createFormProtection(document), user = userEvent.setup()
  try {
    const name = await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称')
    fireEvent.change(name, { target: { value: '失败后保留' } })
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(name).toHaveValue('失败后保留'); expect(protection.reason()).toContain('未保存')
    await waitFor(() => expect(screen.getByRole('button', { name: '保存修改' })).toBeEnabled())
    expect(update).toHaveBeenCalledTimes(1)
  } finally { protection.dispose() }
})

it.each(['students','classes'] as const)('%s: rejects leaving during save and asks before discarding a later draft; cancelled departure preserves it', async kind => {
  let finish!: () => void
  if (kind === 'students') vi.mocked(updateStudent).mockImplementationOnce(async (_id, input) => { await new Promise<void>(resolve => { finish = resolve }); return { ...student, ...input } })
  else vi.mocked(updateClass).mockImplementationOnce(async (_id, input) => { await new Promise<void>(resolve => { finish = resolve }); return { ...tuitionClass, ...input } })
  const router = setup(kind, { pathname: `/${kind}/a/edit` }), user = userEvent.setup()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  try {
    const name = await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称')
    fireEvent.change(name, { target: { value: '已提交修改' } }); await user.click(screen.getByRole('button', { name: '保存修改' }))
    await user.click(screen.getByRole('link', { name: '离开编辑' })); expect(router.state.location.pathname).toContain('/edit')
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: '后续草稿' } }); await act(async () => finish())
    await user.click(screen.getByRole('link', { name: '离开编辑' }))
    expect(confirm).toHaveBeenCalledTimes(1); expect(name).toHaveValue('后续草稿'); expect(router.state.location.pathname).toContain('/edit')
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
    confirm.mockReturnValue(true); await user.click(screen.getByRole('link', { name: '离开编辑' }))
    expect(router.state.location.pathname).toBe('/elsewhere')
  } finally { confirm.mockRestore() }
})

it.each(['students','classes'] as const)('%s creation locks fields and duplicate submits until its one successful return', async kind => {
  let finish!: () => void
  if (kind === 'students') vi.mocked(createStudent).mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }); return { ...student, id: 'created' } })
  else vi.mocked(createClass).mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }); return { ...tuitionClass, id: 'created' } })
  const router = setup(kind, { pathname: `/${kind}/new` }), user = userEvent.setup()
  const name = await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称')
  fireEvent.change(name, { target: { value: '新增虚构对象' } })
  if (kind === 'classes') await user.selectOptions(screen.getByLabelText('科目'), 'subject')
  await user.click(screen.getByRole('button', { name: kind === 'students' ? '新增学生' : '新增班级' }))
  expect(name).toBeDisabled(); fireEvent.submit(name.closest('form')!)
  expect(kind === 'students' ? createStudent : createClass).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(router.state.location.pathname).toBe(`/${kind}/created`)
})

it.each(['students','classes'] as const)('%s background refresh failure cannot unmount an unsaved form', async kind => {
  const router = setup(kind, { pathname: `/${kind}/a/edit` })
  const name = await screen.findByLabelText(kind === 'students' ? '姓名' : '班级名称')
  fireEvent.change(name, { target: { value: '刷新失败后保留的草稿' } })
  if (kind === 'students') vi.mocked(getStudent).mockRejectedValueOnce(new Error('read failed'))
  else vi.mocked(getClass).mockRejectedValueOnce(new Error('read failed'))
  await act(async () => router.queryClient.refetchQueries({ queryKey: [kind === 'students' ? 'student' : 'class', 'a'] }))
  expect(await screen.findByText(/刷新失败，当前编辑已保留/)).toBeVisible()
  expect(screen.getByLabelText(kind === 'students' ? '姓名' : '班级名称')).toBe(name)
  expect(name).toHaveValue('刷新失败后保留的草稿')
})
