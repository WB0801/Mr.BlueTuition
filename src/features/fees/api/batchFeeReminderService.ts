import type { MonthlyFeeDetails } from '../../../types/domain'
import { summarizeUnpaidMonth } from '../reminderRules'
import { readUnpaidFees } from './feeReminderService'

export interface BatchReminderScope {
  feeMonth: string
  classId?: string
  studentId?: string
  search?: string
}

export interface BatchReminderCandidate {
  studentId: string
  name: string
  phone: string | null
  amount: number
}

function validate(rows: MonthlyFeeDetails[], month: string) {
  for (const row of rows) {
    if (row.fee_month !== month || !Number.isFinite(row.actual_amount) || row.actual_amount < 0
      || !row.student || row.student.id !== row.student_id || !row.student.name.trim()
      || !row.enrollment?.class || row.enrollment.class.id !== row.enrollment.class_id) {
      throw new Error('欠费资料异常，请核对后重试。')
    }
  }
}

// Scope selects people; the second read intentionally removes class/search filters.
// Both reads are paginated and read-only. A failed page never becomes a partial list.
export async function loadBatchReminderCandidates(scope: BatchReminderScope, signal?: AbortSignal): Promise<BatchReminderCandidate[]> {
  signal?.throwIfAborted()
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(scope.feeMonth)) throw new Error('请选择一个收费月份。')
  const scoped = await readUnpaidFees({ feeMonth: scope.feeMonth, classId: scope.classId, studentId: scope.studentId }, signal)
  validate(scoped, scope.feeMonth)
  const search = scope.search?.trim().toLocaleLowerCase() ?? ''
  const ids = [...new Set(scoped.filter((row) => row.payment_status === 'unpaid' && row.actual_amount > 0
    && (!search || row.student!.name.toLocaleLowerCase().includes(search) || row.enrollment?.class?.name.toLocaleLowerCase().includes(search)))
    .map((row) => row.student_id))]
  const complete: MonthlyFeeDetails[] = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    complete.push(...await readUnpaidFees({ feeMonth: scope.feeMonth, studentIds: ids.slice(offset, offset + 100) }, signal))
  }
  validate(complete, scope.feeMonth)
  return ids.flatMap((studentId) => {
    const summary = summarizeUnpaidMonth(complete, studentId, scope.feeMonth)
    if (!summary.records.length) return []
    const student = summary.records[0].student!
    return [{ studentId, name: student.name, phone: student.phone, amount: summary.total }]
  }).sort((a, b) => a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId))
}
