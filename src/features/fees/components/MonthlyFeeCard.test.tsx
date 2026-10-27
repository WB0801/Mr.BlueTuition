import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createFormProtection } from '../../settings/pwa/updateProtection'
import { MemoryRouter } from 'react-router-dom'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { updateMonthlyFeeAmount, markMonthlyFeePaid, getMonthlyFee } from '../api/feesService'
import { MonthlyFeeCard } from './MonthlyFeeCard'
import { CollectionList } from '../collection/CollectionList'

vi.mock('../api/feesService', () => ({
  markMonthlyFeePaid: vi.fn(),
  undoMonthlyFeePayment: vi.fn(),
  updateMonthlyFeeAmount: vi.fn(),
  waiveMonthlyFee: vi.fn(),
  getMonthlyFee: vi.fn(),
}))

const fee: MonthlyFeeDetails = {
  id: 'fee-1',
  owner_id: 'owner-1',
  student_id: 'student-1',
  enrollment_id: 'enrollment-1',
  fee_month: '2026-08-01',
  normal_amount: 100,
  actual_amount: 50,
  payment_status: 'unpaid',
  paid_at: null,
  receipt_status: 'not_applicable',
  receipt_completed_at: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  student: { id: 'student-1', name: '陈小明', school_class: '高一商仁', phone: '0123456789' },
  enrollment: {
    id: 'enrollment-1',
    class_id: 'class-1',
    join_date: '2026-08-20',
    end_date: null,
    status: 'active',
    class: { id: 'class-1', name: '高一会计学（1）', status: 'active' },
  },
}

