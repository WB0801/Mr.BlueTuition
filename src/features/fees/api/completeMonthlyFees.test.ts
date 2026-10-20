import { listMonthlyFees } from './feesService'
const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => api }))
it('complete monthly reads preserve original month and student filters over server-capped pages', async () => {
  const rows = Array.from({ length: 1005 }, (_, n) => ({ id: String(n), normal_amount: '70', actual_amount: '60', enrollment: null })), offsets: number[] = [], scopes: unknown[][] = []
  api.from.mockImplementation(() => {
    let from = 0
    const q = { select: () => q, order: () => q, eq: (...args: unknown[]) => { scopes.push(args); return q }, range: (start: number) => { from = start; offsets.push(start); return q }, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows.slice(from, from + 200), error: null })) }
    return q
  })
  const result = await listMonthlyFees({ complete: true, feeMonth: '2026-10-01', studentId: 's' })
  expect(result).toHaveLength(1005); expect(result[1004]).toMatchObject({ id: '1004', actual_amount: 60 })
  expect(offsets).toEqual([0, 200, 400, 600, 800, 1000, 1005]); expect(scopes).toContainEqual(['fee_month', '2026-10-01']); expect(scopes).toContainEqual(['student_id', 's']); expect(api.rpc).not.toHaveBeenCalled()
})
