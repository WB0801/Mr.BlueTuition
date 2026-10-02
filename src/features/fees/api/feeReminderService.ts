import type { MonthlyFeeDetails, Student } from '../../../types/domain'
import { getStudent } from '../../students/api/studentsService'
import { listMonthlyFees, type FeeFilters } from './feesService'

export interface FeeReminderSnapshot {
  student: Pick<Student, 'id' | 'name' | 'phone'>
  fees: MonthlyFeeDetails[]
}

// Intentionally separate from generation/query caches: opening a reminder is read-only.
export async function loadFeeReminder(studentId: string, signal?: AbortSignal): Promise<FeeReminderSnapshot> {
  signal?.throwIfAborted()
  const student = await getStudent(studentId)
  if (student.id !== studentId) throw new Error('学生资料不匹配，请重试。')
  const fees = await readUnpaidFees({ studentId }, signal)
  return { student, fees }
}

export async function readUnpaidFees(filters: Pick<FeeFilters, 'studentId' | 'studentIds' | 'classId' | 'feeMonth'>, signal?: AbortSignal): Promise<MonthlyFeeDetails[]> {
  const fees: MonthlyFeeDetails[] = []
  const seen = new Set<string>()
  const pageSize = 200
  for (let offset = 0; ; offset += pageSize) {
    signal?.throwIfAborted()
    const page = await listMonthlyFees({ ...filters, paymentStatus: 'unpaid', range: [offset, offset + pageSize - 1], signal })
    signal?.throwIfAborted()
    for (const fee of page) {
      if (seen.has(fee.id)) throw new Error('读取期间资料已变化，请重试。')
      seen.add(fee.id)
    }
    fees.push(...page)
    if (page.length < pageSize) break
  }
  return fees
}
