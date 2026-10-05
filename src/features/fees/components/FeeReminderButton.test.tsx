import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { StrictMode } from 'react'
import { FeeReminderButton } from './FeeReminderButton'
import { loadFeeReminder, type FeeReminderSnapshot } from '../api/feeReminderService'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { FeeRecordList } from './FeeRecords'
import { MonthlyFeeCard } from './MonthlyFeeCard'
import { updateProtection } from '../../settings/pwa/updateProtection'

vi.mock('../api/feeReminderService', () => ({ loadFeeReminder: vi.fn() }))
const business = vi.hoisted(() => ({ paid: vi.fn(), ensure: vi.fn() }))
vi.mock('../api/feesService', () => ({ markMonthlyFeePaid: business.paid, ensureMonthlyFees: business.ensure, undoMonthlyFeePayment: vi.fn(), updateMonthlyFeeAmount: vi.fn(), waiveMonthlyFee: vi.fn(), completeReceipts: vi.fn(), restoreReceipt: vi.fn() }))

const student = { id: 'a', name: '蓝炜滨', phone: '012-0000001', school_class: '高一模拟班' }
const row = (id: string, amount = 120, month = '2026-09-01'): MonthlyFeeDetails => ({
  id, student_id: 'a', owner_id: 'owner', enrollment_id: `e-${id}`, fee_month: month, normal_amount: 150, actual_amount: amount,
  payment_status: 'unpaid', receipt_status: 'not_applicable', paid_at: null, receipt_completed_at: null, created_at: '', updated_at: '', student,
  enrollment: { id: `e-${id}`, class_id: id, join_date: '2025-01-01', end_date: null, status: 'active', class: { id, name: id === 'one' ? '会计 A' : '数学 B', status: 'active' } },
})
const snapshot = (): FeeReminderSnapshot => ({ student, fees: [row('one'), row('two', 70), row('old', 90, '2025-09-01')] })
function Probe() { const location = useLocation(); return <output data-testid="context">{location.pathname + location.search}</output> }
function setup(content = <FeeReminderButton fee={row('one')} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (children: React.ReactNode) => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/students/a?panel=fees&fees.status=unpaid&fees.month=2026-09&fees.record=one']}>
    {children}<Probe />
  </MemoryRouter></QueryClientProvider>
  const page = render(wrap(content))
  return { ...page, changeContent: (children: React.ReactNode) => page.rerender(wrap(children)) }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T00:00:00Z'))
  vi.mocked(loadFeeReminder).mockResolvedValue(snapshot())
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.style.overflow = '' })

