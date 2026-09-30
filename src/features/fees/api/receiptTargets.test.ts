import { getReceiptPaymentTarget } from './feesService'
import type { ReceiptQueueItem } from '../../../types/domain'
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({ from: mocks.from }) }))
beforeEach(() => {
  const builder = { select: mocks.select, eq: mocks.eq, single: mocks.single }
  Object.values(mocks).forEach((mock) => mock.mockReset().mockReturnValue(builder))
})
const receipt = { source_type: 'monthly_fee', source_id: 'fee-a', student_id: 'student-a', receipt_period: '2026-08-01' } as ReceiptQueueItem
it('uses the original month and exact fee UUID rather than creating a new payment', async () => {
  expect(await getReceiptPaymentTarget(receipt)).toBe('/fees?studentId=student-a&month=2026-08&status=paid&feeId=fee-a')
  expect(mocks.from).not.toHaveBeenCalled()
})
it('resolves temporary receipts to their existing enrollment and payment record', async () => {
  mocks.single.mockResolvedValue({ data: { enrollment: { student_id: 'student-a', temporary_class_id: 'temporary-a' } }, error: null })
  expect(await getReceiptPaymentTarget({ ...receipt, source_type: 'temporary_class_payment', source_id: 'payment-a' })).toBe('/temporary-classes/temporary-a?paymentId=payment-a')
  expect(mocks.from).toHaveBeenCalledWith('temporary_class_payments')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'payment-a')
})
it('does not manufacture a link when the payment association fails or mismatches', async () => {
  mocks.single.mockResolvedValue({ data: { enrollment: { student_id: 'other', temporary_class_id: 'temporary-a' } }, error: null })
  await expect(getReceiptPaymentTarget({ ...receipt, source_type: 'temporary_class_payment' })).rejects.toThrow('无法确认')
  mocks.single.mockResolvedValue({ data: null, error: new Error('unavailable') })
  await expect(getReceiptPaymentTarget({ ...receipt, source_type: 'temporary_class_payment' })).rejects.toThrow('unavailable')
})
