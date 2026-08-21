import type { MonthlyFee, MonthlyFeeDetails } from '../../types/domain'

export function getFeeStatusLabel(fee: MonthlyFee) {
  if (fee.payment_status === 'waived') return '不再追缴'
  if (fee.payment_status === 'unpaid') return '未缴'
  return fee.receipt_status === 'completed' ? '已缴 · 收据已处理' : '已缴 · 收据待处理'
}

export function canWaiveFinalMonth(fee: MonthlyFee & { enrollment?: { end_date: string | null; status: string } | null }) {
  return fee.payment_status === 'unpaid'
    && fee.enrollment?.status === 'ended'
    && fee.enrollment.end_date?.slice(0, 7) === fee.fee_month.slice(0, 7)
}

export function getFeePriority(fee: MonthlyFee) {
  if (fee.payment_status === 'unpaid') return 0
  if (fee.payment_status === 'paid' && fee.receipt_status === 'pending') return 1
  if (fee.payment_status === 'paid') return 2
  return 3
}

export function sortFeesByActionPriority(fees: MonthlyFeeDetails[]) {
  return [...fees].sort((left, right) => {
    const priority = getFeePriority(left) - getFeePriority(right)
    if (priority !== 0) return priority
    const student = (left.student?.name ?? '').localeCompare(right.student?.name ?? '', 'zh-Hans')
    if (student !== 0) return student
    const className = (left.enrollment?.class?.name ?? '').localeCompare(right.enrollment?.class?.name ?? '', 'zh-Hans')
    if (className !== 0) return className
    return left.created_at.localeCompare(right.created_at)
  })
}

export type FeeStatusFilter = 'unpaid' | 'paid' | 'all'

export function matchesFeeStatus(fee: MonthlyFee, status: FeeStatusFilter) {
  if (status === 'all') return true
  return fee.payment_status === status
}

export function sortFeesForWorkflow(
  fees: MonthlyFeeDetails[],
  options: { status: FeeStatusFilter; classId?: string },
) {
  return [...fees].sort((left, right) => {
    const priority = getFeePriority(left) - getFeePriority(right)
    if (options.status === 'all' && priority !== 0) return priority

    const leftPending = left.payment_status === 'paid' && left.receipt_status === 'pending'
    const rightPending = right.payment_status === 'paid' && right.receipt_status === 'pending'
    if (options.status === 'paid' && leftPending !== rightPending) return leftPending ? -1 : 1

    if (left.payment_status === 'paid' && right.payment_status === 'paid') {
      const leftPaidAt = left.paid_at ?? ''
      const rightPaidAt = right.paid_at ?? ''
      const paidOrder = leftPending && rightPending
        ? leftPaidAt.localeCompare(rightPaidAt)
        : rightPaidAt.localeCompare(leftPaidAt)
      if (paidOrder !== 0) return paidOrder
    }

    if (!options.classId && left.payment_status === 'unpaid' && right.payment_status === 'unpaid') {
      const classOrder = compareText(left.enrollment?.class?.name, right.enrollment?.class?.name)
      if (classOrder !== 0) return classOrder
    }
    const studentOrder = compareText(left.student?.name, right.student?.name)
    if (studentOrder !== 0) return studentOrder
    const classOrder = compareText(left.enrollment?.class?.name, right.enrollment?.class?.name)
    if (classOrder !== 0) return classOrder
    return left.id.localeCompare(right.id)
  })
}

function compareText(left?: string | null, right?: string | null) {
  return (left ?? '').localeCompare(right ?? '', 'zh-Hans')
}
