import { QueryClient } from '@tanstack/react-query'
import { installContextDataInvalidation, invalidateContextClassCreation } from './contextDataInvalidation'

function setup() {
  const client = new QueryClient(); installContextDataInvalidation(client)
  const keys = [ ['monthly-fees-generation','2026-10-01'], ['context-session-generation','2026-10-01'], ['grades','student','a','school'], ['tuition-quizzes','overview','class-a'], ['attendance','student-history-scope','a'], ['sessions','attendance','paged-history','','a','2026-10-01'], ['temporary-classes','student','a'], ['attendance','target','guest-draft'] ]
  keys.forEach(key => client.setQueryData(key, []))
  return { client, stale: (index: number) => client.getQueryState(keys[index])?.isInvalidated }
}
it('invalidates dependent fee/session generation after enrollment/class writes, not payment or signature writes', async () => {
  const first = setup(); await first.client.invalidateQueries({ queryKey: ['enrollments'] })
  expect(first.stale(0)).toBe(true); expect(first.stale(4)).toBe(true); expect(first.stale(5)).toBe(true)
  const second = setup(); await invalidateContextClassCreation(second.client)
  expect(second.stale(1)).toBe(true)
  const schedule = setup(); await schedule.client.invalidateQueries({ queryKey: ['classes'] }); await schedule.client.invalidateQueries({ queryKey: ['schedule-rules','class-a'] })
  expect(schedule.stale(1)).toBe(false)
  const payment = setup(); await payment.client.invalidateQueries({ queryKey: ['monthly-fees'] })
  expect(payment.stale(0)).toBe(false); expect(payment.stale(1)).toBe(false)
  const signature = setup(); await signature.client.invalidateQueries({ queryKey: ['attendance','target','roster'] })
  expect(signature.stale(1)).toBe(false); expect(signature.stale(6)).toBe(true); expect(signature.stale(7)).toBe(false)
})
it('observes exact invalidation calls from direct awaited grade saves, even without a matching cached global query', async () => {
  const school = setup(); await school.client.invalidateQueries({ queryKey: ['school-exam','exam-a','scores'], exact: true })
  expect(school.stale(2)).toBe(true)
  const quiz = setup(); await quiz.client.invalidateQueries({ queryKey: ['tuition-quiz','quiz-a','scores'], exact: true })
  expect(quiz.stale(2)).toBe(true); expect(quiz.stale(3)).toBe(true)
  const temporary = setup(); await temporary.client.invalidateQueries({ queryKey: ['temporary-class','temp-a'] })
  expect(temporary.stale(6)).toBe(true); expect(temporary.stale(4)).toBe(true); expect(temporary.stale(5)).toBe(true)
})

it('does not accept an old in-flight scope response after a related write', async () => {
  const { client } = setup(); const key = ['attendance','student-history-scope','a']
  let finish!: (value: string[]) => void
  const pending = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<string[]>(resolve => { finish = resolve }) }).catch(() => undefined)
  await client.invalidateQueries({ queryKey: ['enrollments'] })
  finish(['old enrollment']); await pending
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  expect(client.getQueryData(key)).not.toEqual(['old enrollment'])
})

it.each(['students', 'classes'])('refreshes identity snapshots after %s edits without repeating either generator or losing loaded pages', async root => {
  const { client } = setup()
  const reads = [['monthly-fees','list','all','','a'], ['pending-receipts'], ['receipt-queue','completed','2026-09'], ['receipt-payment-target','monthly_fee:fee-a','a'], ['attendance','course-a','roster'], ['attendance','course-a','cross-class-candidates',''], ['attendance','course-a','makeup-sources','enrollment-a'], ['temporary-class','temp-a','enrollments'], ['temporary-classes','student','a'], ['enrollments','student','a'], ['enrollments','class','class-a'], ['grades','enrollment','enrollment-a','quizzes'], ['school-exam','exam-a','roster'], ['tuition-quiz','quiz-a','roster'], ['quiz-rewards']]
  reads.forEach(key => client.setQueryData(key, ['old identity']))
  const legacyGenerator = ['monthly-fees','ensure','enrollment-a','2025-01','2026-10']
  client.setQueryData(legacyGenerator, {})
  const history = ['sessions','attendance','paged-history','','a','2026-10-01']
  const pages = { pages: [['page one'], ['page two']], pageParams: [null, 'cursor'] }
  client.setQueryData(history, pages)
  await client.invalidateQueries({ queryKey: [root] })
  reads.forEach(key => expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true))
  expect(client.getQueryState(legacyGenerator)?.isInvalidated).toBe(false)
  expect(client.getQueryState(['monthly-fees-generation','2026-10-01'])?.isInvalidated).toBe(false)
  expect(client.getQueryState(['context-session-generation','2026-10-01'])?.isInvalidated).toBe(false)
  expect(client.getQueryData(history)).toEqual(pages)
})

it('cancels a delayed identity read so it cannot restore an old name after editing', async () => {
  const { client } = setup(); const key = ['monthly-fees','list','all','','a']
  client.setQueryData(key, ['cached name'])
  let finish!: (value: string[]) => void
  const pending = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<string[]>(resolve => { finish = resolve }) }).catch(() => undefined)
  await client.invalidateQueries({ queryKey: ['students'] })
  finish(['old name']); await pending
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  expect(client.getQueryData(key)).not.toEqual(['old name'])
})
