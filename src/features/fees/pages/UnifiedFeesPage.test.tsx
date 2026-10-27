import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createFormProtection } from '../../settings/pwa/updateProtection'
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import { MonthlyFeesPage } from './MonthlyFeesPage'
import * as fees from '../api/feesService'
import * as temporary from '../api/temporaryFeesService'
import * as payment from '../../temporary-classes/api/temporaryClassesService'
import type { MonthlyFeeDetails } from '../../../types/domain'
vi.mock('../api/feesService', () => ({ ensureMonthlyFees: vi.fn(), listMonthlyFees: vi.fn(), getMonthlyFee: vi.fn(), markMonthlyFeePaid: vi.fn(), undoMonthlyFeePayment: vi.fn(), updateMonthlyFeeAmount: vi.fn(), waiveMonthlyFee: vi.fn() }))
vi.mock('../api/temporaryFeesService', () => ({ listTemporaryFeeRecords: vi.fn(), listTemporaryFeeClasses: vi.fn(), getTemporaryFeeRecord: vi.fn() }))
vi.mock('../../classes/api/classesService', () => ({ listClasses: vi.fn(async () => [{ id: 'same', name: '同名班', status: 'active' }]) }))
vi.mock('../../temporary-classes/api/temporaryClassesService', () => ({ markTemporaryClassPaymentPaid: vi.fn(), undoTemporaryClassPayment: vi.fn(), updateTemporaryClassPaymentAmount: vi.fn() }))
const monthRow = { id: 'same', owner_id: 'owner', student_id: 's', enrollment_id: 'm-e', fee_month: '2026-10-01', normal_amount: 70, actual_amount: 70, payment_status: 'unpaid', receipt_status: 'not_applicable', paid_at: null, created_at: '', updated_at: '', receipt_completed_at: null, student: { id: 's', name: '虚构蓝同学', phone: null, school_class: null }, enrollment: { class_id: 'same', id: 'm-e', join_date: '', end_date: null, status: 'active', class: { id: 'same', name: '同名班', status: 'active' } } } as MonthlyFeeDetails
const oneOff = (): temporary.TemporaryFeeRecord => ({ payment: { id: 'same', owner_id: 'owner', temporary_class_enrollment_id: 't-e', amount: 30, payment_status: 'unpaid', paid_at: null, receipt_status: 'not_applicable', receipt_completed_at: null, created_at: '', updated_at: '' }, enrollment: { id: 't-e', owner_id: 'owner', temporary_class_id: 'same', student_id: 's', student: monthRow.student, status: 'active', joined_at: '', created_at: '' }, class: { id: 'same', name: '同名班', start_at: '2025-01-01T10:00:00Z', status: 'active' } })
let tempRows: temporary.TemporaryFeeRecord[], monthlyRows: MonthlyFeeDetails[]
beforeEach(() => {
  vi.resetAllMocks(); tempRows = [oneOff()]; monthlyRows = [structuredClone(monthRow)]
  vi.mocked(fees.ensureMonthlyFees).mockResolvedValue({ created_count: 0 })
  vi.mocked(fees.listMonthlyFees).mockImplementation(async () => structuredClone(monthlyRows))
  vi.mocked(fees.getMonthlyFee).mockImplementation(async id => structuredClone(monthlyRows.find(row => row.id === id)!))
  vi.mocked(temporary.listTemporaryFeeRecords).mockImplementation(async filters => structuredClone(tempRows.filter(row => filters.month === 'all' || row.payment.payment_status === 'unpaid' || row.payment.paid_at?.startsWith(filters.month))))
  vi.mocked(temporary.getTemporaryFeeRecord).mockImplementation(async id => structuredClone(tempRows.find(row => row.payment.id === id)!))
  vi.mocked(temporary.listTemporaryFeeClasses).mockResolvedValue([oneOff().class, { id: 'ended', name: '已结束班', status: 'ended', start_at: '2025-01-01' }])
  vi.mocked(payment.markTemporaryClassPaymentPaid).mockImplementation(async id => { const row = tempRows.find(r => r.payment.id === id)!; row.payment = { ...row.payment, payment_status: 'paid', receipt_status: 'pending', paid_at: '2026-10-19T00:00:00Z' }; return structuredClone(row.payment) })
  vi.mocked(fees.markMonthlyFeePaid).mockImplementation(async id => { const row = monthlyRows.find(r => r.id === id)!; Object.assign(row, { payment_status: 'paid', receipt_status: 'pending', paid_at: '2026-10-19T00:00:00Z' }); return row })
})
function setup(url = '/fees?month=2026-10', staleTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime, retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '/fees', element: <><Link to="/elsewhere">离开学费</Link><MonthlyFeesPage view="current" /></> }, { path: '*', element: <p>其他页面</p> }], { initialEntries: [url] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return Object.assign(client, { router })
}
it('shows both original IDs and pays each through its existing RPC, independently', async () => {
  const client = setup(); const user = userEvent.setup()
  expect(await screen.findByText('单次')).toBeVisible()
  await waitFor(() => expect(screen.getAllByText('虚构蓝同学')).toHaveLength(2))
  const tempCard = screen.getByText('单次').closest('article')!
  await user.click(within(tempCard).getByRole('button', { name: '确认已缴' }))
  await waitFor(() => expect(screen.queryByText('单次')).not.toBeInTheDocument())
  expect(payment.markTemporaryClassPaymentPaid).toHaveBeenCalledExactlyOnceWith('same')
  expect(fees.markMonthlyFeePaid).not.toHaveBeenCalled()
  client.setQueryData(['receipt-queue', 'pending'], [])
  await user.click(screen.getByRole('button', { name: '确认已缴' }))
  await waitFor(() => expect(screen.queryByText('虚构蓝同学')).not.toBeInTheDocument())
  expect(fees.markMonthlyFeePaid).toHaveBeenCalledExactlyOnceWith('same')
  expect(client.getQueryState(['receipt-queue', 'pending'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['monthly-fees-generation', '2026-10-01'])?.isInvalidated).toBe(false)
})

it('starts three payments without a page lock and retains their original slots through reverse-order confirmation', async () => {
  monthlyRows = ['a','b','c'].map(id => ({ ...structuredClone(monthRow), id, student: { ...monthRow.student!, id, name: `虚构${id}` } }))
  const finishes = new Map<string, () => void>()
  vi.mocked(fees.markMonthlyFeePaid).mockImplementation(id => new Promise(resolve => { finishes.set(id, () => { const row = monthlyRows.find(item => item.id === id)!; row.payment_status='paid';row.receipt_status='pending';resolve({...row}) }) }))
  setup('/fees?month=2026-10&classId=monthly:same')
  await screen.findByText('虚构c')
  for (const id of ['a','b','c']) fireEvent.click(within(screen.getByText(`虚构${id}`).closest('article')!).getByRole('button',{name:'确认已缴'}))
  expect(fees.markMonthlyFeePaid).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('combobox',{name:'班级'})).toBeEnabled()
  for (const id of ['c','b','a']) await act(async () => finishes.get(id)!())
  expect([...document.querySelectorAll('[data-fee-key]')].map(node=>node.getAttribute('data-fee-key'))).toEqual(['monthly_fee:a','monthly_fee:b','monthly_fee:c'])
  await waitFor(()=>{ for (const id of ['a','b','c']) expect(screen.queryByText(`虚构${id}`)).not.toBeInTheDocument() },{timeout:2000})
  expect(fees.ensureMonthlyFees).toHaveBeenCalledTimes(1)
})