it('reads all courses on open, uses actual amounts, and edits the exact outgoing message without navigation', async () => {
  const user = userEvent.setup(); setup()
  const originalContext = screen.getByTestId('context').textContent
  await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  const body = await screen.findByLabelText('消息正文')
  expect(body).toHaveClass('ui-input')
  const dialog = screen.getByRole('dialog', { name: /^WhatsApp 提醒/ })
  expect(within(dialog).getByText('蓝炜滨')).toBeInTheDocument()
  expect(within(dialog).getByText('会计 A')).toBeInTheDocument()
  expect(within(dialog).getByText('数学 B')).toBeInTheDocument()
  expect(within(dialog).getByText('RM190')).toBeInTheDocument()
  expect(body).toHaveValue('炜滨，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  await user.clear(body); await user.type(body, '你好\nA & B + # ?')
  expect(screen.getByRole('link', { name: '打开 WhatsApp' })).toHaveAttribute('href', 'https://wa.me/60120000001?text=%E4%BD%A0%E5%A5%BD%0AA%20%26%20B%20%2B%20%23%20%3F')
  expect(screen.getByRole('link', { name: '打开 WhatsApp' })).toHaveAttribute('target', '_blank')
  expect(screen.getByTestId('context').textContent).toBe(originalContext)
  expect(business.ensure).not.toHaveBeenCalled(); expect(business.paid).not.toHaveBeenCalled()
})
it('allows only real unpaid months and regenerates body after a month switch', async () => {
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  const body = await screen.findByLabelText('消息正文')
  await user.clear(body); await user.type(body, 'edited old message')
  expect(screen.getAllByRole('option').map(option => (option as HTMLOptionElement).value)).toEqual(['2026-09-01', '2025-09-01'])
  await user.selectOptions(screen.getByLabelText('欠费月份'), '2025-09-01')
  await waitFor(() => expect(screen.getByLabelText('消息正文')).toHaveValue('炜滨，提醒一下，2025年9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你'))
  expect(loadFeeReminder).toHaveBeenCalledTimes(2)
})
it('clears failed reads and retries without exposing cached outgoing data', async () => {
  vi.mocked(loadFeeReminder).mockRejectedValueOnce(new Error('offline'))
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  expect(await screen.findByText('未缴资料读取失败，请重试。')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '打开 WhatsApp' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByLabelText('消息正文')).toHaveValue('炜滨，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
})
it('stops reminders when records became paid and does not reuse the previous opening edit', async () => {
  const user = userEvent.setup(); setup(); const trigger = screen.getByRole('button', { name: /^WhatsApp 提醒/ })
  await user.click(trigger); const body = await screen.findByLabelText('消息正文'); await user.clear(body); await user.type(body, 'edited')
  expect(updateProtection.reason()).toContain('提醒')
  await user.click(screen.getByRole('button', { name: '关闭预览' })); expect(trigger).toHaveFocus()
  expect(updateProtection.reason()).toBe('')
  vi.mocked(loadFeeReminder).mockResolvedValue({ student, fees: [] })
  await user.click(trigger)
  expect(await screen.findByText('状态已更新：这个月份已没有需要追缴的学费。')).toBeInTheDocument()
  expect(screen.queryByLabelText('消息正文')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '打开 WhatsApp' })).not.toBeInTheDocument()
})
it('allows copy without a phone, uses edited text, and keeps temporary phone changes off the source', async () => {
  vi.mocked(loadFeeReminder).mockResolvedValue({ ...snapshot(), student: { ...student, phone: null } })
  const user = userEvent.setup(); const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  const body = await screen.findByLabelText('消息正文'); await user.clear(body); await user.type(body, '修改后的正文')
  expect(screen.getByText('缺少号码，请到学生资料补充；仍可复制文案。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '打开 WhatsApp' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '复制文案' }))
  expect(writeText).toHaveBeenCalledWith('修改后的正文'); expect(await screen.findByText('已复制')).toBeInTheDocument()
  await user.type(screen.getByLabelText('收件电话号码'), '+60 (12) 000-0001')
  expect(screen.getByRole('link', { name: '打开 WhatsApp' })).toHaveAttribute('href', 'https://wa.me/60120000001?text=%E4%BF%AE%E6%94%B9%E5%90%8E%E7%9A%84%E6%AD%A3%E6%96%87')
  expect(student.phone).toBe('012-0000001')
})
it('offers selectable text after clipboard failure and does not report sent', async () => {
  const user = userEvent.setup(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ })); const body = await screen.findByLabelText('消息正文')
  await user.click(screen.getByRole('button', { name: '复制文案' }))
  expect(await screen.findByText('复制失败，请选择正文手动复制。')).toBeInTheDocument(); expect(body).toBeEnabled()
  expect(screen.queryByText('已发送')).not.toBeInTheDocument()
})
it('ignores a late student response after the target changes', async () => {
  let late!: (value: FeeReminderSnapshot) => void
  vi.mocked(loadFeeReminder).mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
  const user = userEvent.setup(); const page = setup()
  await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  const b = { ...row('b'), student_id: 'b', student: { ...student, id: 'b', name: '温晴' } }
  page.changeContent(<FeeReminderButton fee={b} />)
  vi.mocked(loadFeeReminder).mockResolvedValue({ student: b.student!, fees: [b] })
  await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ })); await screen.findByLabelText('消息正文')
  await act(async () => { late(snapshot()) })
  expect(screen.getByLabelText('消息正文')).toHaveValue('温晴，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  expect(screen.queryByText('蓝炜滨')).not.toBeInTheDocument()
})
it('never inserts the reminder inside the scoped record button or selects that record', async () => {
  const onSelect = vi.fn(); const user = userEvent.setup(); setup(<FeeRecordList records={[row('one')]} onSelect={onSelect} studentScoped />)
  const trigger = screen.getByRole('button', { name: /^WhatsApp 提醒/ })
  expect(trigger).toHaveAccessibleName('WhatsApp 提醒：蓝炜滨 · 2026年9月')
  expect(trigger.parentElement?.closest('button')).toBeNull()
  await user.click(trigger); await screen.findByLabelText('消息正文'); expect(onSelect).not.toHaveBeenCalled()
})
it('keeps the original confirm-paid operation and shows no reminder on paid/waived rows', () => {
  setup(<><MonthlyFeeCard fee={row('one')} showReminder /><MonthlyFeeCard fee={{ ...row('two'), payment_status: 'paid' }} showReminder /><MonthlyFeeCard fee={{ ...row('three'), payment_status: 'waived' }} showReminder /></>)
  expect(screen.getAllByRole('button', { name: /^WhatsApp 提醒/ })).toHaveLength(1)
  expect(screen.getByRole('button', { name: '确认已缴' })).toBeEnabled()
})
it('does not add reminder entrances to unrelated shared fee cards', () => {
  setup(<MonthlyFeeCard fee={row('one')} />)
  expect(screen.queryByRole('button', { name: /^WhatsApp 提醒/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认已缴' })).toBeEnabled()
})

it('keeps the native modal open in the application StrictMode lifecycle', async () => {
  const user = userEvent.setup(); setup(<StrictMode><FeeReminderButton fee={row('one')} /></StrictMode>)
  await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  expect(await screen.findByLabelText('消息正文')).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: /^WhatsApp 提醒/ })).toHaveAttribute('open')
})

