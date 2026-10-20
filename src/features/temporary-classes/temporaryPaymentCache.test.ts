import { QueryClient } from '@tanstack/react-query'
import { refreshTemporaryPayment } from './temporaryPaymentCache'
import { installContextDataInvalidation } from '../../components/contextual/contextDataInvalidation'
import type { TemporaryClassEnrollment, TemporaryClassPayment } from '../../types/domain'
it('patches the same payment across both entries, cancels stale reads, and leaves other records and generators intact', async () => {
  const client = new QueryClient(); installContextDataInvalidation(client)
  const payment = { id: 'pay-a', amount: 40, payment_status: 'unpaid', temporary_class_enrollment_id: 'en-a', receipt_status: 'not_applicable' } as TemporaryClassPayment
  const enrollment = { id: 'en-a', temporary_class_id: 'c', student_id: 's', payment } as TemporaryClassEnrollment
  const other = { ...payment, id: 'pay-b', amount: 50 }
  const list = ['temporary-fees', 'list', 'all'], original = ['temporary-class', 'c', 'enrollments'], student = ['temporary-classes', 'student', 's']
  const prior = [{ payment, enrollment, class: { id: 'c' } }, { payment: other, enrollment: { ...enrollment, id: 'en-b', payment: other }, class: { id: 'c' } }]
  client.setQueryData(list, prior); client.setQueryData(original, [enrollment, { ...enrollment, id: 'en-b', payment: other }]); client.setQueryData(student, [enrollment])
  const retained = ['temporary-fees', 'editing', payment.id, 'c', 's']
  client.setQueryData(retained, prior[0])
  const untouched = [['monthly-fees-generation', '2026-10-01'], ['context-session-generation', '2026-10-01']]
  untouched.forEach(key => client.setQueryData(key, ['unchanged']))
  client.setQueryData(['temporary-classes', 'active'], ['old counts']); client.setQueryData(['receipt-queue'], ['old receipt'])
  let finish!: (value: typeof prior) => void
  const pending = client.fetchQuery({ queryKey: list, queryFn: () => new Promise<typeof prior>(resolve => { finish = resolve }) }).catch(() => undefined)
  await refreshTemporaryPayment(client, enrollment, { ...payment, amount: 30 })
  finish(prior); await pending
  expect(client.getQueryData<typeof prior>(list)?.map(r => [r.payment.id, r.payment.amount])).toEqual([['pay-a', 30], ['pay-b', 50]])
  expect(client.getQueryData<TemporaryClassEnrollment[]>(original)?.[0].payment?.amount).toBe(30)
  expect(client.getQueryData<TemporaryClassEnrollment[]>(student)?.[0].payment?.amount).toBe(30)
  expect(client.getQueryData<typeof prior[number]>(retained)?.payment.amount).toBe(30)
  expect(client.getQueryState(['temporary-classes', 'active'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['receipt-queue'])?.isInvalidated).toBe(true)
  untouched.forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(false))
})