it('keeps a verified paid record after a lost response, and never automatically replays collection', async () => {
  vi.mocked(fees.markMonthlyFeePaid).mockImplementationOnce(async () => { monthlyRows[0].payment_status='paid';monthlyRows[0].receipt_status='pending'; throw new TypeError('Failed to fetch') })
  setup('/fees?month=2026-10&classId=monthly:same')
  await userEvent.setup().click(await screen.findByRole('button',{name:'确认已缴'}))
  expect(await screen.findByText(/最新记录已缴/)).toBeVisible()
  expect(fees.getMonthlyFee).toHaveBeenCalledWith('same');expect(fees.markMonthlyFeePaid).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button',{name:'确认已缴'})).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button',{name:'已核对，关闭'}))
  await waitFor(()=>expect(screen.queryByText('虚构蓝同学')).not.toBeInTheDocument())
})

it('preserves a confirmed payment when list refresh fails and retries only the read', async () => {
  setup('/fees?month=2026-10&classId=monthly:same');await screen.findByText('虚构蓝同学')
  vi.mocked(fees.listMonthlyFees).mockRejectedValueOnce(new Error('isolated refresh failed'))
  await userEvent.setup().click(screen.getByRole('button',{name:'确认已缴'}))
  expect(await screen.findByText(/已确认缴费；列表刷新失败/)).toBeVisible()
  expect(screen.getByText('已缴 · 收据待处理')).toBeVisible()
  await userEvent.setup().click(screen.getByRole('button',{name:'重试刷新'}))
  await waitFor(()=>expect(screen.queryByText('虚构蓝同学')).not.toBeInTheDocument(),{timeout:2000})
  expect(fees.markMonthlyFeePaid).toHaveBeenCalledTimes(1)
})
it('temporary-only scope never generates monthly fees or exposes monthly reminders', async () => {
  tempRows[0].class.status = 'ended'; setup('/fees?month=2026-10&classId=temporary:same')
  expect(await screen.findByText('单次')).toBeVisible()
  expect(fees.ensureMonthlyFees).not.toHaveBeenCalled(); expect(fees.listMonthlyFees).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '批量提醒' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'WhatsApp 提醒' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '修改金额' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认已缴' })).toBeEnabled()
  expect(screen.getByRole('group', { name: '临时班' })).toHaveTextContent('已结束班')
})
it('failed source is explicit, counts are unknown, partial records remain and retry recovers', async () => {
  vi.mocked(temporary.listTemporaryFeeRecords).mockRejectedValueOnce(new Error('offline')); setup()
  expect(await screen.findByText(/临时班费用载入失败/)).toBeVisible()
  expect(await screen.findByText('虚构蓝同学')).toBeVisible()
  expect(screen.getByRole('button', { name: /未缴 —/ })).toBeVisible()
  expect(screen.queryByText(/目前没有.*缴费/)).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: '重试临时班费用' }))
  expect(await screen.findByText('单次')).toBeVisible(); expect(screen.getByRole('button', { name: /未缴 2/ })).toBeVisible()
})
it('search and counts share the same range, and legacy feeId excludes temporary payment with same ID', async () => {
  setup('/fees?month=2026-10&feeId=same')
  await screen.findByText('虚构蓝同学'); expect(screen.queryByText('单次')).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: '显示此范围全部缴费记录' }))
  await screen.findByText('单次'); fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在' } })
  await screen.findByText('找不到符合搜索的学生。'); expect(screen.getByRole('button', { name: /未缴 0/ })).toBeVisible()
})
it('late responses cannot show the prior class in a new temporary-only range', async () => {
  let finish!: (rows: temporary.TemporaryFeeRecord[]) => void
  vi.mocked(temporary.listTemporaryFeeRecords).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue([])
  setup(); await screen.findByText('虚构蓝同学')
  await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: '班级' }), 'temporary:ended')
  await screen.findByText('目前筛选范围没有需要显示的缴费记录。')
  await act(async () => finish([oneOff()])); expect(screen.queryByText('单次')).not.toBeInTheDocument()
})
it('retains a newer amount draft and locks filters while saving instead of losing input', async () => {
  setup('/fees?month=2026-10&classId=temporary:same'); const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '修改金额' }))
  const input = screen.getByRole('spinbutton', { name: '应缴金额' }); fireEvent.change(input, { target: { value: '20' } })
  let finish!: () => void
  vi.mocked(payment.updateTemporaryClassPaymentAmount).mockImplementationOnce(() => new Promise(resolve => { finish = () => { tempRows[0].payment.amount = 20; resolve({ ...tempRows[0].payment }) } }))
  fireEvent.submit(input.closest('form')!); await screen.findByRole('button', { name: '保存中…' })
  expect(screen.getByRole('combobox', { name: '班级' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '10' } }); await act(async () => finish())
  await waitFor(() => expect(screen.getByRole('button', { name: '保存金额' })).toBeEnabled())
  expect(input).toHaveValue(10); expect(screen.getByRole('combobox', { name: '班级' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '取消' }))
  expect(await screen.findByText('RM20')).toBeVisible(); expect(screen.getByRole('combobox', { name: '班级' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '修改金额' })).toHaveFocus()
})
it('reads fresh temporary payments on focus without running monthly generation', async () => {
  setup('/fees?month=2026-10&classId=temporary:same'); await screen.findByText('RM30')
  tempRows[0].payment.amount = 31
  try {
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
    expect(await screen.findByText('RM31')).toBeVisible()
    expect(fees.ensureMonthlyFees).not.toHaveBeenCalled()
  } finally { focusManager.setFocused(undefined) }
})

