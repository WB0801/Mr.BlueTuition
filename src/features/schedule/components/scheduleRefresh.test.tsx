import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AttendanceRecords } from './AttendanceRecords'
import { ClassScheduleSection } from './ClassScheduleSection'
import * as service from '../api/scheduleService'
import { malaysiaDateTime, todayInMalaysia } from '../../../utils/format'
import type { ClassSessionWithClass, TuitionClass } from '../../../types/domain'

// Real components, query lifecycle and service methods; only the database boundary is isolated.
const backend = vi.hoisted(() => ({ sessions: [] as unknown[], reads: 0, generations: [] as Array<{ p_from_date: string; p_to_date: string }>, fail: false, protected: false, failGeneration: false }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({
  rpc: async (name: string, body: { p_from_date: string; p_to_date: string }) => {
    if (name === 'ensure_class_sessions') { backend.generations.push(body); return { data: null, error: backend.failGeneration ? new Error('模拟生成失败') : null } }
    if (name === 'get_session_attendance_roster') return { data: [], error: null }
    throw new Error('Unexpected RPC: ' + name)
  },
  from: (table: string) => {
    const filters: Array<[string, string, unknown]> = []
    const query = {
      select: () => query, order: () => query, limit: () => query, in: () => query,
      eq: (field: string, value: unknown) => { filters.push(['eq', field, value]); return query },
      neq: (field: string, value: unknown) => { filters.push(['neq', field, value]); return query },
      gte: () => query, lt: () => query, or: () => query,
      then: (resolve: (value: { data: unknown[] | null; error: Error | null }) => unknown) => {
        if (table === 'class_sessions') {
          backend.reads++
          const cancelled = filters.some(([op, field, value]) => op === 'eq' && field === 'status' && value === 'cancelled')
          return Promise.resolve(resolve(backend.fail ? { data: null, error: new Error('模拟读取失败') } : { data: cancelled ? [] : backend.sessions, error: null }))
        }
        return Promise.resolve(resolve({ data: table === 'attendance_records' && backend.protected ? [{ session_id: 'course-a' }] : [], error: null }))
      },
    }
    return query
  },
}) }))
const tuitionClass: TuitionClass = { id: 'class-a', owner_id: 'demo', name: '虚构会计班', status: 'active', subject_id: 'subject-a', weekday: 2, start_time: '18:00', end_time: '19:00', monthly_fee: 40, start_date: '2025-01-01', end_date: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
function course(name: string, past = false): ClassSessionWithClass {
  const start = past ? '2025-01-01T06:00:00Z' : malaysiaDateTime(todayInMalaysia(), '18:00')
  const end = past ? '2025-01-01T07:00:00Z' : malaysiaDateTime(todayInMalaysia(), '19:00')
  return { id: 'course-a', owner_id: 'demo', class_id: tuitionClass.id, class: { ...tuitionClass, name }, schedule_rule_id: 'rule-a', schedule_week: null, temporary_class_id: null, session_type: 'regular', status: 'scheduled', original_start_at: start, original_end_at: end, current_start_at: start, current_end_at: end, cancelled_at: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
}
function mount(client: QueryClient, path = '/attendance', content: React.ReactNode = <AttendanceRecords />) {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{content}</MemoryRouter></QueryClientProvider>)
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }) }
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) }) }
beforeEach(() => {
  vi.restoreAllMocks()
  backend.sessions = [course('模拟旧课程')]; backend.reads = 0; backend.generations = []; backend.fail = false; backend.protected = false; backend.failGeneration = false
  focusManager.setFocused(true); onlineManager.setOnline(true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterEach(() => { focusManager.setFocused(undefined); onlineManager.setOnline(true) })

it('hidden all-day preview pauses focus/reconnect reads and generation, reopening rechecks protection without regenerating', async () => {
  const preview = vi.spyOn(service, 'listScheduledSessionsForDate')
  mount(client())
  await screen.findByRole('link', { name: /模拟旧课程/ })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '全日停课' }))
  await screen.findByRole('button', { name: '停课 1 堂 · 保留 0 堂' })
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(1))
  const generations = backend.generations.length
  await user.click(screen.getByRole('button', { name: '课程名单' }))
  await act(async () => { focusManager.setFocused(false); onlineManager.setOnline(false) })
  await act(async () => { focusManager.setFocused(true); onlineManager.setOnline(true) })
  await settle()
  expect(preview).toHaveBeenCalledTimes(1)
  expect(backend.generations).toHaveLength(generations)
  backend.sessions = [course('重新核对课程')]
  backend.protected = true
  await user.click(screen.getByRole('button', { name: '全日停课' }))
  expect(await screen.findByText('重新核对课程')).toBeVisible()
  expect(preview).toHaveBeenCalledTimes(2)
  expect(await screen.findByRole('button', { name: '停课 0 堂 · 保留 1 堂' })).toBeDisabled()
  expect(backend.generations).toHaveLength(generations)
  console.info('F1 hidden preview reads=1; reopen reads=2; generation unchanged; refreshed signed protection=1')
})

