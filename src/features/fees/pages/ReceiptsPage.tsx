import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { currentMonthInMalaysia, formatFeeMonth, formatMalaysiaDateTime, formatMoney, normalizeMonthInput } from '../../../utils/format'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import {
  completeMonthlyFeeReceipts,
  listMonthlyFees,
  listPendingReceipts,
  restoreMonthlyFeeReceipt,
} from '../api/feesService'
import { FeesShell } from '../components/FeesShell'

export function ReceiptsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [completedMonth, setCompletedMonth] = useState(currentMonthInMalaysia().slice(0, 7))
  const pending = useQuery({ queryKey: ['pending-receipts'], queryFn: listPendingReceipts })
  const completed = useQuery({
    queryKey: ['monthly-fees', 'completed-receipts', completedMonth],
    queryFn: () => listMonthlyFees({
      feeMonth: normalizeMonthInput(completedMonth),
      paymentStatus: 'paid',
      receiptStatus: 'completed',
    }),
  })

  const groupedPending = useMemo(() => groupByMonth(pending.data ?? []), [pending.data])
  const allIds = (pending.data ?? []).map((fee) => fee.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monthly-fees'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipt-count'] }),
    ])
  }
  const complete = useMutation({
    mutationFn: () => completeMonthlyFeeReceipts([...selected]),
    onSuccess: async () => { setSelected(new Set()); setError(''); await refresh() },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '收据更新失败，请重试。')),
  })
  const restore = useMutation({
    mutationFn: restoreMonthlyFeeReceipt,
    onSuccess: refresh,
    onError: (caughtError) => setError(getErrorMessage(caughtError, '恢复收据状态失败，请重试。')),
  })

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <FeesShell>
      <div className="section-heading-row receipts-heading">
        <div>
          <h2>待开收据 {pending.data?.length ?? 0}</h2>
          <p className="muted">较旧月份优先显示。</p>
        </div>
        {(pending.data?.length ?? 0) > 0 && (
          <label className="select-all-control">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))} />
            全选
          </label>
        )}
      </div>

      {pending.isLoading && <LoadingBlock />}
      {pending.isError && <ErrorBlock message="待开收据载入失败。" />}
      {!pending.isLoading && !pending.isError && pending.data?.length === 0 && <EmptyBlock message="目前没有待开收据。" />}

      <div className="receipt-groups">
        {groupedPending.map(([month, fees]) => (
          <section className="receipt-month" key={month}>
            <h3>{formatFeeMonth(month)}</h3>
            <div className="receipt-list">
              {fees.map((fee) => (
                <label className="receipt-row" key={fee.id}>
                  <input type="checkbox" checked={selected.has(fee.id)} onChange={() => toggle(fee.id)} />
                  <span className="receipt-details">
                    {fee.student && <StudentIdentity student={fee.student} />}
                    <span>{fee.enrollment?.class?.name} · {formatMoney(fee.actual_amount)}</span>
                    <small>{formatMalaysiaDateTime(fee.paid_at)} 缴费</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="receipt-batch-bar">
          <span>已选 {selected.size} 笔</span>
          <button className="button button-primary" type="button" disabled={complete.isPending} onClick={() => complete.mutate()}>
            {complete.isPending ? '处理中…' : '标记所选收据已处理'}
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <details className="history-panel receipt-history-panel">
        <summary>已处理收据</summary>
        <label className="field field-small receipt-history-month">
          <span>收费月份</span>
          <input type="month" value={completedMonth} onChange={(event) => setCompletedMonth(event.target.value)} />
        </label>
        {completed.isLoading && <LoadingBlock />}
        {completed.isError && <ErrorBlock message="已处理收据载入失败。" />}
        <div className="receipt-list">
          {(completed.data ?? []).map((fee) => (
            <div className="receipt-row completed-receipt-row" key={fee.id}>
              <span className="receipt-details">
                <strong>{fee.student?.name}</strong>
                <span>{formatFeeMonth(fee.fee_month)} · {fee.enrollment?.class?.name} · {formatMoney(fee.actual_amount)}</span>
                <small>{formatMalaysiaDateTime(fee.receipt_completed_at)} 处理</small>
              </span>
              <button className="button button-secondary button-small" type="button" disabled={restore.isPending} onClick={() => {
                if (window.confirm('确定恢复为待处理吗？')) restore.mutate(fee.id)
              }}>
                恢复为待处理
              </button>
            </div>
          ))}
        </div>
      </details>
    </FeesShell>
  )
}

function groupByMonth<T extends { fee_month: string }>(fees: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  fees.forEach((fee) => groups.set(fee.fee_month, [...(groups.get(fee.fee_month) ?? []), fee]))
  return [...groups.entries()]
}