it.each(['focus', 'reconnect'] as const)('retains the same monthly editor and protected draft when %s refresh removes an unpaid match', async event => {
  const client = setup('/fees?month=2026-10&classId=monthly:same'), user = userEvent.setup()
  const protection = createFormProtection(document)
  try {
    await user.click(await screen.findByRole('button', { name: '修改本月金额' }))
    const input = screen.getByRole('spinbutton', { name: /本月实际收费/ })
    fireEvent.change(input, { target: { value: '25.50' } })
    monthlyRows[0] = { ...monthlyRows[0], payment_status: 'paid', receipt_status: 'pending', paid_at: '2026-10-27T00:00:00Z' }
    const reads = vi.mocked(fees.listMonthlyFees).mock.calls.length
    await act(async () => {
      if (event === 'focus') { focusManager.setFocused(false); focusManager.setFocused(true) }
      else { onlineManager.setOnline(false); onlineManager.setOnline(true) }
    })
    await screen.findByText('已缴 · 收据待处理')
    expect(vi.mocked(fees.listMonthlyFees).mock.calls.length).toBeGreaterThan(reads)
    expect(screen.getByRole('spinbutton')).toBe(input); expect(input).toHaveValue(25.5)
    expect(screen.getByRole('button', { name: '保存金额' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '班级' })).toBeDisabled()
    expect(protection.reason()).toContain('未保存')
    expect(fees.ensureMonthlyFees).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument())
    expect(screen.queryByText('虚构蓝同学')).not.toBeInTheDocument()
    expect(protection.reason()).toBe('')
    expect(client.isMutating()).toBe(0)
  } finally { protection.dispose(); focusManager.setFocused(undefined); onlineManager.setOnline(true) }
})

