import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { refreshTemporaryPayment } from '../temporaryPaymentCache'
import { TemporaryCancellationButton } from './TemporaryCancellationButton'
import type { TemporaryClassPayment } from '../../../types/domain'
import { getTemporaryFeeRecord } from '../../fees/api/temporaryFeesService'
import { patchTemporaryFeeLists } from '../temporaryPaymentCache'
import { useCollectionAction } from '../../fees/collection/useCollectionAction'
import { useCollectionGlow } from '../../fees/collection/collectionHooks'
import { CollectionFeedback } from '../../fees/collection/CollectionFeedback'

export function TemporaryPaymentRow({ enrollment, allowActions, allowAmountEdit = false, backLabel = '临时班', onBusyChange, classNameForCancellation, allowCancellation = true, onCancelled }: { enrollment: TemporaryClassEnrollment; allowActions: boolean; allowAmountEdit?: boolean; backLabel?: string; onBusyChange?: (id: string, busy: boolean) => void; classNameForCancellation?: string; allowCancellation?: boolean; onCancelled?: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [cancellationOpen, setCancellationOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [amountFeedback, setAmountFeedback] = useState('')
  const amountRef = useRef(amount)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])
  const latestPayment = useRef(enrollment.payment)
  const originalPayment = enrollment.payment
  const collection = useCollectionAction(`temporary_class_payment:${originalPayment?.id ?? enrollment.id}`, {
    id: originalPayment?.id ?? '',
    pay: () => markTemporaryClassPaymentPaid(originalPayment?.id ?? ''),
    verify: async () => {
      const record = await getTemporaryFeeRecord(originalPayment?.id ?? '', enrollment.temporary_class_id, enrollment.student_id)
      patchTemporaryFeeLists(queryClient, record.payment, record.enrollment)
      return { ...record.payment, cancelled_at: record.enrollment.cancelled_at }
    },
    onFact: fact => { latestPayment.current = fact; patchTemporaryFeeLists(queryClient, fact) },
    refresh: () => refreshTemporaryPayment(queryClient, enrollment, latestPayment.current ?? undefined, true),
  }, originalPayment ?? undefined)
  const glow = useCollectionGlow(collection.state)
  const fact = collection.fact as TemporaryClassPayment | undefined
  const payment = originalPayment && { ...originalPayment, ...(enrollment.status !== 'cancelled' ? fact : {}) }
  const refresh = async (updated?: NonNullable<TemporaryClassEnrollment['payment']>) => {
    setError('')
    await refreshTemporaryPayment(queryClient, enrollment, updated)
  }
  const mutationKey = ['temporary-payment', payment?.id]
  const pendingForPayment = useIsMutating({ mutationKey }) > 0
  const undo = useMutation({
    mutationKey,
    mutationFn: () => undoTemporaryClassPayment(payment?.id ?? ''),
    onSuccess: updated => refresh(updated),
    onError: (caughtError) => setError(getErrorMessage(caughtError, '撤销缴费失败。')),
  })
  const changeAmount = useMutation({
    mutationKey,
    mutationFn: (value: number) => updateTemporaryClassPaymentAmount(payment?.id ?? '', enrollment.temporary_class_id, value),
  })
  const busy = undo.isPending || changeAmount.isPending || pendingForPayment || cancellationOpen
  const collectionLocked = collection.busy || collection.state?.phase === 'uncertain' || collection.state?.phase === 'verified'
  useContextDataBusy(editing || busy)
  const paymentId = payment?.id ?? enrollment.id
  useEffect(() => {
    onBusyChange?.(paymentId, editing || busy)
    return () => onBusyChange?.(paymentId, false)
  }, [paymentId, editing, busy, onBusyChange])
  const cancelled = enrollment.status === 'cancelled' || Boolean(collection.state?.fact?.cancelled_at)
  const canAct = allowActions && !cancelled
  const canEdit = canAct && allowAmountEdit && payment?.payment_status === 'unpaid'

  async function saveAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || busy || collectionLocked) return
    const submittedText = amount
    const acknowledgeSave = preparePwaFormSave(event.currentTarget)
    let value: number
    try { value = parseTemporaryPaymentAmount(submittedText) }
    catch { setError('请输入正确金额，最多两位小数。'); return }
    setError('')
    try {
      const updated = await changeAmount.mutateAsync(value)
      acknowledgeSave()
      // A later edit must stay visible and protected, not be lost on success.
      if (amountRef.current === submittedText) setEditing(false)
      setAmountFeedback(amountRef.current === submittedText ? '金额已保存' : '本次提交已保存，后续修改尚未保存')
      await refresh(updated)
    } catch (caughtError) {
      const message = temporaryPaymentAmountError(caughtError)
      if (message.includes('刷新')) {
        await Promise.allSettled([refreshTemporaryPayment(queryClient, enrollment)])
      }
      setError(message)
    }
  }

  if (!enrollment.student || !payment) return null
  const receiptLabel = payment.receipt_status === 'pending' ? cancelled ? '原收据待处理（已移出队列）' : '收据待处理' : payment.receipt_status === 'completed' ? cancelled ? '原收据已处理' : '收据已处理' : ''

  return (
    <article className={`temporary-enrollment-row${glow ? ' collection-glow' : ''}`}>
      <ContextLink backLabel={backLabel} className="identity-link" to={`/students/${enrollment.student.id}`}>
        <StudentIdentity student={enrollment.student} />
      </ContextLink>
      <div className="temporary-payment-summary">
        <strong>{formatMoney(payment.amount)}</strong>
        <span className="temporary-payment-state">
          <Badge tone={cancelled ? 'neutral' : payment.payment_status === 'paid' ? 'success' : 'warning'}>{cancelled ? payment.refunded_at ? '已退费' : '已取消' : payment.payment_status === 'paid' ? '已缴' : '未缴'}</Badge>
          {receiptLabel && <small>{receiptLabel}</small>}
        </span>
        {payment.paid_at && <small>{cancelled ? '原缴费时间' : '缴费时间'}：{formatMalaysiaDateTime(payment.paid_at)}</small>}
        {enrollment.cancelled_at && <small>取消时间：{formatMalaysiaDateTime(enrollment.cancelled_at)}</small>}
        {payment.refunded_at && <small>已记录外部全额退费：{formatMoney(payment.refunded_amount ?? payment.amount)} · {formatMalaysiaDateTime(payment.refunded_at)}</small>}
      </div>
      {canAct && payment.payment_status === 'unpaid' && !editing && (
        <div className="inline-actions">
        <button className="button button-primary button-small" type="button" disabled={busy || collectionLocked} onClick={() => { void collection.start() }}>
          {collection.busy ? '处理中…' : collection.state?.phase === 'retry' ? '重试收款' : '确认已缴'}
        </button>
        {canEdit && <button ref={editButton} className="button button-text button-small" type="button" disabled={busy || collectionLocked} onClick={() => {
          collection.dismiss(); setAmountFeedback('')
          const initial = String(payment.amount)
          setAmount(initial); amountRef.current = initial; setError(''); setEditing(true)
        }}>修改金额</button>}
        </div>
      )}
      {canAct && payment.payment_status === 'paid' && (
        <button className="button button-secondary button-small" type="button" disabled={busy || editing || collectionLocked || glow} onClick={() => {
          const warning = payment.receipt_status === 'completed'
            ? '此笔费用已标记收据处理完成，撤销缴费后收据状态也会一并重置。确定继续吗？'
            : '确定撤销这笔缴费吗？'
          if (window.confirm(warning)) { collection.dismiss(); undo.mutate() }
        }}>
          撤销缴费
        </button>
      )}
      {((canAct && allowCancellation) || cancellationOpen) && classNameForCancellation && <TemporaryCancellationButton enrollment={enrollment} className={classNameForCancellation} disabled={busy || editing || collectionLocked || glow || !canAct || !allowCancellation} onOpenChange={open => { if (open) collection.dismiss(); setCancellationOpen(open) }} onCancelled={onCancelled} />}
      {editing && <form className="fee-amount-form" onSubmit={saveAmount}>
        <label className="field"><span>应缴金额</span>
          <input type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" required autoFocus disabled={!canEdit} value={amount} onChange={event => {
            setAmount(event.target.value); amountRef.current = event.target.value
          }} />
        </label>
        <div className="inline-actions">
          <button className="button button-primary button-small" type="submit" disabled={busy || !canEdit || collectionLocked}>{changeAmount.isPending ? '保存中…' : '保存金额'}</button>
          <button className="button button-text button-small" type="button" disabled={busy} onClick={() => { setEditing(false); setError('') }}>取消</button>
        </div>
      </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {amountFeedback && <p className="collection-feedback" role="status">{amountFeedback}</p>}
      <CollectionFeedback state={collection.state} onVerify={() => { void collection.verify() }} onRefresh={() => { void collection.refresh() }} onDismiss={collection.dismiss} />
      {editing && payment.payment_status === 'paid' && !error && <p className="form-error" role="alert">这笔费用已缴，不能修改金额。请取消编辑后核对。</p>}
      {editing && cancelled && <p className="form-error" role="alert">报名已取消，不能修改原费用。草稿已保留，请取消编辑后核对取消记录。</p>}
    </article>
  )
}
