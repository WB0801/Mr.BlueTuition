import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReceiptsPage } from './ReceiptsPage'
import { listReceiptQueue } from '../api/feesService'
import type { ReceiptQueueItem } from '../../../types/domain'
import { ContextBackLink } from '../../../components/navigation/ContextBackLink'
vi.mock('../api/feesService', () => ({
  listReceiptQueue: vi.fn(async (status: string) => status === 'pending' ? [{ receipt_key: 'monthly_fee:fee-a', source_id: 'fee-a', source_type: 'monthly_fee', student_id: 'student-a', student_name: '蓝炜滨', school_class: '高一甲', phone: null, source_name: '会计 A', amount: 120, receipt_period: '2026-08-01', paid_at: '2026-09-01T08:00:00Z' }] : []),
  listMonthlyFees: vi.fn(), completeReceipts: vi.fn(), restoreReceipt: vi.fn(),
  getReceiptPaymentTarget: vi.fn().mockResolvedValue('/fees?studentId=student-a&month=2026-08&status=paid&feeId=fee-a'),
}))
it('links the receipt identity and exact original payment without toggling the checkbox', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/fees/receipts']}><ReceiptsPage /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByRole('link', { name: /蓝炜滨.*高一甲/ })).toHaveAttribute('href', '/students/student-a')
  expect(await screen.findByRole('link', { name: '查看缴费记录' })).toHaveAttribute('href', '/fees?studentId=student-a&month=2026-08&status=paid&feeId=fee-a')
  const checkbox = screen.getByRole('checkbox', { name: /选择.*蓝炜滨/ })
  expect(checkbox).not.toBeChecked()
  await userEvent.setup().click(screen.getByRole('link', { name: '查看缴费记录' }))
  expect(checkbox).not.toBeChecked()
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
