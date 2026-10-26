import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { formatMoney } from '../../../utils/format'
import { getErrorMessage } from '../../../utils/errors'
import { usePwaUpdateGuard } from '../../settings/pwa/updateProtection'
import { useContextDataLocked } from '../../../components/contextual/contextDataState'
import { cancelTemporaryClassEnrollment } from '../api/temporaryClassesService'
import { refreshTemporaryCancellation } from '../temporaryPaymentCache'

export function TemporaryCancellationButton({ enrollment, className, disabled, onOpenChange, onCancelled }: {
  enrollment: TemporaryClassEnrollment; className: string; disabled: boolean
  onOpenChange: (open: boolean) => void; onCancelled?: () => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const locked = useContextDataLocked()
  useEffect(() => {
    if (!open && restoreFocus.current && !disabled && !locked) {
      restoreFocus.current = false
      trigger.current?.focus({ preventScroll: true })
    }
  }, [open, disabled, locked])
  function close() {
    restoreFocus.current = true
    setOpen(false); onOpenChange(false)
    // The row can disappear after success. Return focus to the current panel.
    requestAnimationFrame(() => {
      if (!trigger.current?.isConnected) document.querySelector<HTMLElement>('[role="region"]:not([hidden]) [data-temporary-roster-heading]')?.focus({ preventScroll: true })
    })
  }
  const paid = enrollment.payment?.payment_status === 'paid'
  return <>
    <button ref={trigger} type="button" className="button button-text button-small danger-text" disabled={disabled || locked} onClick={() => { setOpen(true); onOpenChange(true) }}>{paid ? '退费并取消报名' : '取消报名'}</button>
    {open && <CancellationConfirmation enrollment={enrollment} className={className} onClose={close} onCancelled={() => { close(); onCancelled?.() }} />}
  </>
}

function CancellationConfirmation({ enrollment, className, onClose, onCancelled }: {
  enrollment: TemporaryClassEnrollment; className: string; onClose: () => void; onCancelled: () => void
}) {
  // Freeze exactly what the teacher is confirming, including retries after a lost response.
  const [snapshot] = useState(enrollment)
  const [requestId] = useState(() => crypto.randomUUID())
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const client = useQueryClient()
  const paid = snapshot.payment!.payment_status === 'paid'
  const cancel = useMutation({
    mutationKey: ['temporary-payment', snapshot.payment!.id],
    mutationFn: () => cancelTemporaryClassEnrollment(snapshot, confirmed, requestId),
    onError: caught => setError(cancellationError(caught)),
  })
  usePwaUpdateGuard(true, '请先完成或关闭取消报名确认，再更新。')
  useEffect(() => {
    const element = dialog.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { if (element.open) element.close(); document.body.style.overflow = overflow }
  }, [])
  async function submit() {
    if (inFlight.current || (paid && !confirmed)) return
    inFlight.current = true; setSubmitting(true); setError('')
    let updated: TemporaryClassEnrollment
    try { updated = await cancel.mutateAsync() } catch { inFlight.current = false; setSubmitting(false); return }
    // A successful transaction is not a failed cancellation if a refresh fails.
    onCancelled()
    await refreshTemporaryCancellation(client, snapshot, updated)
  }
  return createPortal(<dialog ref={dialog} className="fee-reminder-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }}>
    <h2 id={id}>{paid ? '退费并取消报名' : '取消报名'}</h2>
    <dl className="details-grid"><div><dt>学生</dt><dd>{snapshot.student?.name}</dd></div><div><dt>临时班</dt><dd>{className}</dd></div><div><dt>{paid ? '原缴费及全额退费金额' : '原应缴金额'}</dt><dd>{formatMoney(snapshot.payment!.amount)}</dd></div></dl>
    <p>{paid ? '系统不会转账。请先在系统外完成全额退费；原缴费及收据历史会保留。' : '取消后不再计入有效报名、点名及待缴费用，原记录保留。'}</p>
    {paid && <label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={submitting} onChange={event => setConfirmed(event.target.checked)} />我已在系统外实际退还上述全部金额</label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="inline-actions"><button type="button" className="button button-secondary" autoFocus disabled={submitting} onClick={() => { if (!inFlight.current) onClose() }}>暂不取消</button><button type="button" className="button button-danger" disabled={submitting || (paid && !confirmed)} onClick={() => void submit()}>{submitting ? '处理中…' : paid ? '已退费并取消报名' : '确认取消报名'}</button></div>
  </dialog>, document.body)
}

function cancellationError(error: unknown) {
  const raw = error as { message?: unknown }
  const message = typeof raw?.message === 'string' ? raw.message : getErrorMessage(error, '取消失败，原记录未变更，请重试。')
  if (/changed/i.test(message)) return '付款状态或金额已变化，本次没有取消。请关闭后刷新核对；若已退钱，请勿重复退费。'
  if (/attendance|signature history/i.test(message)) return '已有签到或补签记录，不能取消报名；出席及签名历史保持不变。'
  if (/open/i.test(message)) return '临时班已结束，不能取消报名。请刷新核对。'
  if (/cancelled/i.test(message)) return '此报名已取消，请关闭后刷新查看取消记录。'
  if (/does not exist|schema cache/i.test(message)) return '取消报名功能尚未就绪，请稍后重试；没有更改原记录。'
  return '取消结果尚未确认。请保留当前确认并重试，或关闭后刷新核对；若已退钱，请勿重复退费。'
}