it.each(['today', 'week'])('independent %s list reads changed server contents when re-entered without extra generation', async view => {
  const cache = client(), read = vi.spyOn(service, 'listAttendanceSessions')
  const first = mount(cache, '/attendance?view=' + view)
  await screen.findByRole('link', { name: /模拟旧课程/ })
  const generations = backend.generations.length
  first.unmount(); backend.sessions = [course('模拟新课程')]
  mount(cache, '/attendance?view=' + view)
  expect(await screen.findByRole('link', { name: /模拟新课程/ })).toBeVisible()
  expect(read).toHaveBeenCalledTimes(2)
  expect(backend.generations).toHaveLength(generations)
  backend.sessions = [course('焦点新课程')]
  await act(async () => { focusManager.setFocused(false) })
  await act(async () => { focusManager.setFocused(true) })
  expect(await screen.findByRole('link', { name: /焦点新课程/ })).toBeVisible()
  backend.sessions = [course('重连新课程')]
  await act(async () => { onlineManager.setOnline(false) })
  await act(async () => { onlineManager.setOnline(true) })
  expect(await screen.findByRole('link', { name: /重连新课程/ })).toBeVisible()
  expect(read).toHaveBeenCalledTimes(4)
  expect(backend.generations).toHaveLength(generations)
  console.info(`F2 ${view}: list reads=4 (entry/reentry/focus/reconnect); generation=1; latest content visible`)
})

it('independent history refreshes after 30 seconds while retaining its current loaded list during a failed refresh and retry', async () => {
  backend.sessions = [course('模拟旧课程', true)]
  const cache = client(), read = vi.spyOn(service, 'listAttendanceHistoryPage')
  const first = mount(cache, '/attendance?view=history')
  await screen.findByRole('link', { name: /模拟旧课程/ })
  first.unmount()
  const fresh = mount(cache, '/attendance?view=history')
  await screen.findByRole('link', { name: /模拟旧课程/ })
  expect(read).toHaveBeenCalledTimes(1)
  fresh.unmount()
  for (const query of cache.getQueryCache().findAll({ queryKey: ['sessions', 'attendance', 'paged-history'] })) {
    cache.setQueryData(query.queryKey, query.state.data, { updatedAt: Date.now() - 31_000 })
  }
  backend.fail = true
  mount(cache, '/attendance?view=history')
  await screen.findByText('课程载入失败。')
  expect(screen.getByRole('link', { name: /模拟旧课程/ })).toBeVisible()
  backend.fail = false; backend.sessions = [course('模拟新历史', true)]
  await userEvent.setup().click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('link', { name: /模拟新历史/ })).toBeVisible()
  expect(read).toHaveBeenCalledTimes(3)
  expect(backend.generations).toHaveLength(1)
  console.info('F2 history: fresh return reads=1; stale failure+retry reads=3; generation=1; failed refresh kept old row')
})

