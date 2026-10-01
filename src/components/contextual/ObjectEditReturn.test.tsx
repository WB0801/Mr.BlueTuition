import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path={`/${kind}/a`} element={<Detail kind={kind} />} />
    <Route path={`/${kind}/:${kind === 'students' ? 'studentId' : 'classId'}/edit`} element={kind === 'students' ? <StudentFormPage /> : <ClassFormPage />} />
    <Route path={`/${kind}/new`} element={kind === 'students' ? <StudentFormPage /> : <ClassFormPage />} />
    <Route path="*" element={<Probe />} />
  </Routes></MemoryRouter></QueryClientProvider>)
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
