import { listAttendanceHistoryPage } from './scheduleService'
const mocks = vi.hoisted(() => ({ calls: [] as { method: string; args: unknown[] }[][], rpc: vi.fn() }))
let rows: { id: string; current_start_at: string }[] = []
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({ rpc: mocks.rpc, from: () => {
  const calls: { method: string; args: unknown[] }[] = []; mocks.calls.push(calls)
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve({ data: calls.some((call) => call.method === 'gte') ? [] : rows, error: null }),
  }
  for (const method of ['select', 'lt', 'order', 'limit', 'eq', 'gte', 'or']) builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder }
  return builder
} }) }))
beforeEach(() => { mocks.calls.length = 0; mocks.rpc.mockReset().mockResolvedValue({ error: null }); rows = [] })
it('loads 100 past sessions plus one sentinel, with stable timestamp and UUID ordering', async () => {
  rows = Array.from({ length: 101 }, (_, i) => ({ id: `session-${100 - i}`, current_start_at: '2026-08-01T06:00:00+00:00' }))
  const result = await listAttendanceHistoryPage(null, 'class-a', '2026-09-29')
  expect(result.pastCount).toBe(100)
  expect(result.nextCursor).toEqual({ startAt: rows[99].current_start_at, id: rows[99].id })
  expect(mocks.calls[0]).toContainEqual({ method: 'order', args: ['id', { ascending: false }] })
  expect(mocks.calls[0]).toContainEqual({ method: 'limit', args: [101] })
  for (const calls of mocks.calls) expect(calls).toContainEqual({ method: 'eq', args: ['class_id', 'class-a'] })
})
it('uses a keyset cursor for older records, preserving class scope and not regenerating sessions', async () => {
  await listAttendanceHistoryPage({ startAt: '2026-08-01T06:00:00+00:00', id: 'session-a' }, 'class-a', '2026-09-29')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.calls).toHaveLength(1)
  expect(mocks.calls[0]).toContainEqual({ method: 'or', args: ['current_start_at.lt.2026-08-01T06:00:00+00:00,and(current_start_at.eq.2026-08-01T06:00:00+00:00,id.lt.session-a)'] })
})
it('rejects malformed cursors instead of accepting filter injection', async () => {
  await expect(listAttendanceHistoryPage({ startAt: '2026-08-01T06:00:00Z', id: 'bad),status.eq.cancelled' })).rejects.toThrow('无效')
})