it('independent class courses reread on entry and focus, but never regenerate on those reads', async () => {
  const cache = client(), read = vi.spyOn(service, 'listClassSessions')
  const content = <ClassScheduleSection tuitionClass={tuitionClass} />
  const first = mount(cache, '/classes/class-a/sessions', content)
  await screen.findByRole('link', { name: /18:00/ })
  first.unmount(); backend.sessions = [{ ...course('模拟新课程'), current_start_at: malaysiaDateTime(todayInMalaysia(), '20:00') }]
  mount(cache, '/classes/class-a/sessions', content)
  expect(await screen.findByRole('link', { name: /20:00/ })).toBeVisible()
  backend.sessions = [{ ...course('焦点刷新课程'), current_start_at: malaysiaDateTime(todayInMalaysia(), '21:00') }]
  await act(async () => { focusManager.setFocused(false) })
  await act(async () => { focusManager.setFocused(true) })
  expect(await screen.findByRole('link', { name: /21:00/ })).toBeVisible()
  expect(read).toHaveBeenCalledTimes(3)
  expect(backend.generations).toHaveLength(1)
  console.info('F2 class: list reads=3 (entry/reentry/focus); generation=1; 18:00→20:00→21:00 visible')
})

it('retained all-day date survives hiding and a failed recheck cannot submit stale protection counts', async () => {
  mount(client())
  await screen.findByRole('link', { name: /模拟旧课程/ })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '全日停课' }))
  fireEvent.change(screen.getByLabelText('停课日期'), { target: { value: '2026-10-08' } })
  await screen.findByRole('button', { name: '停课 1 堂 · 保留 0 堂' })
  await user.click(screen.getByRole('button', { name: '课程名单' }))
  backend.fail = true
  await user.click(screen.getByRole('button', { name: '全日停课' }))
  expect(screen.getByLabelText('停课日期')).toHaveValue('2026-10-08')
  await screen.findByText('当天课程载入失败，请重试。')
  expect(screen.getByRole('button', { name: '停课 1 堂 · 保留 0 堂' })).toBeDisabled()
  expect(within(screen.getByRole('region', { name: '全日停课' })).getByText('模拟旧课程')).toBeVisible()
  backend.fail = false
  await user.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '停课 1 堂 · 保留 0 堂' })).toBeEnabled())
  const stop = vi.spyOn(service, 'stopSessionsForDate')
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: '停课 1 堂 · 保留 0 堂' }))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('保留'))
  expect(stop).not.toHaveBeenCalled()
})

it('class management hides the course read during focus/reconnect and failed re-entry retains history for retry', async () => {
  backend.sessions = [course('模拟旧课程', true)]
  const cache = client(), read = vi.spyOn(service, 'listClassSessions')
  mount(cache, '/classes/class-a/sessions?list=history', <ClassScheduleSection tuitionClass={tuitionClass} />)
  await screen.findByRole('link', { name: /2025\/1\/1/ })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '课表管理' }))
  await act(async () => { focusManager.setFocused(false); onlineManager.setOnline(false) })
  await act(async () => { focusManager.setFocused(true); onlineManager.setOnline(true) })
  await settle()
  expect(read).toHaveBeenCalledTimes(1)
  expect(backend.generations).toHaveLength(1)
  backend.fail = true
  await user.click(screen.getByRole('button', { name: '历史课程' }))
  await screen.findByText('课程载入失败。')
  expect(screen.getByRole('link', { name: /2025\/1\/1/ })).toBeVisible()
  backend.fail = false; backend.sessions = [{ ...course('新历史', true), current_start_at: '2025-02-02T06:00:00Z' }]
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('link', { name: /2025\/2\/2/ })).toBeVisible()
  expect(read).toHaveBeenCalledTimes(3)
  expect(backend.generations).toHaveLength(1)
})

it('all-day date generation failure is retryable and cannot expose a ready stop action before successful preparation', async () => {
  backend.failGeneration = true
  mount(client(), '/attendance?panel=management')
  await screen.findByText('当天课程准备失败，请重试。')
  expect(backend.reads).toBe(0)
  expect(screen.getByRole('button', { name: '停课 0 堂 · 保留 0 堂' })).toBeDisabled()
  backend.failGeneration = false
  await userEvent.setup().click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '停课 1 堂 · 保留 0 堂' })).toBeEnabled())
  expect(backend.reads).toBe(1)
  expect(backend.generations).toEqual([
    { p_from_date: todayInMalaysia(), p_to_date: todayInMalaysia() },
    { p_from_date: todayInMalaysia(), p_to_date: todayInMalaysia() },
  ])
})
