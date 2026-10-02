import { loadBatchReminderCandidates } from './batchFeeReminderService'
import type { MonthlyFeeDetails } from '../../../types/domain'

const fake = vi.hoisted(() => ({ rows: [] as unknown[], calls: [] as { filters: [string, unknown][]; range?: number[] }[], failLater: false }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({
  from(table: string) {
    if (table !== 'monthly_fees') throw new Error('Only read monthly fees')
    const call = { filters: [] as [string, unknown][], range: undefined as number[] | undefined }; fake.calls.push(call)
    const query = {
      select: () => query, order: () => query, abortSignal: () => query,
      eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query },
      in: (key: string, value: unknown) => { call.filters.push([key, value]); return query },
      range: (a: number, b: number) => { call.range = [a, b]; return query },
      then(resolve: (value: unknown) => unknown) {
        const rows = (fake.rows as MonthlyFeeDetails[]).filter(row => call.filters.every(([key, value]) => {
          const actual = key === 'enrollment.class_id' ? row.enrollment?.class_id : row[key as keyof MonthlyFeeDetails]
          return Array.isArray(value) ? value.includes(actual) : actual === value
        })).map(row => ({ ...row, enrollment: row.enrollment && { ...row.enrollment, student: row.student } }))
        return Promise.resolve(resolve({ data: rows.slice(call.range?.[0] ?? 0, (call.range?.[1] ?? rows.length) + 1), error: fake.failLater && (call.range?.[0] ?? 0) > 0 ? new Error('later page failed') : null }))
      },
    }; return query
  },
  rpc: () => { throw new Error('No generation or writes allowed') },
}) }))
function row(id: string, studentId: string, amount: number, classId = 'class-a'): MonthlyFeeDetails {
  return { id, owner_id: 'owner', student_id: studentId, enrollment_id: `en-${id}`, fee_month: '2026-09-01', normal_amount: 150, actual_amount: amount, payment_status: 'unpaid', paid_at: null, receipt_status: 'not_applicable', receipt_completed_at: null, created_at: '', updated_at: '',
    student: { id: studentId, name: studentId === 'a' ? '蓝炜滨' : studentId === 'b' ? '温晴' : '其他学生', school_class: null, phone: '012-0000001' },
    enrollment: { id: `en-${id}`, class_id: classId, join_date: '2026-01-01', end_date: null, status: 'active', class: { id: classId, name: classId === 'class-a' ? '会计 A' : '数学 B', status: 'active' } } }
}
beforeEach(() => { fake.calls = []; fake.failLater = false; fake.rows = [row('one', 'a', 120), row('two', 'a', 70, 'class-b'), row('b', 'b', 130), { ...row('paid', 'a', 40), payment_status: 'paid' }, { ...row('waived', 'a', 50), payment_status: 'waived' }, row('zero', 'b', 0)] })
it('deduplicates by student UUID, not shared phone, and includes all month classes after scoped selection', async () => {
  const result = await loadBatchReminderCandidates({ feeMonth: '2026-09-01', classId: 'class-a' })
  expect(result.map(item => [item.studentId, item.amount]).sort()).toEqual([['a', 190], ['b', 130]])
  expect(fake.calls.some(call => call.filters.some(([key]) => key === 'enrollment.class_id'))).toBe(true)
  expect(fake.calls.some(call => call.filters.some(([key, value]) => key === 'student_id' && Array.isArray(value) && value.includes('a')) && !call.filters.some(([key]) => key === 'enrollment.class_id'))).toBe(true)
})
it('reads beyond 200 scoped records before declaring the candidate list complete', async () => {
  fake.rows.push(...Array.from({ length: 199 }, (_, n) => row(`extra-${n}`, `s-${n}`, 10)))
  const result = await loadBatchReminderCandidates({ feeMonth: '2026-09-01', classId: 'class-a' })
  expect(result).toHaveLength(201)
  expect(result.find(item => item.studentId === 's-198')?.amount).toBe(10)
  const scoped = fake.calls.filter(call => call.filters.some(([key]) => key === 'enrollment.class_id'))
  expect(scoped.map(call => call.range)).toEqual([[0, 199], [200, 399]])
})
it('applies the current student and name/course search while retaining full cross-class amount', async () => {
  expect(await loadBatchReminderCandidates({ feeMonth: '2026-09-01', classId: 'class-a', studentId: 'a', search: ' 炜滨 ' })).toMatchObject([{ studentId: 'a', amount: 190 }])
  expect(await loadBatchReminderCandidates({ feeMonth: '2026-09-01', studentId: 'a', search: '数学' })).toMatchObject([{ studentId: 'a', amount: 190 }])
  expect(await loadBatchReminderCandidates({ feeMonth: '2026-09-01', search: '不存在' })).toEqual([])
})
it('returns no eligible students for another month or non-collectible fees', async () => {
  expect(await loadBatchReminderCandidates({ feeMonth: '2025-09-01' })).toEqual([])
  fake.rows = [{ ...row('paid', 'a', 40), payment_status: 'paid' }, { ...row('waived', 'a', 50), payment_status: 'waived' }, row('zero', 'b', 0)]
  expect(await loadBatchReminderCandidates({ feeMonth: '2026-09-01' })).toEqual([])
})
it('never returns a partial candidate list after later-page failure', async () => {
  fake.rows = Array.from({ length: 201 }, (_, n) => row(`fee-${n}`, `s-${n}`, 10)); fake.failLater = true
  await expect(loadBatchReminderCandidates({ feeMonth: '2026-09-01' })).rejects.toThrow('later page failed')
})
it.each([NaN, -1, Infinity])('fails closed on abnormal amount %s', async amount => {
  fake.rows = [row('bad', 'a', amount)]
  await expect(loadBatchReminderCandidates({ feeMonth: '2026-09-01' })).rejects.toThrow()
})
it('does not silently discard malformed identity or guess an unspecified month', async () => {
  fake.rows = [{ ...row('bad', 'a', 10), student: null }]
  await expect(loadBatchReminderCandidates({ feeMonth: '2026-09-01' })).rejects.toThrow()
  await expect(loadBatchReminderCandidates({ feeMonth: 'all' })).rejects.toThrow()
})
it('stops a cancelled read before making queries', async () => {
  const controller = new AbortController(); controller.abort()
  await expect(loadBatchReminderCandidates({ feeMonth: '2026-09-01' }, controller.signal)).rejects.toThrow()
  expect(fake.calls).toEqual([])
})
it('fails closed instead of double-counting a repeated fee across pagination', async () => {
  fake.rows = [...Array.from({ length: 200 }, (_, n) => row(`fee-${n}`, 'a', 10)), row('fee-0', 'a', 10)]
  await expect(loadBatchReminderCandidates({ feeMonth: '2026-09-01' })).rejects.toThrow()
})
it('fails closed if the full cross-class read lacks the course identity', async () => {
  const missing = row('other-course', 'a', 70, 'class-b')
  fake.rows.push({ ...missing, enrollment: { ...missing.enrollment!, class: null } })
  await expect(loadBatchReminderCandidates({ feeMonth: '2026-09-01', classId: 'class-a' })).rejects.toThrow()
})
