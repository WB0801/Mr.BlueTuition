import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { MonthlyFeesPage } from './MonthlyFeesPage'
import { loadBatchReminderCandidates } from '../api/batchFeeReminderService'
import { ensureMonthlyFees, markMonthlyFeePaid } from '../api/feesService'

vi.mock('../../classes/api/classesService', () => ({ listClasses: vi.fn(async () => [{ id: 'c', name: '模拟会计 A' }]) }))
vi.mock('../api/batchFeeReminderService', () => ({ loadBatchReminderCandidates: vi.fn(async () => []) }))
vi.mock('../api/feesService', () => ({ ensureMonthlyFees: vi.fn(async () => ({ created_count: 0 })), listMonthlyFees: vi.fn(async () => []), markMonthlyFeePaid: vi.fn() }))
function Probe() { return <output data-testid="url">{useLocation().search}</output> }
it('offers batch only in unpaid global view, forwards current scope without extra generation and preserves URL', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  const user = userEvent.setup()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/fees?month=2026-09&classId=c&studentId=s&q=蓝']}><MonthlyFeesPage view="current" /><Probe /></MemoryRouter></QueryClientProvider>)
  await screen.findByText('找不到符合搜索的学生。'); const calls = vi.mocked(ensureMonthlyFees).mock.calls.length
  const url = screen.getByTestId('url').textContent
  await user.click(screen.getByRole('button', { name: '批量提醒' })); await screen.findByText('此范围没有需要追缴的学生。')
  expect(loadBatchReminderCandidates).toHaveBeenCalledWith({ feeMonth: '2026-09-01', classId: 'c', studentId: 's', search: '蓝' }, expect.any(AbortSignal))
  expect(ensureMonthlyFees).toHaveBeenCalledTimes(calls); expect(markMonthlyFeePaid).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '关闭预览' })); expect(screen.getByTestId('url').textContent).toBe(url)
  await user.click(screen.getByRole('button', { name: /已缴/ })); expect(screen.queryByRole('button', { name: '批量提醒' })).not.toBeInTheDocument()
})
