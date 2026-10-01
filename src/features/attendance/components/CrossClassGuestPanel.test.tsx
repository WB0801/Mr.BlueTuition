import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CrossClassGuestPanel } from './CrossClassGuestPanel'
import { addSessionGuests, listMakeupSourceSessions } from '../api/attendanceService'
vi.mock('../api/attendanceService', () => ({
  searchCrossClassCandidates: vi.fn().mockResolvedValue(['a', 'b'].map((id) => ({ source_enrollment_id: `enrollment-${id}`, student_id: id, student_name: `学生${id}`, source_class_name: `原班${id}`, school_class: '高一', phone: null }))),
  listMakeupSourceSessions: vi.fn(), addSessionGuests: vi.fn(),
}))
it('requires an absent source for every selected student and retains only failures for retry', async () => {
  vi.mocked(listMakeupSourceSessions).mockImplementation(async (_session, enrollment) => [{ session_id: `absent-${enrollment}`, session_start_at: '2026-08-20T06:00:00Z', class_name: enrollment }])
  vi.mocked(addSessionGuests).mockImplementation(async (_session, requests) => requests.map((request, index) => ({ ...request, success: index === 0, error: index ? '资格已改变' : undefined })))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CrossClassGuestPanel sessionId="target" /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: /学生a/ }))
  await user.click(screen.getByRole('checkbox', { name: /学生b/ }))
  expect(screen.getByRole('button', { name: '加入所选 2 人' })).toBeDisabled()
  await within(screen.getByRole('combobox', { name: '学生a的原缺席课程' })).findByRole('option', { name: /enrollment-a/ })
  await user.selectOptions(screen.getByRole('combobox', { name: '学生a的原缺席课程' }), 'absent-enrollment-a')
  expect(screen.getByRole('button', { name: '加入所选 2 人' })).toBeDisabled()
  await user.selectOptions(screen.getByRole('combobox', { name: '学生b的原缺席课程' }), 'absent-enrollment-b')
  await user.click(screen.getByRole('button', { name: '加入所选 2 人' }))
  await screen.findByText('已加入 1 人 · 未加入 1 人')
  const selections = screen.getByRole('region', { name: '所选学生与原缺席课程' })
  expect(within(selections).queryByRole('combobox', { name: '学生a的原缺席课程' })).not.toBeInTheDocument()
  expect(within(selections).getByRole('combobox', { name: '学生b的原缺席课程' })).toHaveValue('absent-enrollment-b')
  await waitFor(() => expect(addSessionGuests).toHaveBeenCalledWith('target', [
    expect.objectContaining({ enrollmentId: 'enrollment-a', sourceSessionId: 'absent-enrollment-a' }),
    expect.objectContaining({ enrollmentId: 'enrollment-b', sourceSessionId: 'absent-enrollment-b' }),
  ]))
  vi.mocked(addSessionGuests).mockClear().mockImplementation(async (_session, requests) => requests.map((request) => ({ ...request, success: true })))
  await user.click(screen.getByRole('button', { name: '加入所选 1 人' }))
  await waitFor(() => expect(addSessionGuests).toHaveBeenCalledWith('target', [expect.objectContaining({ enrollmentId: 'enrollment-b' })]))
  expect(addSessionGuests).toHaveBeenCalledTimes(1)
})

