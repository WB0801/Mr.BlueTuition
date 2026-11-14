import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useLayoutEffect } from 'react'
import { MonthlyFeesPage } from './MonthlyFeesPage'
import * as fees from '../api/feesService'
import type { MonthlyFeeDetails } from '../../../types/domain'

vi.mock('../../classes/api/classesService', () => ({ listClasses: vi.fn(async () => [{ id: 'class-a', name: '虚构班甲', status: 'active' }, { id: 'class-b', name: '虚构班乙', status: 'active' }]) }))
vi.mock('../api/temporaryFeesService', () => ({ listTemporaryFeeRecords: vi.fn(async () => []), listTemporaryFeeClasses: vi.fn(async () => []) }))
vi.mock('../api/feesService', () => ({
  ensureMonthlyFees: vi.fn(async () => ({ created_count: 0 })), listMonthlyFees: vi.fn(),
  markMonthlyFeePaid: vi.fn(), undoMonthlyFeePayment: vi.fn(), updateMonthlyFeeAmount: vi.fn(),
  waiveMonthlyFee: vi.fn(), cancelMonthlyFee: vi.fn(), restoreMonthlyFee: vi.fn(),
}))

const rows = ['周同学', '李同学'].map((name, index) => ({
  id: `fee-${index}`, owner_id: 'fictional-owner', student_id: `student-${index}`, enrollment_id: `enrollment-${index}`,
  fee_month: '2026-10-01', normal_amount: 40, actual_amount: 40, payment_status: 'unpaid',
  receipt_status: 'not_applicable', paid_at: null, receipt_completed_at: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  student: { id: `student-${index}`, name, school_class: '虚构学校班', phone: null },
  enrollment: { id: `enrollment-${index}`, class_id: 'class-a', join_date: '2026-01-01', end_date: null, status: 'active', class: { id: 'class-a', name: '虚构班甲', status: 'active' } },
})) as MonthlyFeeDetails[]

let locations: string[]
let navigate: ReturnType<typeof useNavigate>
function Probe() {
  const location = useLocation()
  const currentNavigate = useNavigate()
  useLayoutEffect(() => { navigate = currentNavigate; locations.push(location.pathname + location.search) }, [location, currentNavigate])
  return <><output data-testid="url">{location.pathname + location.search}</output><output data-testid="source">{JSON.stringify(location.state)}</output></>
}
async function setup(query = 'month=2026-10&status=unpaid', source: unknown = null) {
  window.history.replaceState({ usr: source }, '', `/#/fees?${query}`)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><HashRouter><Routes>
    <Route path="/fees" element={<MonthlyFeesPage view="current" />} />
    <Route path="/elsewhere" element={<p>虚构其他页面</p>} />
  </Routes><Probe /></HashRouter></QueryClientProvider>)
  await waitFor(() => expect(fees.listMonthlyFees).toHaveBeenCalled())
  const input = screen.getByRole('searchbox') as HTMLInputElement
  input.focus()
  return input
}
function params() { return new URLSearchParams(window.location.hash.split('?')[1]) }
function inputValue(input: HTMLInputElement, value: string, isComposing = false) {
  fireEvent.input(input, { target: { value }, isComposing, inputType: isComposing ? 'insertCompositionText' : 'insertText' })
}
beforeEach(() => {
  vi.clearAllMocks(); locations = []
  vi.mocked(fees.listMonthlyFees).mockResolvedValue(structuredClone(rows))
})
afterEach(() => { window.history.replaceState(null, '', '/') })

it.each(['input-before-end', 'input-after-end'] as const)('commits only the final Chinese with %s, retaining the input node and focus', async order => {
  const input = await setup()
  await screen.findByText('李同学')
  const initial = locations.length
  fireEvent.compositionStart(input)
  for (const value of ['z', 'zh', 'zho', 'zhou']) {
    inputValue(input, value, true)
    expect(input).toHaveValue(value)
    expect(params().has('q')).toBe(false)
    expect(screen.getByText('李同学')).toBeVisible()
  }
  expect(locations).toHaveLength(initial)
  if (order === 'input-before-end') inputValue(input, '周')
  fireEvent.compositionEnd(input, { data: '周', target: { value: '周' } })
  if (order === 'input-after-end') inputValue(input, '周')
  await waitFor(() => expect(params().get('q')).toBe('周'))
  expect(locations.slice(initial)).toEqual(['/fees?month=2026-10&status=unpaid&q=%E5%91%A8'])
  expect(screen.getByRole('searchbox')).toBe(input)
  expect(input).toHaveFocus(); expect(input).toHaveValue('周')
  expect(screen.queryByText('李同学')).not.toBeInTheDocument()
  expect(fees.ensureMonthlyFees).toHaveBeenCalledTimes(1)
  expect(fees.listMonthlyFees).toHaveBeenCalledTimes(1)
  for (const method of [fees.markMonthlyFeePaid, fees.undoMonthlyFeePayment, fees.updateMonthlyFeeAmount, fees.waiveMonthlyFee, fees.cancelMonthlyFee, fees.restoreMonthlyFee]) expect(method).not.toHaveBeenCalled()
})

