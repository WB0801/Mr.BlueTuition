import type { QueryClient } from '@tanstack/react-query'
import type { TemporaryClassEnrollment, TemporaryClassPayment } from '../../types/domain'
import type { TemporaryFeeRecord } from '../fees/api/temporaryFeesService'

/** Cancellation affects only existing read snapshots; never invalidate generators. */
export async function refreshTemporaryCancellation(client: QueryClient, enrollment: TemporaryClassEnrollment, updated: TemporaryClassEnrollment) {
  const keys = [['temporary-class', enrollment.temporary_class_id], ['temporary-classes'], ['temporary-fees'],
    ['pending-receipts'], ['pending-receipt-count'], ['receipt-queue'], ['receipt-payment-target'],
    ['attendance'], ['sessions', 'attendance', 'paged-history']]
  await Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey })))
  const merge = (item: TemporaryClassEnrollment) => item.id === updated.id ? { ...item, ...updated, student: item.student, temporary_class: item.temporary_class } : item
  client.setQueriesData<TemporaryClassEnrollment[]>({ queryKey: ['temporary-class', enrollment.temporary_class_id, 'enrollments'] }, rows => rows?.map(merge))
  client.setQueriesData<TemporaryClassEnrollment[]>({ queryKey: ['temporary-classes', 'student', enrollment.student_id] }, rows => rows?.map(merge))
  if (updated.payment) {
    patchTemporaryFeeLists(client, updated.payment, updated)
    client.setQueriesData<TemporaryFeeRecord>({ queryKey: ['temporary-fees', 'editing'] }, row => row?.enrollment.id === updated.id ? { ...row, enrollment: merge(row.enrollment), payment: updated.payment! } : row)
  }
  await Promise.all(keys.map(queryKey => client.invalidateQueries({ queryKey })))
}

/** A verified original payment also supersedes a still-fresh list snapshot. */
export function patchTemporaryFeeLists(client: QueryClient, updated: TemporaryClassPayment, enrollment?: TemporaryClassEnrollment) {
  client.setQueriesData<TemporaryFeeRecord[]>({ queryKey: ['temporary-fees', 'list'] }, current => current?.map(item => item.payment.id === updated.id ? { ...item, payment: updated, enrollment: { ...item.enrollment, ...enrollment, payment: updated } } : item))
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
