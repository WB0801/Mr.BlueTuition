import type { QueryClient } from '@tanstack/react-query'
import type { TemporaryClassEnrollment, TemporaryClassPayment } from '../../types/domain'
import type { TemporaryFeeRecord } from '../fees/api/temporaryFeesService'

/** A verified original payment also supersedes a still-fresh list snapshot. */
export function patchTemporaryFeeLists(client: QueryClient, updated: TemporaryClassPayment) {
  client.setQueriesData<TemporaryFeeRecord[]>({ queryKey: ['temporary-fees', 'list'] }, current => current?.map(item => item.payment.id === updated.id ? { ...item, payment: updated, enrollment: { ...item.enrollment, payment: updated } } : item))
}

/** Both entry points update the same payment UUID; do not invalidate any generator. */
export async function refreshTemporaryPayment(client: QueryClient, enrollment: TemporaryClassEnrollment, updated?: TemporaryClassPayment) {
  const reads = [['temporary-fees'], ['temporary-class', enrollment.temporary_class_id, 'enrollments'], ['temporary-classes', 'student', enrollment.student_id]]
  await Promise.all(reads.map(queryKey => client.cancelQueries({ queryKey })))
  if (updated) {
    client.setQueriesData<TemporaryFeeRecord>({ queryKey: ['temporary-fees', 'editing'] }, current => current?.payment.id === updated.id ? { ...current, payment: updated, enrollment: { ...current.enrollment, payment: updated } } : current)
    patchTemporaryFeeLists(client, updated)
    for (const queryKey of reads.slice(1)) client.setQueriesData<TemporaryClassEnrollment[]>({ queryKey }, current => current?.map(item => item.payment?.id === updated.id ? { ...item, payment: updated } : item))
  }
  await Promise.all([
    ...reads, ['temporary-classes'], ['pending-receipts'], ['pending-receipt-count'], ['receipt-queue'],
  ].map(queryKey => client.invalidateQueries({ queryKey })))
}
