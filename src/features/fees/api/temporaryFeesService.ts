import { requireSupabase } from '../../../lib/requireSupabase'
import type { TemporaryClass, TemporaryClassEnrollment, TemporaryClassPayment } from '../../../types/domain'
import { readAllPages } from '../../../utils/readAllPages'
import { parseTemporaryPaymentAmount } from '../../temporary-classes/paymentAmount'
import { malaysiaFeeMonthBounds } from '../unifiedFeePresentation'

export type TemporaryFeeClass = Pick<TemporaryClass, 'id' | 'name' | 'start_at' | 'status'>
export interface TemporaryFeeRecord { payment: TemporaryClassPayment; enrollment: TemporaryClassEnrollment; class: TemporaryFeeClass }
type TemporaryFeeRow = TemporaryClassPayment & { enrollment: TemporaryClassEnrollment & { class: TemporaryFeeClass } }
const selection = `*,enrollment:temporary_class_enrollments!temporary_class_payments_enrollment_owner_fk!inner(
  id,owner_id,temporary_class_id,student_id,joined_at,status,created_at,
  student:students!temporary_class_enrollments_student_owner_fk(id,name,school_class,phone),
  class:temporary_classes!temporary_class_enrollments_class_owner_fk(id,name,start_at,status))`

/** Read original one-off payments under existing owner RLS and composite owner FKs. No RPCs. */
export async function listTemporaryFeeRecords(filters: { month: string; classId?: string; studentId?: string }, signal?: AbortSignal): Promise<TemporaryFeeRecord[]> {
  const bounds = filters.month === 'all' ? null : malaysiaFeeMonthBounds(filters.month)
  const rows = await readAllPages(async (from, to) => {
    let query = requireSupabase().from('temporary_class_payments').select(selection).order('created_at').order('id')
    if (filters.classId) query = query.eq('enrollment.temporary_class_id', filters.classId)
    if (filters.studentId) query = query.eq('enrollment.student_id', filters.studentId)
    if (bounds) query = query.or(`payment_status.eq.unpaid,and(payment_status.eq.paid,paid_at.gte.${bounds[0]},paid_at.lt.${bounds[1]})`)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query.range(from, to)
    if (error) throw error
    return (data ?? []) as unknown as TemporaryFeeRow[]
  }, signal)
  return rows.map(mapTemporaryFeeRecord)
}

/** Recheck only the retained original payment, even when paid outside the list month. */
export async function getTemporaryFeeRecord(paymentId: string, classId: string, studentId: string, signal?: AbortSignal): Promise<TemporaryFeeRecord> {
  if (!paymentId || !classId || !studentId) throw new Error('临时班费用关联不完整，请重试。')
  let query = requireSupabase().from('temporary_class_payments').select(selection)
    .eq('id', paymentId).eq('enrollment.temporary_class_id', classId).eq('enrollment.student_id', studentId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.single()
  if (error) throw error
  return mapTemporaryFeeRecord(data as unknown as TemporaryFeeRow)
}

function mapTemporaryFeeRecord({ enrollment, ...rawPayment }: TemporaryFeeRow): TemporaryFeeRecord {
  const klass = enrollment?.class
  if (!klass?.id || !enrollment.student?.id || rawPayment.temporary_class_enrollment_id !== enrollment.id || enrollment.owner_id !== rawPayment.owner_id || klass.id !== enrollment.temporary_class_id) throw new Error('临时班费用关联不完整，请重试。')
  const payment = { ...rawPayment, amount: parseTemporaryPaymentAmount(String(rawPayment.amount)) }
  if (!['unpaid', 'paid'].includes(payment.payment_status) || (payment.payment_status === 'paid' && !Number.isFinite(Date.parse(payment.paid_at ?? '')))) throw new Error('临时班缴费状态异常，请核对。')
  return { payment, enrollment: { ...enrollment, payment }, class: klass }
}
export async function listTemporaryFeeClasses(signal?: AbortSignal): Promise<TemporaryFeeClass[]> {
  return readAllPages(async (from, to) => {
    let query = requireSupabase().from('temporary_classes').select('id,name,start_at,status').order('start_at', { ascending: false }).order('id')
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query.range(from, to)
    if (error) throw error
    return (data ?? []) as TemporaryFeeClass[]
  }, signal)
}