it('keeps a newer monthly draft through the real list save/refetch and closes only after its own save', async () => {
  setup('/fees?month=2026-10&classId=monthly:same'); const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '修改本月金额' }))
  const input = screen.getByRole('spinbutton', { name: /本月实际收费/ })
  let finish!: () => void
  vi.mocked(fees.updateMonthlyFeeAmount).mockImplementationOnce(async (_id, amount) => {
    await new Promise<void>(resolve => { finish = resolve }); monthlyRows[0].actual_amount = amount; return { ...monthlyRows[0] }
  })
  fireEvent.change(input, { target: { value: '25.50' } }); await user.click(screen.getByRole('button', { name: '保存金额' }))
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '28.80' } }); await act(async () => finish())
  expect(await screen.findByText('本次提交已保存，后续修改尚未保存')).toBeVisible()
  expect(screen.getByRole('spinbutton')).toBe(input); expect(input).toHaveValue(28.8)
  expect(monthlyRows[0].actual_amount).toBe(25.5)
  expect(screen.getByRole('searchbox')).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '取消' }))
  expect(await screen.findByText('本月 RM25.50')).toBeVisible()
  expect(screen.getByRole('searchbox')).toBeEnabled()
  expect(fees.ensureMonthlyFees).toHaveBeenCalledTimes(1)
})

