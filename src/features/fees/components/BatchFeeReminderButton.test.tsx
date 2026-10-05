import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { BatchFeeReminderButton } from './BatchFeeReminderButton'
import { updateProtection } from '../../settings/pwa/updateProtection'
import { loadBatchReminderCandidates } from '../api/batchFeeReminderService'
import { loadFeeReminder, type FeeReminderSnapshot } from '../api/feeReminderService'

vi.mock('../api/batchFeeReminderService', () => ({ loadBatchReminderCandidates: vi.fn() }))
vi.mock('../api/feeReminderService', () => ({ loadFeeReminder: vi.fn() }))
const candidates = [{ studentId: 'a', name: '蓝炜滨', phone: '012-0000001', amount: 190 }, { studentId: 'b', name: '温晴', phone: null, amount: 80 }]
const snapshot = (id: string): FeeReminderSnapshot => ({ student: { id, name: id === 'a' ? '蓝炜滨' : '温晴', phone: id === 'a' ? '012-0000001' : null }, fees: [{ id: id + 'fee', student_id: id, fee_month: '2026-09-01', actual_amount: id === 'a' ? 190 : 80, payment_status: 'unpaid', enrollment: { class: { name: '模拟课程' } } }] as FeeReminderSnapshot['fees'] })
function Probe() { const location = useLocation(); return <output data-testid="url">{location.pathname + location.search}</output> }
function setup(initialMonth = '2026-09-01') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/fees/monthly?month=2026-09&classId=class-a&q=蓝']}><BatchFeeReminderButton initialMonth={initialMonth} scope={{ classId: 'class-a', search: '蓝' }} scopeLabel="会计 A · 搜索：蓝" /><Probe /></MemoryRouter></QueryClientProvider>)
}
async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '批量提醒' }))
  await user.click(await screen.findByRole('checkbox', { name: '全选符合条件的学生' }))
  expect(updateProtection.reason()).toContain('提醒名单')
  await user.click(screen.getByRole('button', { name: '开始提醒' }))
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T00:00:00Z'))
  vi.mocked(loadBatchReminderCandidates).mockResolvedValue(candidates)
  vi.mocked(loadFeeReminder).mockImplementation(async id => snapshot(id))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.style.overflow = '' })
