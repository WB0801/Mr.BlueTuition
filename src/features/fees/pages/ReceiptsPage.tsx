import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { currentMonthInMalaysia, formatFeeMonth, formatMalaysiaDateTime, formatMoney, normalizeMonthInput } from '../../../utils/format'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { ContextLink } from '../../../components/navigation/ContextLink'
import type { ReceiptQueueItem } from '../../../types/domain'
import {
  completeReceipts,
  listReceiptQueue,
  listMonthlyFees,
  restoreReceipt,
  getReceiptPaymentTarget,
} from '../api/feesService'
import { FeesShell } from '../components/FeesShell'

export function ReceiptsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const studentId = searchParams.get('studentId') ?? ''
  const classId = searchParams.get('classId') ?? ''
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const requestedMonth = searchParams.get('completedMonth') ?? ''
  const completedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentMonthInMalaysia().slice(0, 7)
  const historyOpen = searchParams.get('completed') === '1'
  const pending = useQuery({ queryKey: ['pending-receipts'], queryFn: () => listReceiptQueue('pending') })
  const completed = useQuery({
    queryKey: ['receipt-queue', 'completed', completedMonth],
    queryFn: () => listReceiptQueue('completed', normalizeMonthInput(completedMonth)),
  })

  const classFees = useQuery({ queryKey: ['monthly-fees', 'receipt-scope', classId], queryFn: () => listMonthlyFees({ classId, paymentStatus: 'paid' }), enabled: Boolean(classId) })
  const inScope = (receipt: NonNullable<typeof pending.data>[number]) => (!studentId || receipt.student_id === studentId)
    && (!classId || (classFees.data ?? []).some((fee) => receipt.receipt_key === `monthly_fee:${fee.id}`))
  const visiblePending = (pending.data ?? []).filter(inScope)
  const visibleCompleted = (completed.data ?? []).filter(inScope)
  const groupedPending = groupByMonth(visiblePending)
  const allIds = visiblePending.map((receipt) => receipt.receipt_key)
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
    mutationFn: () => completeReceipts(allIds.filter((id) => selected.has(id))),
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
      {(studentId || classId) && <div className="scope-notice"><strong>当前学生／班级范围的收据</strong><button className="button button-text" type="button" onClick={() => { setSelected(new Set()); const next = new URLSearchParams(searchParams); next.delete('studentId'); next.delete('classId'); setSearchParams(next, { replace: true }) }}>显示全部收据</button></div>}
      <div className="section-heading-row receipts-heading">
        <div>
          <h2>{pending.isError || (classId && classFees.isError) ? '待处理收据载入失败' : pending.isLoading || (classId && classFees.isLoading) ? '正在读取待处理收据…' : `待处理收据 ${visiblePending.length} 张`}</h2>
        </div>
        {visiblePending.length > 0 && (
          <label className="select-all-control">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))} />
            全选
          </label>
        )}
      </div>

      {(pending.isLoading || (classId && classFees.isLoading)) && <LoadingBlock />}
      {pending.isError && <ErrorBlock message="待开收据载入失败。" />}
      {classId && classFees.isError && <ErrorBlock message="班级范围载入失败，请重试。" />}
      {pending.isSuccess && (!classId || classFees.isSuccess) && visiblePending.length === 0 && <EmptyBlock message="目前没有待开收据。" />}

      <div className="receipt-groups">
        {groupedPending.map(([month, receipts]) => (
          <section className="receipt-month" key={month}>
            <h3>{formatFeeMonth(month)}</h3>
            <div className="receipt-list">
              {receipts.map((receipt) => (
                <div className="receipt-row" key={receipt.receipt_key}>
                  <label className="receipt-check"><input aria-label={`选择 ${receipt.student_name} ${receipt.source_name} ${formatFeeMonth(receipt.receipt_period)} 收据`} type="checkbox" checked={selected.has(receipt.receipt_key)} onChange={() => toggle(receipt.receipt_key)} /></label>
                  <span className="receipt-details">
                    <ContextLink backLabel="收据" className="identity-link" to={`/students/${receipt.student_id}`}>
                    <StudentIdentity student={{ name: receipt.student_name, school_class: receipt.school_class, phone: receipt.phone }} />
                    </ContextLink>
                    <span>{receipt.source_name} · {formatMoney(receipt.amount)}</span>
                    <small>{receipt.source_type === 'temporary_class_payment' ? '临时班' : '常态班月费'} · {formatMalaysiaDateTime(receipt.paid_at)} 缴费</small>
                    <ReceiptPaymentLink receipt={receipt} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {allIds.some((id) => selected.has(id)) && (
        <div className="receipt-batch-bar">
          <span>已选 {allIds.filter((id) => selected.has(id)).length} 笔</span>
          <button className="button button-primary" type="button" disabled={complete.isPending} onClick={() => complete.mutate()}>
            {complete.isPending ? '处理中…' : '标记所选收据已处理'}
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <details className="history-panel receipt-history-panel" open={historyOpen}>
        <summary onClick={(event) => {
          event.preventDefault()
          setSearchParams((current) => { const next = new URLSearchParams(current); if (!historyOpen) next.set('completed', '1'); else next.delete('completed'); return next }, { replace: true })
        }}>已处理收据</summary>
        <label className="field field-small receipt-history-month">
          <span>收费月份</span>
          <input type="month" value={completedMonth} onChange={(event) => { const next = new URLSearchParams(searchParams); next.set('completedMonth', event.target.value); setSearchParams(next, { replace: true }) }} />
        </label>
        {completed.isLoading && <LoadingBlock />}
        {completed.isError && <ErrorBlock message="已处理收据载入失败。" />}
        <div className="receipt-list">
          {visibleCompleted.map((receipt) => (
            <div className="receipt-row completed-receipt-row" key={receipt.receipt_key}>
              <span className="receipt-details">
                <ContextLink backLabel="收据" className="identity-link" to={`/students/${receipt.student_id}`}><StudentIdentity student={{ name: receipt.student_name, school_class: receipt.school_class, phone: receipt.phone }} /></ContextLink>
                <span>{formatFeeMonth(receipt.receipt_period)} · {receipt.source_name} · {formatMoney(receipt.amount)}</span>
                <small>{receipt.source_type === 'temporary_class_payment' ? '临时班' : '常态班月费'} · {formatMalaysiaDateTime(receipt.receipt_completed_at)} 处理</small>
                <ReceiptPaymentLink receipt={receipt} />
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

function ReceiptPaymentLink({ receipt }: { receipt: ReceiptQueueItem }) {
  const target = useQuery({ queryKey: ['receipt-payment-target', receipt.receipt_key, receipt.student_id], queryFn: () => getReceiptPaymentTarget(receipt), staleTime: 300_000 })
  if (target.isError) return <span className="form-error" role="alert">缴费关联读取失败。<button type="button" className="button button-text" onClick={() => void target.refetch()}>重试</button></span>
  return target.data ? <ContextLink backLabel="收据" className="receipt-payment-link" to={target.data}>查看缴费记录</ContextLink> : <small>读取缴费关联…</small>
}

function groupByMonth<T extends { receipt_period: string }>(fees: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  fees.forEach((fee) => groups.set(fee.receipt_period, [...(groups.get(fee.receipt_period) ?? []), fee]))
  return [...groups.entries()]
}
