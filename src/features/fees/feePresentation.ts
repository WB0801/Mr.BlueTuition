import type { MonthlyFee } from '../../types/domain'

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
