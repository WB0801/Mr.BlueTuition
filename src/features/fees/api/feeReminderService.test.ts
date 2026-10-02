import { loadFeeReminder } from './feeReminderService'

const fake = vi.hoisted(() => ({ calls: [] as { table: string; filters: [string, unknown][]; range?: number[] }[], failPage: false }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({
  from(table: string) {
    const call = { table, filters: [] as [string, unknown][], range: undefined as number[] | undefined }; fake.calls.push(call)
    const builder = {
      select: () => builder, eq: (key: string, value: unknown) => { call.filters.push([key, value]); return builder }, order: () => builder,
      abortSignal: () => builder, range: (from: number, to: number) => { call.range = [from, to]; return builder },
      single: async () => ({ data: { id: 'a', name: '蓝炜滨', phone: '012-0000001' }, error: null }),
      then(resolve: (response: unknown) => unknown) {
        const offset = call.range?.[0] ?? 0
        const rows = Array.from({ length: offset === 0 ? 200 : 1 }, (_, i) => ({ id: `fee-${offset + i}`, student_id: 'a', fee_month: '2026-09-01', actual_amount: '100', normal_amount: '120', payment_status: 'unpaid', enrollment: null }))
        return Promise.resolve(resolve({ data: rows, error: fake.failPage && offset > 0 ? new Error('second page failed') : null }))
      },
    }; return builder
  },
  rpc: () => { throw new Error('Reminders must not generate or write records') },
}) }))
beforeEach(() => { fake.calls = []; fake.failPage = false })
it('reads fresh identity and every page for this student without a class filter, writes or RPC', async () => {
  const result = await loadFeeReminder('a', new AbortController().signal)
  expect(result.student.name).toBe('蓝炜滨')
  expect(result.fees).toHaveLength(201)
  expect(result.fees.at(-1)).toMatchObject({ id: 'fee-200', actual_amount: 100 })
  const queries = fake.calls.filter(call => call.table === 'monthly_fees')
  expect(queries.map(call => call.range)).toEqual([[0, 199], [200, 399]])
  expect(queries.every(call => JSON.stringify(call.filters) === JSON.stringify([['payment_status', 'unpaid'], ['student_id', 'a']]))).toBe(true)
})
it('fails closed if a later page fails, rather than returning an incomplete summary', async () => {
  fake.failPage = true
  await expect(loadFeeReminder('a')).rejects.toThrow('second page failed')
})
it('does not read records when already cancelled', async () => {
  const controller = new AbortController(); controller.abort()
  await expect(loadFeeReminder('a', controller.signal)).rejects.toThrow()
  expect(fake.calls).toEqual([])
})
