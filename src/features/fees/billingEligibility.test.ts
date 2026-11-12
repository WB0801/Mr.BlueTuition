import { describe, expect, it } from 'vitest'
import type { MonthlyFeeDetails } from '../../types/domain'
import { matchesFeeStatus, getFeeStatusLabel } from './feePresentation'
import { summarizeUnpaidMonth } from './reminderRules'
import { selectUnifiedFees } from './unifiedFeePresentation'

const fee = (extra = {}) => ({ id: 'original', student_id: 's', fee_month: '2026-11-01', actual_amount: 40, payment_status: 'unpaid', receipt_status: 'not_applicable', enrollment: { join_date: '2026-09-01', end_date: '2026-10-31', status: 'ended', class: { id: 'c', start_date: '2026-01-01', end_date: null } }, ...extra }) as MonthlyFeeDetails
describe('billing eligibility across every read entry', () => {
  it('keeps the original ended-enrollment fee in history but not receivables/reminders', () => {
    expect(matchesFeeStatus(fee(), 'unpaid')).toBe(false)
    expect(matchesFeeStatus(fee(), 'all')).toBe(true)
    expect(getFeeStatusLabel(fee())).toContain('报读已结束')
    expect(summarizeUnpaidMonth([fee()], 's', '2026-11-01').records).toEqual([])
  })
  it('retains the final month for mid-month or first-day endings', () => {
    for (const end_date of ['2026-11-01', '2026-11-15', '2026-11-30']) expect(matchesFeeStatus(fee({ enrollment: { ...fee().enrollment, end_date } }), 'unpaid')).toBe(true)
  })
  it('separates manual cancellation, old waived history, and paid conflicts', () => {
    const cancelled = fee({ billing_cancelled_at: '2026-11-01T00:00:00Z', enrollment: { ...fee().enrollment, end_date: null } })
    expect(matchesFeeStatus(cancelled, 'unpaid')).toBe(false)
    expect(getFeeStatusLabel(cancelled)).toBe('已取消收费')
    expect(getFeeStatusLabel(fee({ payment_status: 'waived' }))).toBe('不再追缴')
    expect(getFeeStatusLabel(fee({ payment_status: 'paid', receipt_status: 'completed' }))).toContain('已缴')
    expect(getFeeStatusLabel(fee({ payment_status: 'paid' }))).toContain('需核对')
  })
  it('unified list counts and filters do not reintroduce inapplicable or cancelled rows', () => {
    const valid=fee({id:'valid',enrollment:{...fee().enrollment,end_date:null}})
    const rows=[fee(),valid,fee({id:'cancelled',billing_cancelled_at:'2026-11-01T00:00:00Z'})].map(fee=>({source:'monthly_fee' as const,fee}))
    expect(selectUnifiedFees(rows,{month:'2026-11',status:'unpaid',search:''}).map(r=>r.source==='monthly_fee'&&r.fee.id)).toEqual(['valid'])
    expect(selectUnifiedFees(rows,{month:'2026-11',status:'all',search:''})).toHaveLength(3)
  })
  it('original end-month/transfer/class boundaries and next enrollment stay separate',()=>{
    const base=fee()
    expect(matchesFeeStatus(fee({enrollment:{...base.enrollment,join_date:'2026-12-01',end_date:null}}),'unpaid')).toBe(false)
    expect(matchesFeeStatus(fee({enrollment:{...base.enrollment,end_date:null,class:{...base.enrollment!.class,end_date:'2026-10-31'}}}),'unpaid')).toBe(false)
    expect(matchesFeeStatus(fee({enrollment:{...base.enrollment,join_date:'2026-11-15',end_date:null,transferred_from_enrollment_id:'old'}}),'unpaid')).toBe(false)
    expect(matchesFeeStatus(fee({id:'new-id',enrollment:{...base.enrollment,join_date:'2026-11-01',end_date:null,transferred_from_enrollment_id:'old'}}),'unpaid')).toBe(true)
  })
})
