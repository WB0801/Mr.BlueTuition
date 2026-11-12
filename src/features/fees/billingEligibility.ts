import type { MonthlyFee } from '../../types/domain'

type BillingFee = Pick<MonthlyFee, 'fee_month' | 'payment_status'> & Partial<Pick<MonthlyFee, 'billing_cancelled_at'>> & {
  enrollment?: { join_date?: string; end_date?: string | null; status?: string; transferred_from_enrollment_id?: string | null; class?: { start_date?: string; end_date?: string | null } | null } | null
}

/** Month-overlap rule, including the existing mid-month transfer exception. */
export function feeInapplicableReason(fee: BillingFee): string | null {
  const e = fee.enrollment
  if (!e) return null // Legacy snapshots without joined metadata are never inferred as cancelled.
  const month = fee.fee_month.slice(0, 7)
  if (e.end_date && e.end_date.slice(0, 7) < month) return '报读已结束，此月不适用'
  if (e.join_date && e.join_date.slice(0, 7) > month) return '报读尚未生效，此月不适用'
  if (e.class?.end_date && e.class.end_date.slice(0, 7) < month) return '班级已结束，此月不适用'
  if (e.class?.start_date && e.class.start_date.slice(0, 7) > month) return '班级尚未开始，此月不适用'
  if (e.transferred_from_enrollment_id && e.join_date?.slice(0, 7) === month && e.join_date.slice(8, 10) !== '01') return '转班当月由原报读收费'
  return null
}

export function isFeeReceivable(fee: BillingFee): boolean {
  return fee.payment_status === 'unpaid' && !fee.billing_cancelled_at && !feeInapplicableReason(fee)
}

export function feeBillingNote(fee: BillingFee): string | null {
  const reason = feeInapplicableReason(fee)
  if (fee.payment_status === 'paid' && reason) return `${reason}；已有缴费及收据历史，需核对`
  if (fee.payment_status === 'waived') return null
  return reason
}
