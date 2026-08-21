import type { MonthlyFeeDetails } from '../../types/domain'
import { canWaiveFinalMonth, getFeeStatusLabel, matchesFeeStatus, sortFeesByActionPriority, sortFeesForWorkflow } from './feePresentation'

const baseFee = {
  payment_status: 'unpaid',
  receipt_status: 'not_applicable',
  fee_month: '2026-10-01',
} as MonthlyFeeDetails

describe('fee presentation', () => {
  it('distinguishes unpaid, pending receipt, completed receipt, and no longer pursued', () => {
    expect(getFeeStatusLabel(baseFee)).toBe('未缴')
    expect(getFeeStatusLabel({ ...baseFee, payment_status: 'paid', receipt_status: 'pending' })).toBe('已缴 · 收据待处理')
    expect(getFeeStatusLabel({ ...baseFee, payment_status: 'paid', receipt_status: 'completed' })).toBe('已缴 · 收据已处理')
    expect(getFeeStatusLabel({ ...baseFee, payment_status: 'waived' })).toBe('不再追缴')
  })

  it('only offers no-longer-pursued for the final month of an ended enrollment', () => {
    expect(canWaiveFinalMonth({
      ...baseFee,
      enrollment: { status: 'ended', end_date: '2026-10-15' },
    })).toBe(true)
    expect(canWaiveFinalMonth({
      ...baseFee,
      enrollment: { status: 'active', end_date: null },
    })).toBe(false)
    expect(canWaiveFinalMonth({
      ...baseFee,
      enrollment: { status: 'ended', end_date: '2026-09-30' },
    })).toBe(false)
  })

  it('puts fees needing action before completed and waived fees', () => {
    const fee = (id: string, payment_status: MonthlyFeeDetails['payment_status'], receipt_status: MonthlyFeeDetails['receipt_status']) => ({
      ...baseFee,
      id,
      created_at: `2026-08-20T00:00:0${id}Z`,
      payment_status,
      receipt_status,
      student: { id: `student-${id}`, name: `学生${id}`, school_class: null, phone: null },
    }) as MonthlyFeeDetails
    const sorted = sortFeesByActionPriority([
      fee('4', 'waived', 'not_applicable'),
      fee('3', 'paid', 'completed'),
      fee('2', 'paid', 'pending'),
      fee('1', 'unpaid', 'not_applicable'),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['1', '2', '3', '4'])
  })

  it('groups all-class unpaid fees by class and then student name', () => {
    const fee = (id: string, className: string, studentName: string) => ({
      ...baseFee,
      id,
      created_at: id,
      student: { id: `student-${id}`, name: studentName, school_class: null, phone: null },
      enrollment: { id: `enrollment-${id}`, class_id: `class-${className}`, join_date: '2026-01-01', end_date: null, status: 'active', class: { id: `class-${className}`, name: className, status: 'active' } },
    }) as MonthlyFeeDetails
    const sorted = sortFeesForWorkflow([
      fee('3', '数学', '王小明'), fee('2', '会计', '张小芳'), fee('1', '会计', '陈小明'),
    ], { status: 'unpaid' })
    expect(sorted.map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('orders pending receipts oldest first and completed receipts newest first', () => {
    const paid = (id: string, receipt_status: 'pending' | 'completed', paid_at: string) => ({
      ...baseFee,
      id,
      created_at: id,
      payment_status: 'paid',
      receipt_status,
      paid_at,
      student: { id: `student-${id}`, name: `学生${id}`, school_class: null, phone: null },
    }) as MonthlyFeeDetails
    const sorted = sortFeesForWorkflow([
      paid('completed-old', 'completed', '2026-08-01T00:00:00Z'),
      paid('pending-new', 'pending', '2026-08-03T00:00:00Z'),
      paid('completed-new', 'completed', '2026-08-04T00:00:00Z'),
      paid('pending-old', 'pending', '2026-08-02T00:00:00Z'),
    ], { status: 'paid' })
    expect(sorted.map((item) => item.id)).toEqual(['pending-old', 'pending-new', 'completed-new', 'completed-old'])
  })

  it('filters unpaid, paid, and all states without mixing them', () => {
    expect(matchesFeeStatus(baseFee, 'unpaid')).toBe(true)
    expect(matchesFeeStatus({ ...baseFee, payment_status: 'paid' }, 'unpaid')).toBe(false)
    expect(matchesFeeStatus({ ...baseFee, payment_status: 'paid' }, 'paid')).toBe(true)
    expect(matchesFeeStatus({ ...baseFee, payment_status: 'waived' }, 'all')).toBe(true)
  })
})
