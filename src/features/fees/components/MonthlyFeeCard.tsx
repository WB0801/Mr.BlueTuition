import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { formatFeeMonth, formatMalaysiaDateTime, formatMoney } from '../../../utils/format'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import {
  markMonthlyFeePaid,
  undoMonthlyFeePayment,
  updateMonthlyFeeAmount,
  waiveMonthlyFee,
} from '../api/feesService'
import { canWaiveFinalMonth, getFeeStatusLabel } from '../feePresentation'
import { useContextDataBusy } from '../../../components/contextual/contextDataState'
import { FeeReminderButton } from './FeeReminderButton'
import { useEffect, useMemo } from 'react'
import { preparePwaFormSave, usePwaFormDraft } from '../../settings/pwa/updateProtection'
import { getMonthlyFee } from '../api/feesService'
import { useCollectionAction } from '../collection/useCollectionAction'
import { useCollectionGlow } from '../collection/collectionHooks'
import { CollectionFeedback } from '../collection/CollectionFeedback'
import { refreshCollectionReads } from '../collection/collectionActions'
import type { MonthlyFee } from '../../../types/domain'

interface MonthlyFeeCardProps {
  fee: MonthlyFeeDetails
  showClass?: boolean
  showStudent?: boolean
  readonly?: boolean
  backLabel?: string
  showReminder?: boolean
  showSource?: boolean
  onEditingChange?: (id: string, editing: boolean, fee: MonthlyFeeDetails, saving: boolean) => void
}