it('handles native composing input even before compositionstart has been observed', async () => {
  const input = await setup()
  inputValue(input, 'zhou', true)
  expect(params().has('q')).toBe(false)
  fireEvent.compositionEnd(input, { data: '周', target: { value: '周' } })
  await waitFor(() => expect(params().get('q')).toBe('周'))
})

it('does not get stuck composing when a duplicate final input still carries isComposing', async () => {
  const input = await setup()
  fireEvent.compositionStart(input); inputValue(input, 'zhou', true)
  fireEvent.compositionEnd(input, { data: '周', target: { value: '周' } })
  inputValue(input, '周', true)
  inputValue(input, '周123')
  await waitFor(() => expect(params().get('q')).toBe('周123'))
})

it('supports consecutive candidates, editing and deleting pinyin without submitting intermediate text', async () => {
  const input = await setup()
  for (const [intermediate, final] of [[['z', 'zh', 'z', '', 'zhou'], '周'], [['周t', '周tong', '周tongxue'], '周同学']] as const) {
    const initial = locations.length
    fireEvent.compositionStart(input)
    for (const value of intermediate) inputValue(input, value, true)
    expect(locations).toHaveLength(initial)
    fireEvent.compositionEnd(input, { target: { value: final }, data: final })
    inputValue(input, final)
    await waitFor(() => expect(params().get('q')).toBe(final))
    expect(locations).toHaveLength(initial + 1)
  }
  expect(input).toHaveValue('周同学'); expect(input).toHaveFocus()
})

it('keeps ordinary letters, numbers, paste, deletion and clearing immediate', async () => {
  const input = await setup()
  for (const value of ['abc', 'abc123', '周同学', '周同', '周', '']) {
    inputValue(input, value)
    expect(input).toHaveValue(value)
    await waitFor(() => expect(params().get('q') ?? '').toBe(value))
  }
  expect(params().has('q')).toBe(false)
  expect(input).toHaveFocus()
})

it('preserves URL scopes and source state, removing feeId only when search is committed', async () => {
  const source = { contextBack: { to: '/students/student-0', label: '学生' } }
  const input = await setup('month=all&classId=monthly%3Aclass-a&studentId=student-0&feeId=fee-0&status=all', source)
  fireEvent.compositionStart(input); inputValue(input, 'zhou', true)
  expect(params().get('feeId')).toBe('fee-0')
  fireEvent.compositionEnd(input, { target: { value: '周' }, data: '周' })
  await waitFor(() => expect(params().get('q')).toBe('周'))
  expect(Object.fromEntries(params())).toEqual({ month: 'all', classId: 'monthly:class-a', studentId: 'student-0', status: 'all', q: '周' })
  expect(JSON.parse(screen.getByTestId('source').textContent!)).toEqual(source)
})

it('restores direct URL searches, browser-style return and later external changes', async () => {
  let input = await setup('month=2026-10&q=%E5%91%A8')
  expect(input).toHaveValue('周')
  await act(async () => navigate('/elsewhere'))
  await act(async () => navigate(-1))
  input = await screen.findByRole('searchbox') as HTMLInputElement
  expect(input).toHaveValue('周')
  await act(async () => navigate('/fees?month=2026-09&classId=monthly:class-b&q=%E6%9D%8E&status=all'))
  expect(input).toHaveValue('李')
  inputValue(input, '李同学')
  await waitFor(() => expect(params().get('q')).toBe('李同学'))
  expect(params().get('month')).toBe('2026-09'); expect(params().get('classId')).toBe('monthly:class-b')
})

it('does not allow an old composition completion to overwrite a newly navigated URL', async () => {
  const input = await setup()
  fireEvent.compositionStart(input); inputValue(input, 'zhou', true)
  await act(async () => navigate('/fees?month=2026-09&classId=monthly:class-b&q=%E6%9D%8E&status=paid'))
  const target = window.location.hash
  expect(input).toHaveValue('李')
  fireEvent.compositionEnd(input, { target: { value: '周' }, data: '周' })
  inputValue(input, '周')
  await act(async () => { await Promise.resolve() })
  expect(window.location.hash).toBe(target); expect(input).toHaveValue('李')
  fireEvent.compositionStart(input); inputValue(input, '李tong', true)
  fireEvent.compositionEnd(input, { target: { value: '李同学' }, data: '同学' })
  await waitFor(() => expect(params().get('q')).toBe('李同学'))
  expect(params().get('month')).toBe('2026-09'); expect(params().get('status')).toBe('paid')
})

it.each(['class', 'month', 'status'] as const)('does not overwrite a new %s filter with late composition events', async filter => {
  const input = await setup('month=2026-10&status=all&q=%E5%91%A8')
  fireEvent.compositionStart(input); inputValue(input, '周tong', true)
  if (filter === 'class') fireEvent.change(screen.getByRole('combobox', { name: '班级' }), { target: { value: 'monthly:class-b' } })
  else if (filter === 'month') fireEvent.change(screen.getByLabelText('指定月份'), { target: { value: '2026-09' } })
  else fireEvent.click(screen.getByRole('button', { name: /^未缴 / }))
  const target = window.location.hash
  fireEvent.compositionEnd(input, { target: { value: '周同学' }, data: '同学' }); inputValue(input, '周同学')
  await act(async () => { await Promise.resolve() })
  expect(window.location.hash).toBe(target); expect(params().get('q')).toBe('周')
  expect(input).toHaveValue('周')
})
