import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { FeeRecords } from './FeeRecords'
import { installContextDataInvalidation } from '../../../components/contextual/contextDataInvalidation'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { ensureMonthlyFees, listMonthlyFees, markMonthlyFeePaid } from '../api/feesService'
import * as dates from '../../../utils/format'
vi.mock('../api/feesService', () => ({ ensureMonthlyFees: vi.fn(), listMonthlyFees: vi.fn(), markMonthlyFeePaid: vi.fn(), undoMonthlyFeePayment: vi.fn(), updateMonthlyFeeAmount: vi.fn(), waiveMonthlyFee: vi.fn(), completeReceipts: vi.fn(), restoreReceipt: vi.fn() }))
const rows = [
  { id: 'old', fee_month: '2025-08-01', payment_status: 'paid', receipt_status: 'pending', paid_at: '2025-08-06T05:00:00Z' },
  { id: 'new', fee_month: '2026-09-01', payment_status: 'unpaid', receipt_status: 'not_applicable', paid_at: null },
].map(x => ({ ...x, owner_id: 'owner', student_id: 'a', enrollment_id: 'enrollment-a', normal_amount: 120, actual_amount: 120, receipt_completed_at: null, created_at: '', updated_at: '', student: { id: 'a', name: '学生甲', phone: null, school_class: '高一' }, enrollment: { id: 'enrollment-a', class_id: 'class-a', join_date: '2025-01-01', end_date: null, status: 'active', class: { id: 'class-a', name: '会计甲班', status: 'active' } } })) as MonthlyFeeDetails[]
function Probe() { const location = useLocation(); return <output data-testid="url">{location.pathname + location.search}</output> }
function setup(id = 'a', path = '/students/a?panel=fees') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  installContextDataInvalidation(client)
  const element = (studentId: string) => <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><ContextDataWorkspace key={studentId} defaultPanel="other" label="学生相关资料" sections={[
    { id: 'fees', label: '缴费记录', render: active => <FeeRecords scope={{ studentId }} prefix="fees" active={active} /> },
    { id: 'other', label: '其他资料', render: () => <p>其他栏目</p> },
  ]} /><Probe /></MemoryRouter></QueryClientProvider>
  const result = render(element(id)); return { ...result, client, changeObject: (nextId: string) => result.rerender(element(nextId)) }
}
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.mocked(ensureMonthlyFees).mockResolvedValue({ created_count: 0 }); vi.mocked(listMonthlyFees).mockImplementation(async filters => rows.filter(row => row.student_id === filters?.studentId && (!filters?.feeMonth || row.fee_month === filters.feeMonth))) })
it('keeps object, filters and list while viewing a fee and its receipt, then switching away and back', async () => {
  const user = userEvent.setup(); setup()
  await screen.findByRole('button', { name: /2025年8月.*查看记录/ })
  await user.click(screen.getByRole('button', { name: '已缴' }))
  await user.click(screen.getByRole('button', { name: /2025年8月.*查看记录/ }))
  expect(screen.getByTestId('url')).toHaveTextContent('/students/a?')
  expect(screen.getByRole('heading', { name: '缴费记录详情' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '查看收据详情' }))
  expect(screen.getByRole('heading', { name: '收据详情' })).toBeInTheDocument()
  expect(screen.getByText('待开收据')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '返回缴费详情' }))
  await user.click(screen.getByRole('button', { name: '← 返回缴费记录' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /2025年8月.*查看记录/ })).toHaveFocus())
  expect(screen.getByRole('button', { name: '已缴' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: '其他资料' }))
  await user.click(screen.getByRole('button', { name: '缴费记录' }))
  expect(screen.getByRole('button', { name: '已缴' })).toHaveAttribute('aria-pressed', 'true')
  expect(ensureMonthlyFees).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('显示所有学生')).not.toBeInTheDocument()
})
it('blocks detail close and panel switches until the original payment finishes', async () => {
  let finish!: (value: MonthlyFeeDetails) => void
  vi.mocked(markMonthlyFeePaid).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const user = userEvent.setup(); setup(); await user.click(await screen.findByRole('button', { name: /2026年9月.*查看记录/ }))
  await user.click(screen.getByRole('button', { name: '确认已缴' }))
  expect(screen.getByRole('button', { name: '← 返回缴费记录' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '其他资料' })).toBeDisabled()
  finish({ ...rows[1], payment_status: 'paid', receipt_status: 'pending' })
  await waitFor(() => expect(screen.getByRole('button', { name: '← 返回缴费记录' })).toBeEnabled())
})
it('does not let a delayed first student response overwrite the second student', async () => {
  let late!: (value: MonthlyFeeDetails[]) => void
  vi.mocked(listMonthlyFees).mockImplementation(filters => filters?.studentId === 'a' ? new Promise(resolve => { late = resolve }) : Promise.resolve([{ ...rows[1], id: 'fee-b', student_id: 'b', student: { id: 'b', name: '学生乙', school_class: null, phone: null } }]))
  const page = setup(); await waitFor(() => expect(listMonthlyFees).toHaveBeenCalled())
  page.changeObject('b'); await screen.findByRole('button', { name: /查看记录/ })
  late(rows); await waitFor(() => expect(screen.queryByText('学生甲')).not.toBeInTheDocument())
  await userEvent.setup().click(screen.getByRole('button', { name: /查看记录/ }))
  expect(screen.getByTestId('url')).toHaveTextContent('fees.record=fee-b')
})
it('keeps a failed query distinct from empty results and allows retry without widening scope', async () => {
  vi.mocked(listMonthlyFees).mockRejectedValueOnce(new Error('offline'))
  setup(); expect(await screen.findByText('月费资料载入失败。')).toBeInTheDocument()
  expect(screen.queryByText('目前没有符合筛选的缴费记录。')).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('button', { name: /2025年8月.*查看记录/ })).toBeInTheDocument()
})