it('requires an explicit single month for all-months, shows effective scope, then reads candidates', async () => {
  const user = userEvent.setup(); setup(''); await user.click(screen.getByRole('button', { name: '批量提醒' }))
  expect(loadBatchReminderCandidates).not.toHaveBeenCalled(); expect(screen.getByText('会计 A · 搜索：蓝')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('提醒月份'), { target: { value: '2026-09' } })
  expect(await screen.findByText('蓝炜滨')).toBeInTheDocument()
  expect(loadBatchReminderCandidates).toHaveBeenCalledWith({ feeMonth: '2026-09-01', classId: 'class-a', search: '蓝' }, expect.any(AbortSignal))
})
it('uses fresh candidates at start, fixed-month preview, edited body/phone, and never advances on an external click or copy', async () => {
  const user = userEvent.setup(); const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(); setup(); await start(user)
  const body = await screen.findByLabelText('消息正文'); expect(body).toHaveValue('炜滨，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  expect(updateProtection.reason()).toContain('批次')
  expect(loadBatchReminderCandidates).toHaveBeenCalledTimes(2); expect(loadFeeReminder).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  await user.clear(body); await user.type(body, '你好 & A'); await user.clear(screen.getByLabelText('收件电话号码')); await user.type(screen.getByLabelText('收件电话号码'), '+60 12-0000002')
  const link = screen.getByRole('link', { name: '打开 WhatsApp' }); expect(link).toHaveAttribute('href', 'https://wa.me/60120000002?text=%E4%BD%A0%E5%A5%BD%20%26%20A')
  link.addEventListener('click', e => e.preventDefault()); await user.click(link); await user.click(screen.getByRole('button', { name: '复制文案' }))
  expect(clipboard).toHaveBeenCalledWith('你好 & A'); expect(loadFeeReminder).toHaveBeenCalledTimes(1)
  expect(screen.getByText('已处理 0 · 待处理 2 · 跳过 0 · 无需追缴 0')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '已处理，下一位' })); await screen.findByDisplayValue('温晴，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  expect(screen.getByLabelText('收件电话号码')).toHaveValue(''); expect(screen.queryByText('已复制')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '复制文案' })); await user.click(screen.getByRole('button', { name: '跳过' }))
  expect(screen.getByText('本批次已处理完毕')).toBeInTheDocument(); expect(screen.getByText('已处理 1 · 待处理 0 · 跳过 1 · 无需追缴 0')).toBeInTheDocument()
  expect(screen.getByTestId('url')).toHaveTextContent('/fees/monthly?month=2026-09&classId=class-a&q=蓝')
})
it('closes without losing progress, restores focus/scroll and explicitly continues or confirms ending', async () => {
  const user = userEvent.setup(); setup(); Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 }); await start(user); await screen.findByLabelText('消息正文')
  await user.click(screen.getByRole('button', { name: '已处理，下一位' })); await screen.findByDisplayValue('温晴，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  await user.click(screen.getByRole('button', { name: '关闭预览' })); expect(screen.getByRole('button', { name: '批量提醒' })).toHaveFocus(); expect(window.scrollY).toBe(600); expect(document.body.style.overflow).toBe('')
  await user.click(screen.getByRole('button', { name: '批量提醒' })); expect(screen.getByRole('button', { name: '继续本批次' })).toBeInTheDocument()
  expect(screen.queryByLabelText('消息正文')).not.toBeInTheDocument(); await user.click(screen.getByRole('button', { name: '继续本批次' })); await screen.findByLabelText('消息正文')
  expect(loadFeeReminder).toHaveBeenLastCalledWith('b', expect.any(AbortSignal))
  await user.click(screen.getByRole('button', { name: '结束本批次' })); expect(screen.getByText('结束后将清除本批次进度。')).toBeInTheDocument(); await user.click(screen.getByRole('button', { name: '取消' })); expect(screen.getByLabelText('消息正文')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '结束本批次' })); await user.click(screen.getByRole('button', { name: '确认结束' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('fails closed on candidate errors and empty results, retries, and allows individual selection', async () => {
  vi.mocked(loadBatchReminderCandidates).mockRejectedValueOnce(new Error('later page')); const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: '批量提醒' }))
  expect(await screen.findByText('候选名单读取失败，请重试。')).toBeInTheDocument(); expect(screen.getByRole('button', { name: '开始提醒' })).toBeDisabled()
  vi.mocked(loadBatchReminderCandidates).mockResolvedValueOnce([]); await user.click(screen.getByRole('button', { name: '重试' })); expect(await screen.findByText('此范围没有需要追缴的学生。')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('提醒月份'), { target: { value: '2026-08' } }); await user.click(await screen.findByRole('checkbox', { name: /蓝炜滨/ })); expect(screen.getByRole('checkbox', { name: /温晴/ })).not.toBeChecked()
})
it('rechecks cleared debts and keeps skipped/updated distinct from handled', async () => {
  vi.mocked(loadFeeReminder).mockResolvedValueOnce({ student: snapshot('a').student, fees: [] }); const user = userEvent.setup(); setup(); await start(user)
  expect(await screen.findByText('状态已更新：这个月份已没有需要追缴的学费。')).toBeInTheDocument(); expect(screen.queryByRole('link')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: '已处理，下一位' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '下一位' })); await screen.findByLabelText('消息正文'); expect(screen.getByText('已处理 0 · 待处理 1 · 跳过 0 · 无需追缴 1')).toBeInTheDocument()
})
it('retries current read errors and can skip while a stale read is outstanding', async () => {
  let resolveOld!: (value: FeeReminderSnapshot) => void
  vi.mocked(loadFeeReminder).mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  const user = userEvent.setup(); setup(); await start(user); await screen.findByText('未缴资料读取失败，请重试。'); await user.click(screen.getByRole('button', { name: '重试' })); await user.click(screen.getByRole('button', { name: '跳过' })); await screen.findByDisplayValue('温晴，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  await act(async () => resolveOld(snapshot('a'))); expect(screen.getByLabelText('消息正文')).toHaveValue('温晴，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
})
it('does not start a batch after a failed fresh start read or a late start after close', async () => {
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: '批量提醒' })); await user.click(await screen.findByRole('checkbox', { name: '全选符合条件的学生' }))
  vi.mocked(loadBatchReminderCandidates).mockRejectedValueOnce(new Error('changed')); await user.click(screen.getByRole('button', { name: '开始提醒' })); await screen.findByText('候选名单读取失败，请重试。'); expect(loadFeeReminder).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '重试' })); await waitFor(() => expect(screen.getByRole('button', { name: '开始提醒' })).toBeEnabled())
  let resolveLate!: (value: typeof candidates) => void; vi.mocked(loadBatchReminderCandidates).mockImplementationOnce(() => new Promise(resolve => { resolveLate = resolve }))
  await user.click(screen.getByRole('button', { name: '开始提醒' })); await user.click(screen.getByRole('button', { name: '关闭预览' })); await act(async () => resolveLate(candidates)); await user.click(screen.getByRole('button', { name: '批量提醒' })); expect(screen.queryByRole('button', { name: '继续本批次' })).not.toBeInTheDocument()
})
it('revalidates selected UUIDs against the fresh scoped candidate read before starting', async () => {
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: '批量提醒' })); await user.click(await screen.findByRole('checkbox', { name: '全选符合条件的学生' }))
  vi.mocked(loadBatchReminderCandidates).mockResolvedValueOnce([candidates[1]])
  await user.click(screen.getByRole('button', { name: '开始提醒' })); await screen.findByLabelText('消息正文')
  expect(loadFeeReminder).toHaveBeenCalledWith('b', expect.any(AbortSignal)); expect(loadFeeReminder).not.toHaveBeenCalledWith('a', expect.any(AbortSignal))
  expect(screen.getByText('已处理 0 · 待处理 1 · 跳过 0 · 无需追缴 0')).toBeInTheDocument()
})
it('ignores a late copy after manual next, and clears prior phone and copy state', async () => {
  const user = userEvent.setup(); let finish!: () => void
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  setup(); await start(user); await screen.findByLabelText('消息正文')
  await user.click(screen.getByRole('button', { name: '复制文案' })); await user.click(screen.getByRole('button', { name: '已处理，下一位' })); await screen.findByDisplayValue('温晴，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  await act(async () => finish()); expect(screen.queryByText('已复制')).not.toBeInTheDocument(); expect(screen.getByLabelText('收件电话号码')).toHaveValue('')
})
it('cancels or confirms replacing the batch instead of silently discarding progress', async () => {
  const user = userEvent.setup(); setup(); await start(user); await screen.findByLabelText('消息正文'); await user.click(screen.getByRole('button', { name: '关闭预览' })); await user.click(screen.getByRole('button', { name: '批量提醒' }))
  await user.click(screen.getByRole('button', { name: '重新选择' })); expect(screen.getByText('重新选择将清除本批次进度。')).toBeInTheDocument(); await user.click(screen.getByRole('button', { name: '取消' })); expect(screen.getByRole('button', { name: '继续本批次' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '重新选择' })); await user.click(screen.getByRole('button', { name: '确认重新选择' })); expect(await screen.findByRole('checkbox', { name: '全选符合条件的学生' })).not.toBeChecked(); expect(screen.getByRole('button', { name: '开始提醒' })).toBeDisabled()
})
it('does not lose temporary edits when cancelling the end confirmation', async () => {
  const user = userEvent.setup(); setup(); await start(user); await screen.findByLabelText('消息正文')
  await user.clear(screen.getByLabelText('消息正文')); await user.type(screen.getByLabelText('消息正文'), 'edited draft')
  await user.click(screen.getByRole('button', { name: '结束本批次' })); await user.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.getByLabelText('消息正文')).toHaveValue('edited draft')
})
it('does not expose late candidates from the prior month or retain its selection', async () => {
  let finish!: (value: typeof candidates) => void; vi.mocked(loadBatchReminderCandidates).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: '批量提醒' })); fireEvent.change(screen.getByLabelText('提醒月份'), { target: { value: '2025-09' } })
  await screen.findByText('蓝炜滨'); await user.click(screen.getByRole('checkbox', { name: /温晴/ })); await act(async () => finish([candidates[0]]))
  expect(screen.getByRole('checkbox', { name: /温晴/ })).toBeChecked(); await user.click(screen.getByRole('button', { name: '开始提醒' })); await screen.findByText('状态已更新：这个月份已没有需要追缴的学费。')
  expect(screen.getByText('欠费月份：2025年9月')).toBeInTheDocument()
})
it('keeps selection open when the fresh scope no longer has any selected candidate', async () => {
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: '批量提醒' })); await user.click(await screen.findByRole('checkbox', { name: '全选符合条件的学生' }))
  vi.mocked(loadBatchReminderCandidates).mockResolvedValueOnce([]); await user.click(screen.getByRole('button', { name: '开始提醒' }))
  expect(await screen.findByText('状态已更新：所选学生已不在本月提醒范围，请重新选择。')).toBeInTheDocument()
  expect(loadFeeReminder).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '开始提醒' })).toBeDisabled()
})
