import { requireSupabase } from '../../../lib/requireSupabase'
import type { EnsureMonthlyFeesResult, MonthlyFee, MonthlyFeeDetails, Student } from '../../../types/domain'

const feeSelection = `
  *,
  enrollment:enrollments!inner(
    id,class_id,join_date,end_date,status,
    student:students(id,name,school_class,phone),
    class:classes(id,name,status)
  )
`

type FeeQueryRow = MonthlyFee & {
  enrollment: (MonthlyFeeDetails['enrollment'] & {
    student: Pick<Student, 'id' | 'name' | 'school_class' | 'phone'> | null
  }) | null
}

interface FeeFilters {
  feeMonth?: string
  paymentStatus?: 'unpaid' | 'paid' | 'waived'
  receiptStatus?: 'pending' | 'completed'
  classId?: string
  studentId?: string
  enrollmentId?: string
}

export async function ensureMonthlyFees(fromMonth: string, toMonth = fromMonth): Promise<EnsureMonthlyFeesResult> {
  const { data, error } = await requireSupabase().rpc('ensure_monthly_fees', {
    p_from_month: fromMonth,
    p_to_month: toMonth,
  })
  if (error) throw error
  return {
    created_count: Number(data ?? 0),
  }
}

export async function listMonthlyFees(filters: FeeFilters = {}): Promise<MonthlyFeeDetails[]> {
  let query = requireSupabase()
    .from('monthly_fees')
    .select(feeSelection)
    .order('fee_month', { ascending: false })
    .order('created_at', { ascending: true })

  if (filters.feeMonth) query = query.eq('fee_month', filters.feeMonth)
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)
  if (filters.receiptStatus) query = query.eq('receipt_status', filters.receiptStatus)
  if (filters.classId) query = query.eq('enrollment.class_id', filters.classId)
  if (filters.studentId) query = query.eq('student_id', filters.studentId)
  if (filters.enrollmentId) query = query.eq('enrollment_id', filters.enrollmentId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapMonthlyFeeDetails(row as unknown as FeeQueryRow))
}

export async function listPendingReceipts(): Promise<MonthlyFeeDetails[]> {
  const { data, error } = await requireSupabase()
    .from('monthly_fees')
    .select(feeSelection)
    .eq('payment_status', 'paid')
    .eq('receipt_status', 'pending')
    .order('fee_month', { ascending: true })
    .order('paid_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapMonthlyFeeDetails(row as unknown as FeeQueryRow))
}

export async function countPendingReceipts(): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('monthly_fees')
    .select('id', { count: 'exact', head: true })
    .eq('payment_status', 'paid')
    .eq('receipt_status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function updateMonthlyFeeAmount(feeId: string, actualAmount: number) {
  return callFeeRpc('update_monthly_fee_amount', {
    p_fee_id: feeId,
    p_actual_amount: actualAmount,
  })
}

export async function markMonthlyFeePaid(feeId: string) {
  return callFeeRpc('mark_monthly_fee_paid', { p_fee_id: feeId })
}

export async function undoMonthlyFeePayment(feeId: string) {
  return callFeeRpc('undo_monthly_fee_payment', { p_fee_id: feeId })
}

export async function waiveMonthlyFee(feeId: string) {
  return callFeeRpc('waive_monthly_fee', { p_fee_id: feeId })
}

export async function completeMonthlyFeeReceipts(feeIds: string[]): Promise<number> {
  const { data, error } = await requireSupabase().rpc('complete_monthly_fee_receipts', {
    p_fee_ids: feeIds,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function restoreMonthlyFeeReceipt(feeId: string) {
  return callFeeRpc('restore_monthly_fee_receipt', { p_fee_id: feeId })
}

async function callFeeRpc(
  functionName: string,
  parameters: Record<string, string | number>,
): Promise<MonthlyFee> {
  const { data, error } = await requireSupabase().rpc(functionName, parameters)
  if (error) throw error
  return normalizeFee(data as MonthlyFee)
}

function normalizeFee<T extends Partial<MonthlyFee>>(fee: T): T {
  return {
    ...fee,
    normal_amount: Number(fee.normal_amount ?? 0),
    actual_amount: Number(fee.actual_amount ?? 0),
  }
}

export function mapMonthlyFeeDetails(row: FeeQueryRow): MonthlyFeeDetails {
  const nestedEnrollment = row.enrollment
  const student = nestedEnrollment?.student ?? null
  const enrollment = nestedEnrollment
    ? {
        id: nestedEnrollment.id,
        class_id: nestedEnrollment.class_id,
        join_date: nestedEnrollment.join_date,
        end_date: nestedEnrollment.end_date,
        status: nestedEnrollment.status,
        class: nestedEnrollment.class,
      }
    : null

  return {
    ...normalizeFee(row),
    student,
    enrollment,
  }
}
