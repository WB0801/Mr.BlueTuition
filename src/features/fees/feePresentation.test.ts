import type { MonthlyFeeDetails } from '../../types/domain'
import { canWaiveFinalMonth, getFeeStatusLabel } from './feePresentation'

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
})
