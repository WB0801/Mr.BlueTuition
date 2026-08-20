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
