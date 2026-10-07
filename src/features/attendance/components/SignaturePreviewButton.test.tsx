import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue } from '../../auth/authContext'
import type { AttendanceRecord, ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { SignaturePreviewButton } from './SignaturePreviewButton'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const load = vi.hoisted(() => vi.fn())
vi.mock('../api/signaturePreviewService', async importOriginal => ({ ...await importOriginal<typeof import('../api/signaturePreviewService')>(), loadSignaturePreview: load }))
const session = { id: 'course-a', owner_id: 'owner', status: 'scheduled', current_start_at: '2026-09-01T06:00:00Z', class: { name: '虚构会计班' } } as ClassSessionWithClass
const entry = { student_id: 'student-a', student_name: '虚构学生甲', attendance_record_id: 'record-a' } as SessionRosterEntry
const record = { id: 'record-a', captured_at: '2026-09-03T06:00:00Z', synced_at: '2026-09-03T06:03:00Z', signing_type: 'backfill', capture_source: 'device_offline' } as AttendanceRecord
const result = { record, session, originalSession: null, url: 'http://127.0.0.1/private-fixture-a.png' }
const auth = (id: string) => ({ user: { id } as User } as AuthContextValue)
const view = (owner = 'owner', e = entry) => <AuthContext.Provider value={auth(owner)}><SignaturePreviewButton session={session} entry={e} /></AuthContext.Provider>
beforeEach(() => {
  load.mockReset().mockResolvedValue(result)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  document.body.style.overflow = ''
})
it('loads only on click, shows the actual backfill/capture times, closes without navigation and restores focus/nonzero scroll', async () => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 560 })
  const { container } = render(view())
  const trigger = screen.getByRole('button', { name: '查看签名：虚构学生甲' })
  expect(load).not.toHaveBeenCalled()
  trigger.focus(); fireEvent.click(trigger)
  expect(await screen.findByRole('img', { name: '虚构学生甲的签名' })).toHaveAttribute('src', result.url)
  expect(screen.getByRole('dialog')).toHaveTextContent('2026/9/1周二 14:00')
  expect(screen.getByText('2026/9/3周四 14:00')).toBeInTheDocument()
  expect(screen.getByText(/同步于/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /作废|删除|上传/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus(); expect(window.scrollTo).toHaveBeenCalledWith({ top: 560, behavior: 'instant' })
  expect(container.querySelector('img')).toBeNull(); expect(document.body.style.overflow).toBe('')
})
it('shows failure and retries a fresh record; an expired/broken image is not silently kept', async () => {
  load.mockRejectedValueOnce(new Error('记录已作废'))
  render(view()); fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('签名读取失败，请重试。')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  fireEvent.error(await screen.findByRole('img'))
  expect(screen.getByRole('alert')).toHaveTextContent('链接已过期')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByRole('img'); expect(load).toHaveBeenCalledTimes(3)
})
it('ignores responses after close or switching to another student/account; returning to an account does not reopen its old preview', async () => {
  let finish!: (value: typeof result) => void
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { rerender } = render(view())
  fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  rerender(view('owner', { ...entry, student_id: 'student-b', student_name: '虚构学生乙', attendance_record_id: 'record-b' }))
  await act(async () => finish(result))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /虚构学生乙/ }))
  await screen.findByRole('img')
  rerender(view('other')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  rerender(view()); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('handles Escape and creates a new private URL on reopening rather than restoring an old URL', async () => {
  render(view()); fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  await screen.findByRole('img')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  load.mockResolvedValueOnce({ ...result, url: 'http://127.0.0.1/private-fixture-new.png' })
  fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'http://127.0.0.1/private-fixture-new.png'))
  expect(load).toHaveBeenCalledTimes(2)
})
it('closes a retained hidden panel preview on browser back and ignores its late response without focusing hidden content', async () => {
  let finish!: (value: typeof result) => void
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  function Page() {
    const navigate = useNavigate()
    return <><button onClick={() => navigate(-1)}>模拟浏览器后退</button><ContextDataWorkspace label="资料" defaultPanel="fees" sections={[
      { id: 'fees', label: '缴费', render: () => <p>缴费列表</p> },
      { id: 'attendance', label: '出席', render: () => view() },
    ]} /></>
  }
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/?panel=fees', '/?panel=attendance']} initialIndex={1}><Page /></MemoryRouter></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  fireEvent.click(screen.getByRole('button', { name: '模拟浏览器后退' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await act(async () => finish(result))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(document.body.style.overflow).toBe('')
  fireEvent.click(screen.getByRole('button', { name: /^出席$/ }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  await screen.findByRole('img'); expect(load).toHaveBeenCalledTimes(2)
})
it('rechecks an open preview on focus/reconnect and stops displaying a subsequently voided or unauthorized record', async () => {
  render(view()); fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  await screen.findByRole('img')
  load.mockRejectedValueOnce(new Error('签到记录已变化或无法核对，请刷新课程记录。'))
  fireEvent.focus(window)
  await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument())
  expect(await screen.findByRole('alert')).toHaveTextContent('签到记录已变化')
  fireEvent.online(window)
  await screen.findByRole('img'); expect(load).toHaveBeenCalledTimes(3)
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  fireEvent.focus(window)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)) })
  expect(load).toHaveBeenCalledTimes(3)
})
it('keeps forward and reverse keyboard traversal inside the preview, including retry', async () => {
  load.mockRejectedValueOnce(new Error('failure'))
  render(view()); fireEvent.click(screen.getByRole('button', { name: /查看签名/ }))
  const retry = await screen.findByRole('button', { name: '重试' })
  const close = screen.getByRole('button', { name: '关闭' })
  close.focus(); fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(retry).toHaveFocus()
  fireEvent.keyDown(retry, { key: 'Tab' })
  expect(close).toHaveFocus()
})
