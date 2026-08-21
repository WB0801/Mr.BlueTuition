import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { formatMalaysiaDateTime, formatMoney } from '../../../utils/format'
import {
  markMonthlyFeePaid,
  undoMonthlyFeePayment,
  updateMonthlyFeeAmount,
  waiveMonthlyFee,
} from '../api/feesService'
import { canWaiveFinalMonth, getFeeStatusLabel } from '../feePresentation'

interface MonthlyFeeCardProps {
  fee: MonthlyFeeDetails
  showClass?: boolean
  showStudent?: boolean
  readonly?: boolean
}

export function MonthlyFeeCard({ fee, showClass = true, showStudent = true, readonly = false }: MonthlyFeeCardProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(fee.actual_amount))
  const [error, setError] = useState('')

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monthly-fees'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipt-count'] }),
    ])
  }

  const mutation = useMutation({
    mutationFn: async (action: 'paid' | 'undo' | 'waive' | 'amount') => {
      if (action === 'paid') return markMonthlyFeePaid(fee.id)
      if (action === 'undo') return undoMonthlyFeePayment(fee.id)
      if (action === 'waive') return waiveMonthlyFee(fee.id)
      return updateMonthlyFeeAmount(fee.id, Number(amount))
    },
    onSuccess: async (updated, action) => {
      setError('')
      if (action === 'amount') setEditing(false)
      queryClient.setQueriesData<MonthlyFeeDetails[]>({ queryKey: ['monthly-fees', 'list'] }, (current) => (
        current?.map((item) => item.id === fee.id ? { ...item, ...updated } : item)
      ))
      await refresh()
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '操作失败，请重试。')),
  })

  async function saveAmount(event: FormEvent) {
    event.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('请输入正确的金额。')
      return
    }
    await mutation.mutateAsync('amount').catch(() => undefined)
  }

  function undoPayment() {
    const warning = fee.receipt_status === 'completed'
      ? '此笔学费已标记收据处理完成，撤销缴费后收据状态也会一并重置。确定继续吗？'
      : '确定撤销这笔缴费吗？待开收据状态也会一并清除。'
    if (window.confirm(warning)) mutation.mutate('undo')
  }

  return (
    <article className="fee-card">
      <div className="fee-card-main">
        {showStudent && fee.student && (
          <ContextLink backLabel="学费" className="fee-entity-link" to={`/students/${fee.student.id}`}>
            <strong>{fee.student.name}</strong>
          </ContextLink>
        )}
        {showClass && (fee.enrollment?.class
          ? <ContextLink backLabel="学费" className="record-meta fee-entity-link" to={`/classes/${fee.enrollment.class.id}`}>{fee.enrollment.class.name}</ContextLink>
          : <span className="record-meta">班级资料不可用</span>)}
        <div className="fee-amount-row">
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
              <button className="button button-primary button-small" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate('paid')}>
                确认已缴
              </button>
              <details className="fee-more-menu">
                <summary aria-label={`更多${fee.student?.name ?? ''}的学费操作`}>⋯</summary>
                <div>
                  <button className="button button-text button-small" type="button" disabled={mutation.isPending} onClick={() => setEditing(true)}>修改本月金额</button>
                  {canWaiveFinalMonth(fee) && <button className="button button-text button-small danger-text" type="button" disabled={mutation.isPending} onClick={() => {
                    if (window.confirm('确定将这笔学费标记为「本月不再追缴」吗？')) mutation.mutate('waive')
                  }}>本月不再追缴</button>}
                </div>
              </details>
            </>
          )}
          {fee.payment_status === 'paid' && (
            <details className="fee-more-menu">
              <summary aria-label={`更多${fee.student?.name ?? ''}的已缴操作`}>⋯</summary>
              <div><button className="button button-text button-small danger-text" type="button" disabled={mutation.isPending} onClick={undoPayment}>撤销缴费</button></div>
            </details>
          )}
        </div>
      )}

      {editing && (
        <form className="fee-amount-form" onSubmit={saveAmount}>
          <label className="field">
            <span>本月实际收费</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus required />
            <small className="field-hint">正常月费：{formatMoney(fee.normal_amount)}。只修改这一月份。</small>
          </label>
          <div className="inline-actions">
            <button className="button button-primary button-small" type="submit" disabled={mutation.isPending}>保存金额</button>
            <button className="button button-text button-small" type="button" onClick={() => { setEditing(false); setAmount(String(fee.actual_amount)); setError('') }}>取消</button>
          </div>
        </form>
      )}
      {error && <p className="form-error fee-card-error" role="alert">{error}</p>}
    </article>
  )
}
