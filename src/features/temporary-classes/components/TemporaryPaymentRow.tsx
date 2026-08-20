import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { formatMalaysiaDateTime, formatMoney } from '../../../utils/format'
import { getErrorMessage } from '../../../utils/errors'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { markTemporaryClassPaymentPaid, undoTemporaryClassPayment } from '../api/temporaryClassesService'

export function TemporaryPaymentRow({ enrollment, allowActions }: { enrollment: TemporaryClassEnrollment; allowActions: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const payment = enrollment.payment
  const refresh = async () => {
    setError('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['temporary-class', enrollment.temporary_class_id, 'enrollments'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipt-count'] }),
      queryClient.invalidateQueries({ queryKey: ['receipt-queue'] }),
    ])
  }
  const paid = useMutation({
    mutationFn: () => markTemporaryClassPaymentPaid(payment?.id ?? ''),
    onSuccess: refresh,
    onError: (caughtError) => setError(getErrorMessage(caughtError, '确认缴费失败。')),
  })
  const undo = useMutation({
    mutationFn: () => undoTemporaryClassPayment(payment?.id ?? ''),
    onSuccess: refresh,
    onError: (caughtError) => setError(getErrorMessage(caughtError, '撤销缴费失败。')),
  })

  if (!enrollment.student || !payment) return null
  const receiptLabel = payment.receipt_status === 'pending' ? '收据待处理' : payment.receipt_status === 'completed' ? '收据已处理' : ''

  return (
    <article className="temporary-enrollment-row">
      <ContextLink backLabel="临时班" className="identity-link" to={`/students/${enrollment.student.id}`}>
        <StudentIdentity student={enrollment.student} />
      </ContextLink>
      <div className="temporary-payment-summary">
        <strong>{formatMoney(payment.amount)}</strong>
        <span>{payment.payment_status === 'paid' ? `已缴${receiptLabel ? ` · ${receiptLabel}` : ''}` : '未缴'}</span>
        {payment.paid_at && <small>缴费时间：{formatMalaysiaDateTime(payment.paid_at)}</small>}
      </div>
      {allowActions && payment.payment_status === 'unpaid' && (
        <button className="button button-primary button-small" type="button" disabled={paid.isPending} onClick={() => paid.mutate()}>
          {paid.isPending ? '处理中…' : '确认已缴'}
        </button>
      )}
      {allowActions && payment.payment_status === 'paid' && (
        <button className="button button-secondary button-small" type="button" disabled={undo.isPending} onClick={() => {
          const warning = payment.receipt_status === 'completed'
            ? '此笔费用已标记收据处理完成，撤销缴费后收据状态也会一并重置。确定继续吗？'
            : '确定撤销这笔缴费吗？'
          if (window.confirm(warning)) undo.mutate()
        }}>
          撤销缴费
        </button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  )
}