it('regenerates fees after enrollment and reads them only after generation, but not after payment or navigation', async () => {
  let added = false; let generated = false
  vi.mocked(ensureMonthlyFees).mockImplementation(async () => { if (added) generated = true; return { created_count: generated ? 1 : 0 } })
  vi.mocked(listMonthlyFees).mockImplementation(async () => [...rows, ...(generated ? [{ ...rows[1], id: 'added-fee', fee_month: '2026-10-01' }] : [])])
  const user = userEvent.setup(); const { client } = setup()
  await screen.findByRole('button', { name: /2025年8月.*查看记录/ })
  await user.click(screen.getByRole('button', { name: '其他资料' }))
  added = true; await client.invalidateQueries({ queryKey: ['enrollments'] })
  await user.click(screen.getByRole('button', { name: '缴费记录' }))
  expect(await screen.findByRole('button', { name: /2026年10月.*查看记录/ })).toBeVisible()
  expect(ensureMonthlyFees).toHaveBeenCalledTimes(2)
  await client.invalidateQueries({ queryKey: ['monthly-fees'] })
  await user.click(screen.getByRole('button', { name: '其他资料' })); await user.click(screen.getByRole('button', { name: '缴费记录' }))
  expect(ensureMonthlyFees).toHaveBeenCalledTimes(2)
})

it('reads an all-months list again after the current-month generation changes', async () => {
  const month = vi.spyOn(dates, 'currentMonthInMalaysia').mockReturnValue('2026-10-01')
  const user = userEvent.setup(); setup(); await screen.findByRole('button', { name: /2025年8月.*查看记录/ })
  await user.click(screen.getByRole('button', { name: '其他资料' })); month.mockReturnValue('2026-11-01')
  await user.click(screen.getByRole('button', { name: '缴费记录' }))
  await waitFor(() => expect(listMonthlyFees).toHaveBeenCalledTimes(2))
  expect(ensureMonthlyFees).toHaveBeenLastCalledWith('2026-11-01')
  month.mockRestore()
})