function renderFee(value: MonthlyFeeDetails) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MonthlyFeeCard fee={value} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MonthlyFeeCard', () => {
  beforeEach(() => vi.clearAllMocks())
  it('preserves native summary and label activation inside the real collection list', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CollectionList records={[fee]} recordKey={row => row.id} renderRecord={row => <><MonthlyFeeCard fee={row}/><label><input type="checkbox"/>选择此行</label></>} /></MemoryRouter></QueryClientProvider>)
    const summary = screen.getByLabelText(`更多${fee.student!.name}的学费操作`)
    await user.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    await user.click(screen.getByRole('button',{name:'修改本月金额'}))
    expect(screen.getByRole('spinbutton')).toBeVisible()
    await user.click(screen.getByText('选择此行'))
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
  it('lets a newer authoritative undo supersede the paid outcome and permits a new explicit collection', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const paid = {...fee,payment_status:'paid' as const,receipt_status:'pending' as const,updated_at:'2026-10-27T01:00:00Z'}
    vi.mocked(markMonthlyFeePaid).mockResolvedValue(paid)
    const client = new QueryClient(), content = (value:MonthlyFeeDetails) => <QueryClientProvider client={client}><MemoryRouter><MonthlyFeeCard fee={value}/></MemoryRouter></QueryClientProvider>
    const view = render(content(fee))
    await user.click(screen.getByRole('button',{name:'确认已缴'})); await screen.findByText('已缴 · 收据待处理')
    view.rerender(content({...paid,receipt_status:'completed',updated_at:'2026-10-27T01:01:00Z'}))
    expect(await screen.findByText('已缴 · 收据已处理')).toBeVisible()
    const undone = {...fee,updated_at:'2026-10-27T01:02:00Z'}
    view.rerender(content(undone))
    await user.click(await screen.findByRole('button',{name:'确认已缴'}))
    expect(markMonthlyFeePaid).toHaveBeenCalledTimes(2)
  })
  it('ignores a late paid response after a newer authoritative undo, and ignores older props afterwards', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    let finish!: (row:MonthlyFeeDetails)=>void
    vi.mocked(markMonthlyFeePaid).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    const client = new QueryClient(), content = (value:MonthlyFeeDetails) => <QueryClientProvider client={client}><MemoryRouter><MonthlyFeeCard fee={value}/></MemoryRouter></QueryClientProvider>
    const view=render(content(fee))
    await user.click(screen.getByRole('button',{name:'确认已缴'}))
    const newer={...fee,actual_amount:55,updated_at:'2026-10-27T02:00:00.123457Z'}
    view.rerender(content(newer))
    await act(async()=>finish({...fee,payment_status:'paid',receipt_status:'pending',updated_at:'2026-10-27T02:00:00.123456Z'}))
    expect(screen.getByRole('button',{name:'确认已缴'})).toBeEnabled()
    expect(screen.getByText('本月 RM55')).toBeVisible()
    view.rerender(content({...fee,payment_status:'paid',receipt_status:'pending',updated_at:'2026-10-27T01:00:00Z'}))
    expect(screen.getByRole('button',{name:'确认已缴'})).toBeEnabled()
    expect(screen.getByText('本月 RM55')).toBeVisible()
    expect(markMonthlyFeePaid).toHaveBeenCalledTimes(1)
  })
  it('does not call a lost payment response a definite failure: rechecks the original payment without replaying it', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    vi.mocked(markMonthlyFeePaid).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.mocked(getMonthlyFee).mockResolvedValueOnce({ ...fee, payment_status: 'paid', paid_at: '2026-10-27T01:00:00Z' })
    renderFee(fee)
    await user.click(screen.getByRole('button', { name: '确认已缴' }))
    expect(await screen.findByText(/最新记录已缴/)).toBeVisible()
    expect(screen.queryByText('操作失败，请重试。')).not.toBeInTheDocument()
    expect(markMonthlyFeePaid).toHaveBeenCalledExactlyOnceWith(fee.id)
    expect(getMonthlyFee).toHaveBeenCalledExactlyOnceWith(fee.id)
  })
  it('acknowledges only the submitted amount and retains a later protected draft until a second save', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    let finish!: (row: MonthlyFeeDetails) => void
    vi.mocked(updateMonthlyFeeAmount).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    renderFee(fee)
    const protection = createFormProtection(document)
    try {
      await user.click(screen.getByRole('button', { name: '修改本月金额' }))
      const input = screen.getByRole('spinbutton', { name: /本月实际收费/ })
      fireEvent.change(input, { target: { value: '25.50' } })
      await user.click(screen.getByRole('button', { name: '保存金额' }))
      fireEvent.change(input, { target: { value: '28.80' } })
      await act(async () => finish({ ...fee, actual_amount: 25.5 }))
      expect(screen.getByRole('spinbutton')).toBe(input)
      expect(input).toHaveValue(28.8)
      expect(screen.getByRole('status')).toHaveTextContent('本次提交已保存，后续修改尚未保存')
      expect(protection.reason()).toContain('未保存')
      expect(updateMonthlyFeeAmount).toHaveBeenLastCalledWith(fee.id, 25.5)
      vi.mocked(updateMonthlyFeeAmount).mockResolvedValueOnce({ ...fee, actual_amount: 28.8 })
      await user.click(screen.getByRole('button', { name: '保存金额' }))
      await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument())
      expect(updateMonthlyFeeAmount).toHaveBeenLastCalledWith(fee.id, 28.8)
      expect(protection.reason()).toBe('')
    } finally { protection.dispose() }
  })
  it('shows a join-month override without changing the normal amount', () => {
    renderFee(fee)
    expect(screen.getByText('本月 RM50')).toBeInTheDocument()
    expect(screen.getByText('标准 RM100')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认已缴' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改本月金额' })).toBeInTheDocument()
  })

  it('clearly distinguishes a completed receipt and offers payment undo', () => {
    renderFee({
      ...fee,
      payment_status: 'paid',
      paid_at: '2026-09-05T02:00:00Z',
      receipt_status: 'completed',
      receipt_completed_at: '2026-09-06T02:00:00Z',
    })
    expect(screen.getByText('已缴 · 收据已处理')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销缴费' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认已缴' })).not.toBeInTheDocument()
  })

  it('keeps the amount editor open and explains a save failure', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    vi.mocked(updateMonthlyFeeAmount).mockRejectedValueOnce(new Error('network failed'))
    renderFee(fee)
    await user.click(screen.getByRole('button', { name: '修改本月金额' }))
    const amountInput = screen.getByRole('spinbutton', { name: /本月实际收费/ })
    await user.clear(amountInput)
    await user.type(amountInput, '45')
    await user.click(screen.getByRole('button', { name: '保存金额' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败，请重试')
    expect(screen.getByRole('spinbutton', { name: /本月实际收费/ })).toHaveValue(45)
  })
})
