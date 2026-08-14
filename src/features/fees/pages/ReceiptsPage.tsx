import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { currentMonthInMalaysia, formatFeeMonth, formatMalaysiaDateTime, formatMoney, normalizeMonthInput } from '../../../utils/format'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import {
  completeReceipts,
  listReceiptQueue,
  restoreReceipt,
} from '../api/feesService'
import { FeesShell } from '../components/FeesShell'

export function ReceiptsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [completedMonth, setCompletedMonth] = useState(currentMonthInMalaysia().slice(0, 7))
  const pending = useQuery({ queryKey: ['pending-receipts'], queryFn: () => listReceiptQueue('pending') })
  const completed = useQuery({
    queryKey: ['receipt-queue', 'completed', completedMonth],
    queryFn: () => listReceiptQueue('completed', normalizeMonthInput(completedMonth)),
  })

  const groupedPending = useMemo(() => groupByMonth(pending.data ?? []), [pending.data])
  const allIds = (pending.data ?? []).map((receipt) => receipt.receipt_key)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monthly-fees'] }),
      queryClient.invalidateQueries({ queryKey: ['temporary-class'] }),
      queryClient.invalidateQueries({ queryKey: ['receipt-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-receipt-count'] }),
    ])
  }
  const complete = useMutation({
    mutationFn: () => completeReceipts([...selected]),
    onSuccess: async () => { setSelected(new Set()); setError(''); await refresh() },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '收据更新失败，请重试。')),
  })
  const restore = useMutation({
    mutationFn: restoreReceipt,
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
        {groupedPending.map(([month, receipts]) => (
          <section className="receipt-month" key={month}>
            <h3>{formatFeeMonth(month)}</h3>
            <div className="receipt-list">
              {receipts.map((receipt) => (
                <label className="receipt-row" key={receipt.receipt_key}>
                  <input type="checkbox" checked={selected.has(receipt.receipt_key)} onChange={() => toggle(receipt.receipt_key)} />
                  <span className="receipt-details">
                    <StudentIdentity student={{ name: receipt.student_name, school_class: receipt.school_class, phone: receipt.phone }} />
                    <span>{receipt.source_name} · {formatMoney(receipt.amount)}</span>
                    <small>{receipt.source_type === 'temporary_class_payment' ? '临时班' : '常态班月费'} · {formatMalaysiaDateTime(receipt.paid_at)} 缴费</small>
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
          {(completed.data ?? []).map((receipt) => (
            <div className="receipt-row completed-receipt-row" key={receipt.receipt_key}>
              <span className="receipt-details">
                <strong>{receipt.student_name}</strong>
                <span>{formatFeeMonth(receipt.receipt_period)} · {receipt.source_name} · {formatMoney(receipt.amount)}</span>
                <small>{receipt.source_type === 'temporary_class_payment' ? '临时班' : '常态班月费'} · {formatMalaysiaDateTime(receipt.receipt_completed_at)} 处理</small>
              </span>
              <button className="button button-secondary button-small" type="button" disabled={restore.isPending} onClick={() => {
                if (window.confirm('确定恢复为待处理吗？')) restore.mutate(receipt.receipt_key)
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

function groupByMonth<T extends { receipt_period: string }>(fees: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  fees.forEach((fee) => groups.set(fee.receipt_period, [...(groups.get(fee.receipt_period) ?? []), fee]))
  return [...groups.entries()]
}