it('restores trigger focus on Escape without changing the original URL', async () => {
  const user = userEvent.setup(); setup(); const trigger = screen.getByRole('button', { name: /^WhatsApp 提醒/ })
  const original = screen.getByTestId('context').textContent
  await user.click(trigger); await screen.findByLabelText('消息正文')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus()
  expect(screen.getByTestId('context').textContent).toBe(original)
})
it('locks background scrolling only while the preview is open and restores its prior style', async () => {
  document.body.style.overflow = 'clip'
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  await screen.findByLabelText('消息正文'); expect(document.body.style.overflow).toBe('hidden')
  await user.click(screen.getByRole('button', { name: '关闭预览' }))
  expect(document.body.style.overflow).toBe('clip'); document.body.style.overflow = ''
})

it('does not let a late month replace the newest month or reuse an edited body', async () => {
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ })); await screen.findByLabelText('消息正文')
  let late!: (value: FeeReminderSnapshot) => void
  vi.mocked(loadFeeReminder).mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
  await user.selectOptions(screen.getByLabelText('欠费月份'), '2025-09-01')
  expect(screen.queryByLabelText('消息正文')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('欠费月份'), '2026-09-01')
  await screen.findByLabelText('消息正文')
  await act(async () => { late({ student, fees: [row('old', 90, '2025-09-01')] }) })
  expect(screen.getByLabelText('欠费月份')).toHaveValue('2026-09-01')
  expect(screen.getByLabelText('消息正文')).toHaveValue('炜滨，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  expect(screen.getByText('RM190')).toBeInTheDocument()
})

it('blocks outgoing data after a later month read failed even with a previous snapshot', async () => {
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ })); await screen.findByLabelText('消息正文')
  vi.mocked(loadFeeReminder).mockRejectedValueOnce(new Error('failed month read'))
  await user.selectOptions(screen.getByLabelText('欠费月份'), '2025-09-01')
  expect(await screen.findByRole('alert')).toHaveTextContent('未缴资料读取失败')
  expect(screen.queryByLabelText('消息正文')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '打开 WhatsApp' })).not.toBeInTheDocument()
})

it('does not claim a pending clipboard result belongs to an edited message', async () => {
  const user = userEvent.setup(); let finish!: () => void
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => new Promise<void>(resolve => { finish = resolve })) } })
  setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ })); const body = await screen.findByLabelText('消息正文')
  await user.click(screen.getByRole('button', { name: '复制文案' })); await user.type(body, '修改')
  await act(async () => { finish() })
  expect(screen.queryByText('已复制')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '复制文案' })).toBeEnabled()
})

it('requires checking missing student identity instead of inventing a salutation', async () => {
  vi.mocked(loadFeeReminder).mockResolvedValue({ ...snapshot(), student: { ...student, name: '  ' } })
  const user = userEvent.setup(); setup(); await user.click(screen.getByRole('button', { name: /^WhatsApp 提醒/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请先核对学生姓名与收费月份')
  expect(screen.getByLabelText('消息正文')).toHaveValue('')
  expect(screen.getByRole('button', { name: '打开 WhatsApp' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '复制文案' })).toBeDisabled()
})
