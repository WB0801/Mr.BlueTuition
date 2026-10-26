import { getTemporaryFeeRecord, listTemporaryFeeClasses, listTemporaryFeeRecords } from './temporaryFeesService'
const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), requests: [] as Array<Record<string, unknown>> }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => api }))
const row = (id: string, amount: unknown = '30.25') => ({ id, owner_id: 'owner', temporary_class_enrollment_id: `en-${id}`, amount, payment_status: 'unpaid', paid_at: null as string | null, receipt_status: 'not_applicable', receipt_completed_at: null, created_at: '2026-01-01', updated_at: '2026-01-01', enrollment: { id: `en-${id}`, owner_id: 'owner', temporary_class_id: 't', student_id: 's', status: 'ended', joined_at: '', created_at: '', student: { id: 's', name: '虚构学生', school_class: null, phone: null }, class: { id: 't', name: '已结束临时班', start_at: '2025-01-01T10:00:00Z', status: 'ended' } } })
let data: ReturnType<typeof row>[], failAt: number | undefined
beforeEach(() => {
  vi.clearAllMocks(); api.requests.length = 0; data = Array.from({ length: 405 }, (_, n) => row(String(n))); failAt = undefined
  api.from.mockImplementation((table: string) => {
    const request: Record<string, unknown> = { table }; api.requests.push(request)
    const q: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'eq', 'neq', 'or', 'abortSignal']) q[method] = (...args: unknown[]) => { request[method] = [...((request[method] as unknown[][]) ?? []), args]; return q }
    q.range = (from: number, to: number) => { request.range = [from, to]; return Promise.resolve({ data: from === failAt ? null : data.slice(from, Math.min(to + 1, from + 137)), error: from === failAt ? new Error('isolated failure') : null }) }
    q.single = () => Promise.resolve({ data: data.find(r => ((request.eq as string[][]) ?? []).some(([field, value]) => field === 'id' && value === r.id)), error: null })
    return q
  })
})
it('completes short server pages with original IDs and no generation', async () => {
  const result = await listTemporaryFeeRecords({ month: '2026-10', classId: 't', studentId: 's' })
  expect(result).toHaveLength(405); expect(result[404]).toMatchObject({ payment: { id: '404', amount: 30.25 }, class: { status: 'ended' } })
  expect(api.requests.map(r => r.range)).toEqual([[0, 199], [137, 336], [274, 473], [405, 604]])
  expect(api.requests[0].eq).toEqual([['enrollment.temporary_class_id', 't'], ['enrollment.student_id', 's']])
  expect(api.requests[0].or).toEqual([['payment_status.eq.unpaid,and(payment_status.eq.paid,paid_at.gte.2026-09-30T16:00:00.000Z,paid_at.lt.2026-10-31T16:00:00.000Z)']])
  expect(new Set(api.requests.map(r => r.table))).toEqual(new Set(['temporary_class_payments'])); expect(api.rpc).not.toHaveBeenCalled()
})
it('rejects a later-page error instead of returning a partial list', async () => { failAt = 137; await expect(listTemporaryFeeRecords({ month: 'all' })).rejects.toThrow('isolated failure') })
it.each([null, '', -1, Infinity, 'bad', '1.001'])('rejects unreliable amount %s', async amount => { data = [row('bad', amount)]; await expect(listTemporaryFeeRecords({ month: 'all' })).rejects.toThrow() })
it('keeps zero unpaid and all-months does not filter by paid time', async () => {
  data = [row('zero', '0')]; expect((await listTemporaryFeeRecords({ month: 'all' }))[0].payment).toMatchObject({ amount: 0, payment_status: 'unpaid' }); expect(api.requests[0].or).toBeUndefined()
})
it('includes ended class options without reading registrations or attendance', async () => {
  data = [{ id: 't', name: '历史临时班', status: 'ended', start_at: '2025-01-01' }] as never
  expect(await listTemporaryFeeClasses()).toHaveLength(1); expect(api.requests[0].table).toBe('temporary_classes'); expect(api.requests[0].select).toEqual([['id,name,start_at,status']])
})
it('rechecks only the retained original ID, class and student without any month filter or RPC', async () => {
  data[0] = { ...data[0], payment_status: 'paid', paid_at: '2026-11-01T00:00:00Z' } as typeof data[number]
  const controller = new AbortController()
  const result = await getTemporaryFeeRecord('0', 't', 's', controller.signal)
  expect(result.payment).toMatchObject({ id: '0', payment_status: 'paid', paid_at: '2026-11-01T00:00:00Z' })
  expect(api.requests).toHaveLength(1)
  expect(api.requests[0].table).toBe('temporary_class_payments')
  expect(api.requests[0].eq).toEqual([['id', '0'], ['enrollment.temporary_class_id', 't'], ['enrollment.student_id', 's']])
  expect(api.requests[0].or).toBeUndefined(); expect(api.requests[0].range).toBeUndefined()
  expect(api.requests[0].abortSignal).toEqual([[controller.signal]])
  expect(api.rpc).not.toHaveBeenCalled()
})
it('does not broaden an incomplete retained identity into a list read', async () => {
  await expect(getTemporaryFeeRecord('', 't', 's')).rejects.toThrow()
  expect(api.from).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled()
})
it('excludes cancelled debt but preserves ended history and exact cancelled payment verification', async () => {
  data = [row('ended'), { ...row('cancelled'), enrollment: { ...row('cancelled').enrollment, status: 'cancelled' } }]
  expect((await listTemporaryFeeRecords({ month: 'all' })).map(r => r.payment.id)).toEqual(['ended'])
  expect(api.requests[0].neq).toEqual([['enrollment.status', 'cancelled']])
  expect((await getTemporaryFeeRecord('cancelled','t','s')).enrollment.status).toBe('cancelled')
})
