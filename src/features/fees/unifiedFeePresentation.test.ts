import { malaysiaFeeMonthBounds, parseFeeClassScope, selectUnifiedFees, type UnifiedFeeRecord } from './unifiedFeePresentation'
import type { MonthlyFeeDetails } from '../../types/domain'
import type { TemporaryFeeRecord } from './api/temporaryFeesService'
const monthly = (id: string, status = 'unpaid') => ({ source: 'monthly_fee', fee: { id, payment_status: status, fee_month: '2026-10-01', student: { name: '虚构蓝同学' }, enrollment: { class: { name: '同名班' } } } as MonthlyFeeDetails }) as UnifiedFeeRecord
const temporary = (id: string, paidAt: string | null = null) => ({ source: 'temporary_class_payment', record: { payment: { id, payment_status: paidAt ? 'paid' : 'unpaid', paid_at: paidAt }, enrollment: { student: { name: '虚构蓝同学' } }, class: { name: '同名班' } } as TemporaryFeeRecord }) as UnifiedFeeRecord
it('uses Malaysia natural-month boundaries including year rollover', () => {
  expect(malaysiaFeeMonthBounds('2026-01')).toEqual(['2025-12-31T16:00:00.000Z', '2026-01-31T16:00:00.000Z'])
  expect(malaysiaFeeMonthBounds('2026-12')).toEqual(['2026-11-30T16:00:00.000Z', '2026-12-31T16:00:00.000Z'])
  expect(() => malaysiaFeeMonthBounds('2026-13')).toThrow()
})
it('separates same-name classes and preserves legacy monthly identity', () => {
  expect(parseFeeClassScope('a')).toEqual({ kind: 'monthly', id: 'a' })
  expect(parseFeeClassScope('monthly:a')).toEqual({ kind: 'monthly', id: 'a' })
  expect(parseFeeClassScope('temporary:a')).toEqual({ kind: 'temporary', id: 'a' })
  expect(parseFeeClassScope('other:a').kind).toBe('invalid')
})
it('keeps unpaid one-off IDs across months and all combines only current paid month', () => {
  const rows = [monthly('same'), monthly('waived', 'waived'), temporary('same'), temporary('prior', '2026-09-30T15:59:59Z'), temporary('start', '2026-09-30T16:00:00Z'), temporary('end', '2026-10-31T16:00:00Z')]
  const ids = (status: 'unpaid' | 'paid' | 'all', month = '2026-10') => selectUnifiedFees(rows, { status, month, search: '蓝' }).map(item => `${item.source}:${item.source === 'monthly_fee' ? item.fee.id : item.record.payment.id}`).sort()
  expect(ids('unpaid')).toEqual(['monthly_fee:same', 'temporary_class_payment:same'])
  expect(ids('paid')).toEqual(['temporary_class_payment:start'])
  expect(ids('all')).toEqual(['monthly_fee:same', 'monthly_fee:waived', 'temporary_class_payment:same', 'temporary_class_payment:start'])
  expect(ids('all', 'all')).toHaveLength(6)
  expect(selectUnifiedFees(rows, { status: 'all', month: 'all', search: '不存在' })).toEqual([])
})