it('cannot unmount a monthly draft through navigation or browser close without explicit discard', async () => {
  const client = setup('/fees?month=2026-10&classId=monthly:same'), user = userEvent.setup()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  try {
    await user.click(await screen.findByRole('button', { name: '修改本月金额' }))
    const input = screen.getByRole('spinbutton'); fireEvent.change(input, { target: { value: '28.80' } })
    await user.click(screen.getByRole('link', { name: '离开学费' }))
    expect(confirm).toHaveBeenCalledTimes(1); expect(client.router.state.location.pathname).toBe('/fees')
    expect(input).toHaveValue(28.8)
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('link', { name: '离开学费' }))
    expect(client.router.state.location.pathname).toBe('/elsewhere'); expect(confirm).toHaveBeenCalledTimes(1)
  } finally { confirm.mockRestore() }
})

it.each(['2026-10-20T00:00:00Z', '2026-11-01T00:00:00Z'])('keeps the original editor after a rejected save and paid refresh at %s', async paidAt => {
  const client = setup('/fees?month=2026-10&classId=temporary:same'), protection = createFormProtection(document), user = userEvent.setup()
  try {
    await user.click(await screen.findByRole('button', { name: '修改金额' }))
    const input = screen.getByRole('spinbutton', { name: '应缴金额' })
    fireEvent.change(input, { target: { value: '25.50' } })
    await waitFor(() => expect(client.isFetching()).toBe(0))
    tempRows[0].payment = { ...tempRows[0].payment, payment_status: 'paid', receipt_status: 'pending', paid_at: paidAt }
    vi.mocked(payment.updateTemporaryClassPaymentAmount).mockRejectedValueOnce({ message: 'Only unpaid temporary class payments can be changed' })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('状态已更新'))
    expect(input).toBeInTheDocument(); expect(input).toHaveValue(25.5)
    expect(within(screen.getByText('单次').closest('article')!).getByText('已缴', { exact: true })).toBeVisible()
    expect(screen.getByRole('button', { name: '保存金额' })).toBeDisabled()
    expect(protection.reason()).not.toBe('')
    expect(screen.getByRole('button', { name: /未缴 0/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByText('单次')).not.toBeInTheDocument())
    expect(protection.reason()).toBe('')
    expect(screen.getByRole('combobox', { name: '班级' })).toBeEnabled()
    expect(payment.updateTemporaryClassPaymentAmount).toHaveBeenCalledExactlyOnceWith('same', 'same', 25.5)
    expect(fees.ensureMonthlyFees).not.toHaveBeenCalled()
  } finally { protection.dispose() }
})
it.each([
  ['focus', '2026-10-20T00:00:00Z'], ['focus', '2026-11-01T00:00:00Z'],
  ['reconnect', '2026-10-20T00:00:00Z'], ['reconnect', '2026-11-01T00:00:00Z'],
])('retains the same draft on %s when paid_at is %s and removes it only on cancel', async (trigger, paidAt) => {
  const client = setup('/fees?month=2026-10&classId=temporary:same'), protection = createFormProtection(document), user = userEvent.setup()
  try {
    await user.click(await screen.findByRole('button', { name: '修改金额' }))
    const input = screen.getByRole('spinbutton', { name: '应缴金额' })
    fireEvent.change(input, { target: { value: '25.50' } })
    await waitFor(() => expect(client.isFetching()).toBe(0))
    tempRows[0].payment = { ...tempRows[0].payment, payment_status: 'paid', receipt_status: 'pending', paid_at: paidAt }
    await act(async () => {
      if (trigger === 'focus') { focusManager.setFocused(false); focusManager.setFocused(true) }
      else { onlineManager.setOnline(false); onlineManager.setOnline(true) }
    })
    await waitFor(() => expect(within(screen.getByText('单次').closest('article')!).getByText('已缴', { exact: true })).toBeVisible())
    expect(screen.getByRole('spinbutton', { name: '应缴金额' })).toBe(input)
    expect(input).toHaveValue(25.5)
    expect(screen.getByRole('button', { name: '保存金额' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('已缴')
    expect(protection.reason()).not.toBe('')
    await user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByText('单次')).not.toBeInTheDocument())
    expect(protection.reason()).toBe('')
    expect(fees.ensureMonthlyFees).not.toHaveBeenCalled()
    expect(payment.updateTemporaryClassPaymentAmount).not.toHaveBeenCalled()
  } finally { protection.dispose(); focusManager.setFocused(undefined); onlineManager.setOnline(true) }
})
it('preserves the editor and blocks amount writes when its exact-payment recheck fails, then retries', async () => {
  const client = setup('/fees?month=2026-10&classId=temporary:same')
  const protection = createFormProtection(document), user = userEvent.setup()
  try {
    await user.click(await screen.findByRole('button', { name: '修改金额' }))
    const input = screen.getByRole('spinbutton', { name: '应缴金额' })
    fireEvent.change(input, { target: { value: '25.50' } })
    await waitFor(() => expect(client.isFetching()).toBe(0))
    vi.mocked(temporary.getTemporaryFeeRecord).mockRejectedValueOnce(new Error('isolated recheck failure'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['temporary-fees', 'editing'] }) })
    await screen.findByRole('button', { name: '重试当前费用' })
    expect(input).toBeInTheDocument(); expect(screen.getByRole('button', { name: '保存金额' })).toBeDisabled()
    expect(protection.reason()).not.toBe('')
    await user.click(screen.getByRole('button', { name: '重试当前费用' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存金额' })).toBeEnabled())
    expect(screen.getByRole('spinbutton', { name: '应缴金额' })).toBe(input)
    expect(payment.updateTemporaryClassPaymentAmount).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(protection.reason()).toBe('')
  } finally { protection.dispose() }
})

it('does not resurrect the stale unpaid row on cancel when only the exact-payment query refreshed', async () => {
  const client = setup('/fees?month=2026-10&classId=temporary:same', 30_000), user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '修改金额' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '应缴金额' }), { target: { value: '25.50' } })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  tempRows[0].payment = { ...tempRows[0].payment, payment_status: 'paid', receipt_status: 'pending', paid_at: '2026-11-01T00:00:00Z' }
  try {
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
    await screen.findByRole('alert')
    expect(within(screen.getByText('单次').closest('article')!).getByText('已缴', { exact: true })).toBeVisible()
    expect(temporary.listTemporaryFeeRecords).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /未缴 0/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByText('单次')).not.toBeInTheDocument())
    expect(fees.ensureMonthlyFees).not.toHaveBeenCalled()
  } finally { focusManager.setFocused(undefined) }
})
it('a cancelled enrollment retains its original editor, amount and PWA protection until explicit cancel, without resurrecting debt', async () => {
  const client = setup('/fees?month=2026-10&classId=temporary:same', 30_000), user = userEvent.setup(), protection = createFormProtection(document)
  try {
    await user.click(await screen.findByRole('button', { name: '修改金额' }))
    const input = screen.getByRole('spinbutton', { name: '应缴金额' })
    fireEvent.change(input, { target: { value: '25.50' } })
    await waitFor(() => expect(client.isFetching()).toBe(0))
    tempRows[0].enrollment.status = 'cancelled'
    tempRows[0].enrollment.cancelled_at = '2026-11-01T00:00:00Z'
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
    expect(await screen.findByText(/报名已取消，不能修改原费用/)).toBeVisible()
    expect(input).toBeInTheDocument(); expect(input).toHaveValue(25.5)
    expect(screen.getByRole('button', { name: '保存金额' })).toBeDisabled()
    expect(protection.reason()).not.toBe('')
    expect(screen.getByRole('button', { name: /未缴 0/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByText('单次')).toBeNull())
    expect(protection.reason()).toBe(''); expect(fees.ensureMonthlyFees).not.toHaveBeenCalled()
  } finally { focusManager.setFocused(undefined); protection.dispose() }
})
