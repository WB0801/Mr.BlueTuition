import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReceiptsPage } from './ReceiptsPage'
import { listReceiptQueue, listMonthlyFees, completeReceipts, readReceiptStates, restoreReceipt } from '../api/feesService'
import { listTemporaryFeeRecords } from '../api/temporaryFeesService'
import type { ReceiptQueueItem } from '../../../types/domain'
import { ContextBackLink } from '../../../components/navigation/ContextBackLink'
vi.mock('../api/feesService', () => ({
  listReceiptQueue: vi.fn(async (status: string) => status === 'pending' ? [{ receipt_key: 'monthly_fee:fee-a', source_id: 'fee-a', source_type: 'monthly_fee', student_id: 'student-a', student_name: '蓝炜滨', school_class: '高一甲', phone: null, source_name: '会计 A', amount: 120, receipt_period: '2026-08-01', paid_at: '2026-09-01T08:00:00Z' }] : []),
  listMonthlyFees: vi.fn(), completeReceipts: vi.fn(), restoreReceipt: vi.fn(),
  getReceiptPaymentTarget: vi.fn().mockResolvedValue('/fees?studentId=student-a&month=2026-08&status=paid&feeId=fee-a'),
  readReceiptStates: vi.fn().mockResolvedValue([]),
}))
vi.mock('../api/temporaryFeesService', () => ({ listTemporaryFeeRecords: vi.fn(async () => []) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listReceiptQueue).mockImplementation(async status => status === 'pending' ? [{ receipt_key: 'monthly_fee:fee-a', source_id: 'fee-a', source_type: 'monthly_fee', student_id: 'student-a', student_name: '蓝炜滨', school_class: '高一甲', phone: null, source_name: '会计 A', amount: 120, receipt_period: '2026-08-01', paid_at: '2026-09-01T08:00:00Z' }] as ReceiptQueueItem[] : [])
})
it.each([true, false])('shows new receipts in the same month when the former batch retired=%s', async retired => {
  const row = {receipt_key:'monthly_fee:old',source_id:'old',source_type:'monthly_fee',student_id:'old',student_name:'虚构旧收据',source_name:'虚构班',amount:30,receipt_period:'2026-10-01',paid_at:'2026-10-01T00:00:00Z'} as ReceiptQueueItem
  let rows = [row]
  vi.mocked(listReceiptQueue).mockImplementation(async status => status === 'pending' ? rows : [])
  vi.mocked(completeReceipts).mockImplementationOnce(async () => { rows=[];return 1 })
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><MemoryRouter><ReceiptsPage/></MemoryRouter></QueryClientProvider>)
  const user = userEvent.setup(); await user.click(await screen.findByRole('checkbox',{name:'全选'}));await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}))
  if(retired)await screen.findByText('目前没有待开收据。')
  rows=[{...row,receipt_key:'monthly_fee:new',source_id:'new',student_id:'new',student_name:'虚构新收据'}, {...row,receipt_key:'monthly_fee:other',source_id:'other',student_id:'other',student_name:'虚构其他月份',receipt_period:'2026-09-01'}]
  await act(async()=>{await client.invalidateQueries({queryKey:['pending-receipts']})})
  await waitFor(()=>expect(screen.getByRole('checkbox',{name:/选择 虚构新收据/})).toBeVisible())
  expect(screen.getByRole('checkbox',{name:/选择 虚构其他月份/})).toBeVisible()
})
it('unlocks only after read-only verification confirms pending and clears the obsolete lost-response error', async () => {
  vi.mocked(completeReceipts).mockRejectedValueOnce(new TypeError('lost response'))
  let finish!: (rows:{receipt_key:string;receipt_status:string}[])=>void
  vi.mocked(readReceiptStates).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ReceiptsPage/></MemoryRouter></QueryClientProvider>)
  const user=userEvent.setup();await user.click(await screen.findByRole('checkbox',{name:'全选'}));await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}))
  await user.click(await screen.findByRole('button',{name:'核对收据'}))
  expect(screen.getByRole('button',{name:'标记所选收据已处理'})).toBeDisabled()
  await act(async()=>finish([{receipt_key:'monthly_fee:fee-a',receipt_status:'pending'}]))
  await waitFor(()=>expect(screen.getByRole('button',{name:'标记所选收据已处理'})).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox',{name:'全选'})).toBeChecked()
  expect(completeReceipts).toHaveBeenCalledTimes(1)
})
it('does not call an absent receipt pending or allow a write when its latest state is still unknown', async () => {
  vi.mocked(completeReceipts).mockRejectedValueOnce(new TypeError('lost response'))
  vi.mocked(readReceiptStates).mockResolvedValueOnce([])
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ReceiptsPage/></MemoryRouter></QueryClientProvider>)
  const user=userEvent.setup();await user.click(await screen.findByRole('checkbox',{name:'全选'}));await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}))
  await user.click(await screen.findByRole('button',{name:'核对收据'}))
  expect(await screen.findByText(/部分所选收据状态无法核实/)).toBeVisible()
  expect(screen.getByRole('button',{name:'标记所选收据已处理'})).toBeDisabled()
  expect(screen.queryByText(/仍待处理，可明确重试/)).not.toBeInTheDocument()
})
it('restores a receipt processed in this workspace without retaining its completed animation state', async () => {
  let processed = false
  const row = { receipt_key:'monthly_fee:a', source_id:'a', source_type:'monthly_fee', student_id:'a', student_name:'虚构甲', source_name:'虚构班', amount:30, receipt_period:'2026-10-01', paid_at:'2026-10-01T00:00:00Z' } as ReceiptQueueItem
  vi.mocked(listReceiptQueue).mockImplementation(async status => (status === 'completed') === processed ? [row] : [])
  vi.mocked(completeReceipts).mockImplementationOnce(async () => { processed = true; return 1 })
  vi.mocked(restoreReceipt).mockImplementationOnce(async () => { processed = false; return true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox',{name:'全选'}))
  await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}))
  await screen.findByText('目前没有待开收据。')
  await user.click(screen.getByRole('button',{name:'已处理收据'}))
  await user.click(await screen.findByRole('button',{name:'恢复为待处理'}))
  await screen.findByText('已恢复为待处理')
  await user.click(screen.getByRole('button',{name:'待处理收据'}))
  expect(await screen.findByRole('checkbox',{name:'选择 虚构甲 虚构班 2026年10月 收据'})).toBeVisible()
})
it('shows the actual RPC count rather than the number selected', async () => {
  const rows = ['a', 'b'].map(id => ({ receipt_key: `monthly_fee:${id}`, source_id: id, source_type: 'monthly_fee', student_id: id, student_name: `虚构${id}`, source_name: '虚构班', amount: 30, receipt_period: '2026-10-01', paid_at: '2026-10-01T00:00:00Z' })) as ReceiptQueueItem[]
  vi.mocked(listReceiptQueue).mockResolvedValue(rows)
  vi.mocked(completeReceipts).mockResolvedValueOnce(1)
  vi.mocked(readReceiptStates).mockResolvedValueOnce([{ receipt_key: 'monthly_fee:a', receipt_status: 'completed' }, { receipt_key: 'monthly_fee:b', receipt_status: 'completed' }])
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  await screen.findByText('待处理收据 2 张')
  const user = userEvent.setup(); await user.click(screen.getByRole('checkbox', { name: '全选' }))
  await user.click(screen.getByRole('button', { name: '标记所选收据已处理' }))
  expect(await screen.findByText(/本次处理1张/)).toBeVisible()
  expect(screen.queryByText(/失败1张/)).not.toBeInTheDocument()
  expect(readReceiptStates).toHaveBeenCalledWith(['monthly_fee:a','monthly_fee:b'])
})
it('reports zero changed receipts and verifies latest state without inventing failures', async () => {
  const rows=[{receipt_key:'monthly_fee:a',source_id:'a',source_type:'monthly_fee',student_id:'a',student_name:'虚构甲',source_name:'虚构班',amount:30,receipt_period:'2026-10-01',paid_at:'2026-10-01T00:00:00Z'}] as ReceiptQueueItem[]
  let processed=false
  vi.mocked(listReceiptQueue).mockImplementation(async()=>processed?[]:rows)
  vi.mocked(completeReceipts).mockImplementationOnce(async()=>{processed=true;return 0})
  vi.mocked(readReceiptStates).mockResolvedValueOnce([{receipt_key:'monthly_fee:a',receipt_status:'completed'}])
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ReceiptsPage/></MemoryRouter></QueryClientProvider>)
  const user=userEvent.setup();await user.click(await screen.findByRole('checkbox',{name:'全选'}));await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}))
  expect(await screen.findByText(/本次处理0张/)).toBeVisible();expect(screen.queryByText(/失败.*张/)).not.toBeInTheDocument()
  expect(readReceiptStates).toHaveBeenCalledWith(['monthly_fee:a']);expect(completeReceipts).toHaveBeenCalledTimes(1)
})
it('retains selection after an explicit refusal, then keeps a confirmed count when latest-state verification fails', async () => {
  vi.mocked(completeReceipts).mockRejectedValueOnce({code:'P0001',message:'rejected'}).mockResolvedValueOnce(0)
  vi.mocked(readReceiptStates).mockRejectedValueOnce(new Error('read failed'))
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ReceiptsPage/></MemoryRouter></QueryClientProvider>)
  const user=userEvent.setup(), select=await screen.findByRole('checkbox',{name:'全选'});await user.click(select)
  await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}));expect(await screen.findByRole('alert')).toHaveTextContent('被拒绝');expect(select).toBeChecked()
  await user.click(screen.getByRole('button',{name:'标记所选收据已处理'}));expect(await screen.findByText(/本次处理0张.*核对失败/)).toBeVisible()
  expect(screen.getByRole('button',{name:'标记所选收据已处理'})).toBeDisabled();expect(select).toBeChecked()
})
it('links the receipt identity and exact original payment without toggling the checkbox', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/fees/receipts']}><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByRole('link', { name: /蓝炜滨.*高一甲/ })).toHaveAttribute('href', '/students/student-a')
  expect(await screen.findByRole('link', { name: '查看缴费记录' })).toHaveAttribute('href', '/fees?studentId=student-a&month=2026-08&status=paid&feeId=fee-a')
  const checkbox = screen.getByRole('checkbox', { name: /选择.*蓝炜滨/ })
  expect(checkbox).not.toBeChecked()
  await userEvent.setup().click(screen.getByRole('link', { name: '查看缴费记录' }))
  expect(checkbox).not.toBeChecked()
})
it('completed refunded receipts retain history and payment linkage without restore action', async () => {
  vi.mocked(listReceiptQueue).mockResolvedValue([{ receipt_key:'temporary_class_payment:refunded',source_type:'temporary_class_payment',source_id:'refunded',student_id:'s',student_name:'虚构已退费',source_name:'虚构临时班',amount:30.25,receipt_period:'2026-10-01',paid_at:'2026-10-01T00:00:00Z',receipt_completed_at:'2026-10-01T01:00:00Z',cancelled_at:'2026-10-02T00:00:00Z',refunded_amount:30.25,refunded_at:'2026-10-02T00:00:00Z' }] as ReceiptQueueItem[])
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/fees/receipts?completed=1']}><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  const region=screen.getByRole('region',{name:'已处理收据'})
  expect(await within(region).findByText(/已退费 RM30.25/)).toBeVisible()
  expect(within(region).queryByRole('button',{name:'恢复为待处理'})).toBeNull()
  expect(await within(region).findByRole('link',{name:'查看缴费记录'})).toBeVisible()
})
it('restores a historical receipt month and expanded history after a real student round trip', async () => {
  const row = { receipt_key: 'monthly_fee:old-fee', source_id: 'old-fee', source_type: 'monthly_fee', student_id: 'student-a', student_name: '旧月学生', school_class: '高一甲', phone: null, source_name: '会计 A', amount: 120, receipt_period: '2026-06-01', paid_at: '2026-06-01T08:00:00Z', receipt_completed_at: '2026-06-02T08:00:00Z' } as ReceiptQueueItem
  vi.mocked(listReceiptQueue).mockImplementation(async (status, month) => status === 'completed' && month === '2026-06-01' ? [row] : [])
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/fees/receipts']}><Routes><Route path="/fees/receipts" element={<ReceiptsPage />} /><Route path="/students/:studentId" element={<ContextBackLink />} /></Routes></MemoryRouter></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByText('已处理收据', { exact: true }))
  fireEvent.change(screen.getByLabelText('收费月份'), { target: { value: '2026-06' } })
  await user.click(await screen.findByRole('link', { name: /旧月学生/ }))
  await user.click(screen.getByRole('link', { name: '返回收据' }))
  const history = screen.getByRole('region', { name: '已处理收据' })
  expect(screen.getByRole('button', { name: '已处理收据' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(history).getByLabelText('收费月份')).toHaveValue('2026-06')
  expect(await within(history).findByRole('link', { name: /旧月学生/ })).toBeInTheDocument()
})

it('does not fetch completed receipts before selecting the upper history column', async () => {
  vi.mocked(listReceiptQueue).mockClear()
  vi.mocked(listReceiptQueue).mockResolvedValue([])
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  await screen.findByText('目前没有待开收据。')
  expect(listReceiptQueue).not.toHaveBeenCalledWith('completed', expect.anything())
  await userEvent.setup().click(screen.getByRole('button', { name: '已处理收据' }))
  expect(await screen.findByLabelText('收费月份')).toBeVisible()
  expect(listReceiptQueue).toHaveBeenCalledWith('completed', expect.anything())
})

it.each(['monthly', 'temporary'])('preserves the %s class identity passed from unified fees to receipts', async kind => {
  const items = [
    { receipt_key: 'monthly_fee:m', source_type: 'monthly_fee', source_id: 'm', student_name: '常态学生', student_id: 's', source_name: '同名班', amount: 70, receipt_period: '2026-10-01', paid_at: '2026-10-01T00:00:00Z' },
    { receipt_key: 'temporary_class_payment:t', source_type: 'temporary_class_payment', source_id: 't', student_name: '临时学生', student_id: 's', source_name: '同名班', amount: 30, receipt_period: '2026-10-01', paid_at: '2026-10-01T00:00:00Z' },
  ] as ReceiptQueueItem[]
  vi.mocked(listReceiptQueue).mockResolvedValue(items)
  vi.mocked(listMonthlyFees).mockResolvedValue([{ id: 'm' }] as never)
  vi.mocked(listTemporaryFeeRecords).mockResolvedValue([{ payment: { id: 't' } }] as never)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`/fees/receipts?classId=${kind}:same`]}><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByRole('link', { name: kind === 'monthly' ? /常态学生/ : /临时学生/ })).toBeVisible()
  expect(screen.queryByRole('link', { name: kind === 'monthly' ? /临时学生/ : /常态学生/ })).not.toBeInTheDocument()
  if (kind === 'monthly') expect(listMonthlyFees).toHaveBeenLastCalledWith({ classId: 'same', paymentStatus: 'paid', complete: true })
  else expect(listTemporaryFeeRecords).toHaveBeenLastCalledWith({ classId: 'same', month: 'all', includeCancelled: true }, expect.any(AbortSignal))
})
it('reports and retries failed class scope in the visible completed-receipts panel', async () => {
  vi.mocked(listReceiptQueue).mockResolvedValue([{ receipt_key: 'temporary_class_payment:t', source_type: 'temporary_class_payment', source_id: 't', student_id: 's', student_name: '历史临时学生', source_name: '同名班', amount: 30, receipt_period: '2026-10-01', paid_at: '2026-10-01T00:00:00Z' }] as ReceiptQueueItem[])
  vi.mocked(listTemporaryFeeRecords).mockRejectedValueOnce(new Error('isolated failure')).mockResolvedValue([{ payment: { id: 't' } }] as never)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/fees/receipts?classId=temporary:same&completed=1']}><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  const region = screen.getByRole('region', { name: '已处理收据' })
  expect(await within(region).findByRole('alert')).toHaveTextContent('班级范围载入失败')
  expect(within(region).queryByText('目前没有已处理收据。')).not.toBeInTheDocument()
  await userEvent.setup().click(within(region).getByRole('button', { name: '重试班级范围' }))
  expect(await within(region).findByRole('link', { name: /历史临时学生/ })).toBeVisible()
})