export function MonthlyFeeCard({ fee: incoming, showClass = true, showStudent = true, readonly = false, backLabel = '学费', showReminder = false, showSource = false, onEditingChange }: MonthlyFeeCardProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(incoming.actual_amount))
  const [error, setError] = useState('')
  const [savedWithDraft, setSavedWithDraft] = useState(false)
  const [amountSaved, setAmountSaved] = useState(false)
  const { formRef, dirty } = usePwaFormDraft()
  useContextDataBusy(editing)
  const collection = useCollectionAction(`monthly_fee:${incoming.id}`, {
    id: incoming.id,
    pay: () => markMonthlyFeePaid(incoming.id),
    verify: () => getMonthlyFee(incoming.id),
    onFact: fact => queryClient.setQueriesData({ queryKey: ['monthly-fees'] }, (current: unknown) => Array.isArray(current) ? current.map(item => item.id === incoming.id ? { ...item, ...fact } : item) : current),
    refresh: () => refreshCollectionReads(queryClient, [['monthly-fees'], ['pending-receipts'], ['pending-receipt-count'], ['receipt-queue']]),
  }, incoming)
  const glow = useCollectionGlow(collection.state)
  const fee = useMemo(() => ({ ...incoming, ...(collection.fact as MonthlyFee | undefined), student: incoming.student, enrollment: incoming.enrollment }), [incoming, collection.fact])

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monthly-fees'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipt-count'] }),
      queryClient.invalidateQueries({ queryKey: ['receipt-queue'] }),
    ])
  }

  const mutation = useMutation({
    mutationFn: async (action: 'paid' | 'undo' | 'waive' | { amount: number }) => {
      if (typeof action !== 'string') return updateMonthlyFeeAmount(fee.id, action.amount)
      if (action === 'paid') return markMonthlyFeePaid(fee.id)
      if (action === 'undo') return undoMonthlyFeePayment(fee.id)
      return waiveMonthlyFee(fee.id)
    },
    onSuccess: async (updated) => {
      setError('')
      queryClient.setQueriesData<MonthlyFeeDetails[]>({ queryKey: ['monthly-fees', 'list'] }, (current) => (
        current?.map((item) => item.id === fee.id ? { ...item, ...updated } : item)
      ))
      await refresh()
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '操作失败，请重试。')),
  })
  useEffect(() => {
    onEditingChange?.(fee.id, editing, fee, mutation.isPending)
    return () => onEditingChange?.(fee.id, false, fee, false)
  }, [editing, fee, mutation.isPending, onEditingChange])

  async function saveAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending || fee.payment_status !== 'unpaid') return
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('请输入正确的金额。')
      return
    }
    const acknowledgeSave = preparePwaFormSave(event.currentTarget)
    try {
      await mutation.mutateAsync({ amount: parsed })
      const hasLaterDraft = acknowledgeSave()
      setSavedWithDraft(hasLaterDraft)
      setAmountSaved(!hasLaterDraft)
      if (!hasLaterDraft) setEditing(false)
    } catch { /* The mutation displays the error and retains the draft. */ }
  }

  function undoPayment() {
    const warning = fee.receipt_status === 'completed'
      ? '此笔学费已标记收据处理完成，撤销缴费后收据状态也会一并重置。确定继续吗？'
      : '确定撤销这笔缴费吗？待开收据状态也会一并清除。'
    if (window.confirm(warning)) { collection.dismiss(); mutation.mutate('undo') }
  }

  return (
    <article className={`fee-card${glow ? ' collection-glow' : ''}`} data-fee-key={`monthly_fee:${fee.id}`}>
      <div className="fee-card-main">
        {showStudent && fee.student && (
          <ContextLink backLabel={backLabel} className="fee-entity-link" to={`/students/${fee.student.id}`}>
            <StudentIdentity student={fee.student} />
          </ContextLink>
        )}
        {showClass && (fee.enrollment?.class
          ? <ContextLink backLabel={backLabel} className="record-meta fee-entity-link" to={`/classes/${fee.enrollment.class.id}`}>{showSource && <span className="unified-fee-source">常态班 · </span>}{fee.enrollment.class.name}</ContextLink>
          : <span className="record-meta">{showSource && '常态班 · '}班级资料不可用</span>)}
        <div className="fee-amount-row">
          <span className="fee-period">{formatFeeMonth(fee.fee_month)}</span>
          <strong>{fee.actual_amount === fee.normal_amount ? formatMoney(fee.actual_amount) : `本月 ${formatMoney(fee.actual_amount)}`}</strong>
          {fee.actual_amount !== fee.normal_amount && <span>标准 {formatMoney(fee.normal_amount)}</span>}
        </div>
        <span className={`fee-status fee-status-${fee.payment_status}`}>{getFeeStatusLabel(fee)}</span>
        {fee.paid_at && <span className="record-meta">{formatMalaysiaDateTime(fee.paid_at)} 缴费</span>}
      </div>

      {!readonly && (
        <div className="fee-actions">
          {fee.payment_status === 'unpaid' && !editing && (
            <>
              <button className="button button-primary button-small" type="button" disabled={mutation.isPending || collection.busy || collection.state?.phase === 'uncertain'} onClick={() => { void collection.start() }}>
                {collection.busy ? '处理中…' : collection.state?.phase === 'retry' ? '重试收款' : '确认已缴'}
              </button>
              {showReminder && <FeeReminderButton fee={fee} disabled={mutation.isPending || collection.busy || collection.state?.phase === 'uncertain'} />}
              <details className="fee-more-menu">
                <summary aria-label={`更多${fee.student?.name ?? ''}的学费操作`}>⋯</summary>
                <div>
                  <button className="button button-text button-small" type="button" disabled={mutation.isPending || collection.busy || Boolean(collection.state && !['rejected','retry'].includes(collection.state.phase))} onClick={() => { collection.dismiss(); setAmount(String(fee.actual_amount)); setSavedWithDraft(false); setAmountSaved(false); setError(''); setEditing(true) }}>修改本月金额</button>
                  {canWaiveFinalMonth(fee) && <button className="button button-text button-small danger-text" type="button" disabled={mutation.isPending || collection.busy || collection.state?.phase === 'uncertain'} onClick={() => {
                    if (window.confirm('确定将这笔学费标记为「本月不再追缴」吗？')) mutation.mutate('waive')
                  }}>本月不再追缴</button>}
                </div>
              </details>
            </>
          )}
          {fee.payment_status === 'paid' && (
            <details className="fee-more-menu">
              <summary aria-label={`更多${fee.student?.name ?? ''}的已缴操作`}>⋯</summary>
              <div><button className="button button-text button-small danger-text" type="button" disabled={mutation.isPending || collection.busy || glow || collection.state?.phase === 'verified'} onClick={undoPayment}>撤销缴费</button></div>
            </details>
          )}
        </div>
      )}

      {editing && (
        <form ref={formRef} className="fee-amount-form" onSubmit={saveAmount}>
          <label className="field">
            <span>本月实际收费</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus required />
            <small className="field-hint">正常月费：{formatMoney(fee.normal_amount)}。只修改这一月份。</small>
          </label>
          <div className="inline-actions">
            <button className="button button-primary button-small" type="submit" disabled={mutation.isPending || fee.payment_status !== 'unpaid'}>{mutation.isPending ? '保存中…' : '保存金额'}</button>
            <button className="button button-text button-small" type="button" disabled={mutation.isPending} onClick={() => { setEditing(false); setAmount(String(fee.actual_amount)); setError(''); setSavedWithDraft(false) }}>取消</button>
          </div>
          {savedWithDraft && dirty && <p className="notice inline-notice" role="status">本次提交已保存，后续修改尚未保存</p>}
          {fee.payment_status !== 'unpaid' && <p className="form-error" role="alert">缴费状态已更新，无法继续修改金额。请核对后取消编辑。</p>}
        </form>
      )}
      {error && <p className="form-error fee-card-error" role="alert">{error}</p>}
      {amountSaved && !editing && <p className="field-hint collection-feedback" role="status">金额已保存</p>}
      <CollectionFeedback state={collection.state} onVerify={() => { void collection.verify() }} onRefresh={() => { void collection.refresh() }} onDismiss={collection.dismiss} />
    </article>
  )
}
