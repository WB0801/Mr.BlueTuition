import type { MonthlyFeeDetails } from '../../types/domain'
import type { TemporaryFeeRecord } from './api/temporaryFeesService'
import { getFeePriority, type FeeStatusFilter } from './feePresentation'

export type UnifiedFeeRecord = { source: 'monthly_fee'; fee: MonthlyFeeDetails } | { source: 'temporary_class_payment'; record: TemporaryFeeRecord }
export type FeeClassScope = { kind: 'all' | 'invalid' } | { kind: 'monthly' | 'temporary'; id: string }
export function parseFeeClassScope(value: string): FeeClassScope {
  if (!value) return { kind: 'all' }
  if (!value.includes(':')) return { kind: 'monthly', id: value }
  const [kind, id, extra] = value.split(':')
  return (kind === 'monthly' || kind === 'temporary') && id && !extra ? { kind, id } : { kind: 'invalid' }
}
export function malaysiaFeeMonthBounds(month: string): [string, string] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('无效月份')
  const [year, value] = month.split('-').map(Number)
  return [new Date(Date.UTC(year, value - 1, 1, -8)).toISOString(), new Date(Date.UTC(year, value, 1, -8)).toISOString()]
}
export const unifiedFeeKey = (item: UnifiedFeeRecord) => `${item.source}:${item.source === 'monthly_fee' ? item.fee.id : item.record.payment.id}`
export const unifiedPayment = (item: UnifiedFeeRecord) => item.source === 'monthly_fee' ? item.fee : item.record.payment
const studentName = (item: UnifiedFeeRecord) => item.source === 'monthly_fee' ? item.fee.student?.name ?? '' : item.record.enrollment.student?.name ?? ''
const className = (item: UnifiedFeeRecord) => item.source === 'monthly_fee' ? item.fee.enrollment?.class?.name ?? '' : item.record.class.name
export function selectUnifiedFees(rows: UnifiedFeeRecord[], options: { month: string; status: FeeStatusFilter; search: string; feeId?: string }) {
  const keyword = options.search.trim().toLocaleLowerCase(), seen = new Set<string>()
  const bounds = options.month === 'all' ? null : malaysiaFeeMonthBounds(options.month)
  return rows.filter(item => {
    const identity = unifiedFeeKey(item)
    if (seen.has(identity)) return false
    seen.add(identity)
    const payment = unifiedPayment(item)
    if (options.feeId && (item.source !== 'monthly_fee' || item.fee.id !== options.feeId)) return false
    if (options.status !== 'all' && payment.payment_status !== options.status) return false
    if (bounds && item.source === 'temporary_class_payment' && payment.payment_status === 'paid') {
      const paid = Date.parse(payment.paid_at ?? '')
      if (!Number.isFinite(paid) || paid < Date.parse(bounds[0]) || paid >= Date.parse(bounds[1])) return false
    }
    return !keyword || [studentName(item), className(item)].some(name => name.toLocaleLowerCase().includes(keyword))
  }).sort((a, b) => {
    const left = unifiedPayment(a), right = unifiedPayment(b)
    const priority = getFeePriority(left as MonthlyFeeDetails) - getFeePriority(right as MonthlyFeeDetails)
    if (priority) return priority
    if (left.payment_status === 'paid' && right.payment_status === 'paid') {
      const byTime = left.receipt_status === 'pending' ? (left.paid_at ?? '').localeCompare(right.paid_at ?? '') : (right.paid_at ?? '').localeCompare(left.paid_at ?? '')
      if (byTime) return byTime
    }
    return className(a).localeCompare(className(b), 'zh-Hans') || studentName(a).localeCompare(studentName(b), 'zh-Hans') || unifiedFeeKey(a).localeCompare(unifiedFeeKey(b))
  })
}
