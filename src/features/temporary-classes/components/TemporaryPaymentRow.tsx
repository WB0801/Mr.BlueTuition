import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { formatMalaysiaDateTime, formatMoney } from '../../../utils/format'
import { getErrorMessage } from '../../../utils/errors'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { Badge } from '../../../components/ui'
import { markTemporaryClassPaymentPaid, undoTemporaryClassPayment, updateTemporaryClassPaymentAmount } from '../api/temporaryClassesService'
import { parseTemporaryPaymentAmount, temporaryPaymentAmountError } from '../paymentAmount'
import { preparePwaFormSave } from '../../settings/pwa/updateProtection'
import { useContextDataBusy } from '../../../components/contextual/contextDataState'

export function TemporaryPaymentRow({ enrollment, allowActions, allowAmountEdit = false }: { enrollment: TemporaryClassEnrollment; allowActions: boolean; allowAmountEdit?: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const amountRef = useRef(amount)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useContextDataBusy(editing)
  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])
  const payment = enrollment.payment
  const refresh = async () => {
    setError('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['temporary-class', enrollment.temporary_class_id, 'enrollments'] }),
      queryClient.invalidateQueries({ queryKey: ['temporary-classes', 'student', enrollment.student_id] }),
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
  const changeAmount = useMutation({
    mutationFn: (value: number) => updateTemporaryClassPaymentAmount(payment?.id ?? '', enrollment.temporary_class_id, value),
  })
  const busy = paid.isPending || undo.isPending || changeAmount.isPending
  const canEdit = allowActions && allowAmountEdit && payment?.payment_status === 'unpaid'

  async function saveAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || busy) return
    const submittedText = amount
    const acknowledgeSave = preparePwaFormSave(event.currentTarget)
    let value: number
    try { value = parseTemporaryPaymentAmount(submittedText) }
    catch { setError('请输入正确金额，最多两位小数。'); return }
    setError('')
    try {
      const updated = await changeAmount.mutateAsync(value)
      queryClient.setQueryData<TemporaryClassEnrollment[]>(['temporary-class', enrollment.temporary_class_id, 'enrollments'], current =>
        current?.map(item => item.payment?.id === updated.id ? { ...item, payment: updated } : item),
      )
      acknowledgeSave()
      // A later edit must stay visible and protected, not be lost on success.
      if (amountRef.current === submittedText) setEditing(false)
      await refresh()
    } catch (caughtError) {
      const message = temporaryPaymentAmountError(caughtError)
      if (message.includes('刷新')) {
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['temporary-class', enrollment.temporary_class_id] }),
          queryClient.invalidateQueries({ queryKey: ['temporary-classes', 'student', enrollment.student_id] }),
        ])
      }
      setError(message)
    }
  }

  if (!enrollment.student || !payment) return null
  const receiptLabel = payment.receipt_status === 'pending' ? '收据待处理' : payment.receipt_status === 'completed' ? '收据已处理' : ''

  return (
    <article className="temporary-enrollment-row">
      <ContextLink backLabel="临时班" className="identity-link" to={`/students/${enrollment.student.id}`}>
        <StudentIdentity student={enrollment.student} />
      </ContextLink>
      <div className="temporary-payment-summary">
        <strong>{formatMoney(payment.amount)}</strong>
        <span className="temporary-payment-state">
          <Badge tone={payment.payment_status === 'paid' ? 'success' : 'warning'}>{payment.payment_status === 'paid' ? '已缴' : '未缴'}</Badge>
          {receiptLabel && <small>{receiptLabel}</small>}
        </span>
        {payment.paid_at && <small>缴费时间：{formatMalaysiaDateTime(payment.paid_at)}</small>}
      </div>
      {allowActions && payment.payment_status === 'unpaid' && !editing && (
        <div className="inline-actions">
        <button className="button button-primary button-small" type="button" disabled={busy} onClick={() => paid.mutate()}>
          {paid.isPending ? '处理中…' : '确认已缴'}
        </button>
        {canEdit && <button ref={editButton} className="button button-text button-small" type="button" disabled={busy} onClick={() => {
          const initial = String(payment.amount)
          setAmount(initial); amountRef.current = initial; setError(''); setEditing(true)
        }}>修改金额</button>}
        </div>
      )}
      {allowActions && payment.payment_status === 'paid' && (
        <button className="button button-secondary button-small" type="button" disabled={busy || editing} onClick={() => {
          const warning = payment.receipt_status === 'completed'
            ? '此笔费用已标记收据处理完成，撤销缴费后收据状态也会一并重置。确定继续吗？'
            : '确定撤销这笔缴费吗？'
          if (window.confirm(warning)) undo.mutate()
        }}>
          撤销缴费
        </button>
      )}
      {editing && <form className="fee-amount-form" onSubmit={saveAmount}>
        <label className="field"><span>应缴金额</span>
          <input type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" required autoFocus value={amount} onChange={event => {
            setAmount(event.target.value); amountRef.current = event.target.value
          }} />
        </label>
        <div className="inline-actions">
          <button className="button button-primary button-small" type="submit" disabled={busy || !canEdit}>{changeAmount.isPending ? '保存中…' : '保存金额'}</button>
          <button className="button button-text button-small" type="button" disabled={busy} onClick={() => { setEditing(false); setError('') }}>取消</button>
        </div>
      </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  )
}