it('applies a shared source only to individually eligible students and allows an override', async () => {
  vi.mocked(listMakeupSourceSessions).mockImplementation(async (_session, enrollment) => enrollment === 'enrollment-a'
    ? [{ session_id: 'shared', session_start_at: '2026-08-20T06:00:00Z', class_name: '原班' }, { session_id: 'alternate', session_start_at: '2026-08-10T06:00:00Z', class_name: '原班' }]
    : [{ session_id: 'exception', session_start_at: '2026-08-21T06:00:00Z', class_name: '例外班' }])
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CrossClassGuestPanel sessionId="target" /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: /学生a/ }))
  await user.click(screen.getByRole('checkbox', { name: /学生b/ }))
  const shared = await screen.findByRole('combobox', { name: '共同原缺席课程' })
  await waitFor(() => expect(shared.querySelector('option[value="shared"]')).toHaveTextContent('1/2'))
  await user.selectOptions(shared, 'shared')
  await user.click(screen.getByRole('button', { name: '应用给符合条件者' }))
  expect(screen.getByRole('combobox', { name: '学生a的原缺席课程' })).toHaveValue('shared')
  expect(screen.getByRole('combobox', { name: '学生b的原缺席课程' })).toHaveValue('')
  expect(screen.getByText(/未应用：学生b/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加入所选 2 人' })).toBeDisabled()
  await user.selectOptions(screen.getByRole('combobox', { name: '学生a的原缺席课程' }), 'alternate')
  expect(screen.getByRole('combobox', { name: '学生a的原缺席课程' })).toHaveValue('alternate')
})

it('keeps an uncertain student selected and requests verification on retry', async () => {
  vi.mocked(listMakeupSourceSessions).mockResolvedValue([{ session_id: 'absent-a', session_start_at: '2026-08-20T06:00:00Z', class_name: '原班' }])
  vi.mocked(addSessionGuests).mockImplementation(async (_session, requests) => requests.map((request) => ({ ...request, success: false, uncertain: true, error: '请刷新名单核对' })))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CrossClassGuestPanel sessionId="target" /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: /学生a/ }))
  await within(screen.getByRole('combobox', { name: '学生a的原缺席课程' })).findByRole('option', { name: /原班/ })
  await user.selectOptions(screen.getByRole('combobox', { name: '学生a的原缺席课程' }), 'absent-a')
  await user.click(screen.getByRole('button', { name: '加入所选 1 人' }))
  await screen.findByText('已加入 0 人 · 未加入 0 人 · 待确认 1 人')
  expect(screen.getByRole('combobox', { name: '学生a的原缺席课程' })).toHaveValue('absent-a')
  vi.mocked(addSessionGuests).mockClear()
  await user.click(screen.getByRole('button', { name: '加入所选 1 人' }))
  await waitFor(() => expect(addSessionGuests).toHaveBeenCalledWith('target', [expect.objectContaining({ enrollmentId: 'enrollment-a', sourceSessionId: 'absent-a', verifyBeforeRetry: true })]))
})

it('retains failed selections across an independent operation and only retries those students', async () => {
  vi.mocked(listMakeupSourceSessions).mockResolvedValue([{ session_id: 'absent-a', session_start_at: '2026-08-20T06:00:00Z', class_name: '原班' }])
  vi.mocked(addSessionGuests).mockImplementation(async (_session, requests) => requests.map(request => ({ ...request, success: false, uncertain: true, error: '待确认' })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = <QueryClientProvider client={client}><CrossClassGuestPanel sessionId="retained-target" /></QueryClientProvider>
  const view = render(content); const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: /学生a/ }))
  await within(screen.getByRole('combobox', { name: '学生a的原缺席课程' })).findByRole('option', { name: /原班/ })
  await user.selectOptions(screen.getByRole('combobox', { name: '学生a的原缺席课程' }), 'absent-a')
  await user.click(screen.getByRole('button', { name: '加入所选 1 人' }))
  await screen.findByText('已加入 0 人 · 未加入 0 人 · 待确认 1 人')
  view.unmount(); render(content)
  expect(await screen.findByRole('combobox', { name: '学生a的原缺席课程' })).toHaveValue('absent-a')
  vi.mocked(addSessionGuests).mockClear()
  await user.click(screen.getByRole('button', { name: '加入所选 1 人' }))
  await waitFor(() => expect(addSessionGuests).toHaveBeenCalledWith('retained-target', [expect.objectContaining({ enrollmentId: 'enrollment-a', verifyBeforeRetry: true })]))
})
