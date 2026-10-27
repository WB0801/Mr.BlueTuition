import { useEffect, useRef, useState } from 'react'
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
  readReceiptStates,
} from '../api/feesService'
import { FeesShell } from '../components/FeesShell'
import { usePwaUpdateGuard } from '../../settings/pwa/updateProtection'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { parseFeeClassScope } from '../unifiedFeePresentation'
import { listTemporaryFeeRecords } from '../api/temporaryFeesService'
import { CollectionList } from '../collection/CollectionList'
import { useCollectionRecords } from '../collection/collectionHooks'
import { refreshCollectionReads } from '../collection/collectionActions'

export function ReceiptsPage() {
  const [params] = useSearchParams()
  return <ReceiptWorkspace key={`${params.get('studentId') ?? ''}:${params.get('classId') ?? ''}`} />
}

function ReceiptWorkspace() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const studentId = searchParams.get('studentId') ?? ''
  const classId = searchParams.get('classId') ?? ''
  const classScope = parseFeeClassScope(classId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  usePwaUpdateGuard(selected.size > 0, '请先处理或取消收据选择，再更新。')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const verificationRunning = useRef(false)
  usePwaUpdateGuard(verifying, '收据正在核对，请完成后再更新。')
  const [result, setResult] = useState<{ count?: number; keys: string[]; startedAt: number; note: string; needsVerification?: boolean; refreshFailed?: boolean; restored?: boolean } | null>(null)
  const requestedMonth = searchParams.get('completedMonth') ?? ''
  const completedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentMonthInMalaysia().slice(0, 7)
  const historyOpen = searchParams.get('completed') === '1'
  const pending = useQuery({ queryKey: ['pending-receipts'], queryFn: () => listReceiptQueue('pending'), enabled: !historyOpen })
  const completed = useQuery({
    queryKey: ['receipt-queue', 'completed', completedMonth],
    queryFn: () => listReceiptQueue('completed', normalizeMonthInput(completedMonth)),
    enabled: historyOpen,
  })

  const monthlyClassId = classScope.kind === 'monthly' ? classScope.id : ''
  const temporaryClassId = classScope.kind === 'temporary' ? classScope.id : ''
  const classFees = useQuery({ queryKey: ['monthly-fees', 'receipt-scope', monthlyClassId], queryFn: () => listMonthlyFees({ classId: monthlyClassId, paymentStatus: 'paid', complete: true }), enabled: Boolean(monthlyClassId) })
  const temporaryClassFees = useQuery({ queryKey: ['temporary-fees', 'receipt-scope', temporaryClassId], queryFn: ({ signal }) => listTemporaryFeeRecords({ classId: temporaryClassId, month: 'all', includeCancelled: true }, signal), enabled: Boolean(temporaryClassId) })
  const scopeRead = temporaryClassId ? temporaryClassFees : classFees
  const scopeLoading = Boolean(classId) && scopeRead.isLoading
  const scopeError = classScope.kind === 'invalid' || (Boolean(classId) && scopeRead.isError)
  const scopeReady = !classId || (classScope.kind !== 'invalid' && scopeRead.isSuccess)
  const inScope = (receipt: NonNullable<typeof pending.data>[number]) => (!studentId || receipt.student_id === studentId)
    && (!classId || (classScope.kind === 'temporary'
      ? (temporaryClassFees.data ?? []).some(fee => receipt.receipt_key === `temporary_class_payment:${fee.payment.id}`)
      : classScope.kind === 'monthly' && (classFees.data ?? []).some(fee => receipt.receipt_key === `monthly_fee:${fee.id}`)))
  const visiblePending = (pending.data ?? []).filter(inScope)
  const visibleCompleted = (completed.data ?? []).filter(inScope)
  const { merged: retainedPending, store, states } = useCollectionRecords(visiblePending, receiptKey)
  const allIds = visiblePending.map((receipt) => receipt.receipt_key)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const refresh = async () => {
    await refreshCollectionReads(queryClient, [['monthly-fees'], ['temporary-class'], ['temporary-fees'], ['receipt-queue'], ['pending-receipts'], ['pending-receipt-count']])
  }
  async function reconcile(input: { count?: number; keys: string[]; startedAt: number }) {
    if (verificationRunning.current) return
    verificationRunning.current = true
    setVerifying(true)
    setError('')
    // Callers may pass a prior result. Do not carry its stale locks/errors forward.
    const snapshot = { count: input.count, keys: input.keys, startedAt: input.startedAt }
    try {
    let done = input.count === input.keys.length ? input.keys : []
    let unknown = false
    setResult({ ...snapshot, note: input.count === input.keys.length ? '' : '正在核对最新收据状态…', needsVerification: true })
    if (input.count !== input.keys.length) {
      try {
        const latest = await readReceiptStates(input.keys)
        done = latest.filter(row => row.receipt_status === 'completed' && input.keys.includes(row.receipt_key)).map(row => row.receipt_key)
        unknown = input.keys.some(key => !latest.some(row => row.receipt_key === key && ['pending','completed'].includes(row.receipt_status)))
      }
      catch { setResult({ ...snapshot, note: '最新状态核对失败，请重试核对。', needsVerification: true }); return }
    }
    done.forEach(key => store.markConfirmed(key, input.startedAt))
    setSelected(current => new Set([...current].filter(key => !done.includes(key))))
    queryClient.setQueryData<ReceiptQueueItem[]>(['pending-receipts'], current => current?.filter(row => !done.includes(row.receipt_key)))
    const note = unknown ? '部分所选收据状态无法核实，请刷新后重试核对。' : input.count === input.keys.length ? '' : done.length === 0 ? '已核对最新状态；所选收据仍待处理，可明确重试。' : '已核对最新状态；部分记录可能已由其他操作处理。'
    try { await refresh(); setResult({ ...snapshot, note, needsVerification: unknown }) }
    catch { setResult({ ...snapshot, note: `${note ? `${note} ` : ''}列表刷新失败。`, refreshFailed: true, needsVerification: unknown }) }
    } finally { verificationRunning.current = false; setVerifying(false) }
  }
  const complete = useMutation({
    mutationFn: (input: { keys: string[]; startedAt: number }) => completeReceipts(input.keys),
    onSuccess: async (count, input) => {
      setError('')
      if (!Number.isInteger(count) || count < 0 || count > input.keys.length) { setResult({ ...input, note: '返回数量无法核实，请核对最新状态。', needsVerification: true }); return }
      await reconcile({ ...input, count })
    },
    onError: (caughtError, input) => {
      if (/^(P0001|22|23|42501)/.test((caughtError as { code?: string })?.code ?? '')) setError(getErrorMessage(caughtError, '收据更新被拒绝，请核对后重试。'))
      else { setError('收据处理结果未确认。'); setResult({ ...input, note: '请只读核对最新状态后再决定。', needsVerification: true }) }
    },
  })
  const restore = useMutation({
    mutationFn: restoreReceipt,
    onSuccess: async (_, key) => {
      store.clear(key)
      const receipt = completed.data?.find(row => row.receipt_key === key)
      if (receipt) store.clear(`receipt-month:${receipt.receipt_period}`)
      const outcome = { restored: true, keys: [key], startedAt: Date.now(), note: '' }
      setResult(outcome)
      try { await refresh() }
      catch { setResult({ ...outcome, note: '列表刷新失败，请重试刷新。', refreshFailed: true }) }
    },
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
      {result && <div className="notice inline-notice receipt-result" role="status"><span>{result.restored ? '已恢复为待处理' : result.count === undefined ? '收据结果未确认' : `本次处理${result.count}张`}{result.note && ` · ${result.note}`}</span>
        {result.needsVerification && <button type="button" className="button button-text button-small" disabled={complete.isPending || verifying} onClick={() => { void reconcile(result) }}>核对收据</button>}
        {result.refreshFailed && <button type="button" className="button button-text button-small" onClick={() => { void refresh().then(() => setResult({ ...result, note: '', refreshFailed: false }), () => undefined) }}>重试刷新</button>}
      </div>}
      {(studentId || classId) && <div className="scope-notice"><strong>当前学生／班级范围的收据</strong><button disabled={complete.isPending} className="button button-text" type="button" onClick={() => { setSelected(new Set()); setResult(null); const next = new URLSearchParams(searchParams); next.delete('studentId'); next.delete('classId'); setSearchParams(next, { replace: true }) }}>显示全部收据</button></div>}
      <ContextDataWorkspace label="收据栏目" defaultPanel="0" panelParam="completed" sections={[
      { id: '0', label: '待处理收据', render: () => <>
      <div className="section-heading-row receipts-heading">
        <div>
          <h2>{pending.isError || scopeError ? '待处理收据载入失败' : pending.isLoading || scopeLoading ? '正在读取待处理收据…' : `待处理收据 ${visiblePending.length} 张`}</h2>
        </div>
        {visiblePending.length > 0 && (
          <label className="select-all-control">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))} />
            全选
          </label>
        )}
      </div>

      {(pending.isLoading || scopeLoading) && <LoadingBlock />}
      {pending.isError && <ErrorBlock message="待开收据载入失败。" />}
      {scopeError && <><ErrorBlock message="班级范围载入失败，请重试。" /><button type="button" className="button button-secondary" onClick={() => void scopeRead.refetch()}>重试班级范围</button></>}
      {pending.isSuccess && scopeReady && retainedPending.length === 0 && <EmptyBlock message="目前没有待开收据。" />}

      <ReceiptGroups records={retainedPending} renderReceipt={receipt => (
                <div className="receipt-row" key={receipt.receipt_key}>
                  <label className="receipt-check"><input disabled={states.get(receipt.receipt_key)?.phase === 'confirmed'} aria-label={`选择 ${receipt.student_name} ${receipt.source_name} ${formatFeeMonth(receipt.receipt_period)} 收据`} type="checkbox" checked={selected.has(receipt.receipt_key)} onChange={() => toggle(receipt.receipt_key)} /></label>
                  <span className="receipt-details">
                    <ContextLink backLabel="收据" className="identity-link" to={`/students/${receipt.student_id}`}>
                    <StudentIdentity student={{ name: receipt.student_name, school_class: receipt.school_class, phone: receipt.phone }} />
                    </ContextLink>
                    <span>{receipt.source_name} · {formatMoney(receipt.amount)}</span>
                    <small>{receipt.source_type === 'temporary_class_payment' ? '临时班' : '常态班月费'} · {formatMalaysiaDateTime(receipt.paid_at)} 缴费</small>
                    <ReceiptPaymentLink receipt={receipt} />
                    {states.get(receipt.receipt_key)?.phase === 'confirmed' && <small>收据已处理</small>}
                  </span>
                </div>
      )} />

      {allIds.some((id) => selected.has(id)) && (
        <div className="receipt-batch-bar">
          <span>已选 {allIds.filter((id) => selected.has(id)).length} 笔</span>
          <button className="button button-primary" type="button" disabled={complete.isPending || verifying || result?.needsVerification} onClick={() => complete.mutate({ keys: allIds.filter(id => selected.has(id)), startedAt: Date.now() })}>
            {complete.isPending ? '处理中…' : '标记所选收据已处理'}
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      </> },
      { id: '1', label: '已处理收据', render: () => <section className="receipt-history-panel">
        <label className="field field-small receipt-history-month">
          <span>收费月份</span>
          <input type="month" value={completedMonth} onChange={(event) => { const next = new URLSearchParams(searchParams); next.set('completedMonth', event.target.value); setSearchParams(next, { replace: true }) }} />
        </label>
        {(completed.isLoading || scopeLoading) && <LoadingBlock />}
        {completed.isError && <ErrorBlock message="已处理收据载入失败。" />}
        {scopeError && <><ErrorBlock message="班级范围载入失败，请重试。" /><button type="button" className="button button-secondary" onClick={() => void scopeRead.refetch()}>重试班级范围</button></>}
        {completed.isSuccess && scopeReady && visibleCompleted.length === 0 && <EmptyBlock message="目前没有已处理收据。" />}
        <div className="receipt-list">
          {visibleCompleted.map((receipt) => (
            <div className="receipt-row completed-receipt-row" key={receipt.receipt_key}>
              <span className="receipt-details">
                <ContextLink backLabel="收据" className="identity-link" to={`/students/${receipt.student_id}`}><StudentIdentity student={{ name: receipt.student_name, school_class: receipt.school_class, phone: receipt.phone }} /></ContextLink>
                <span>{formatFeeMonth(receipt.receipt_period)} · {receipt.source_name} · {formatMoney(receipt.amount)}</span>
                <small>{receipt.source_type === 'temporary_class_payment' ? '临时班' : '常态班月费'} · {formatMalaysiaDateTime(receipt.receipt_completed_at)} 处理</small>
                {receipt.refunded_at && <small>已退费 {formatMoney(receipt.refunded_amount ?? receipt.amount)} · {formatMalaysiaDateTime(receipt.refunded_at)}，原收据历史保留</small>}
                <ReceiptPaymentLink receipt={receipt} />
              </span>
              {!receipt.cancelled_at && <button className="button button-secondary button-small" type="button" disabled={restore.isPending} onClick={() => {
                if (window.confirm('确定恢复为待处理吗？')) restore.mutate(receipt.receipt_key)
              }}>
                恢复为待处理
              </button>}
            </div>
          ))}
        </div>
      </section> },
      ]} />
    </FeesShell>
  )
}

const receiptKey = (row: ReceiptQueueItem) => row.receipt_key
const receiptMonthKey = (group: { month: string }) => `receipt-month:${group.month}`
function ReceiptGroups({ records, renderReceipt }: { records: ReceiptQueueItem[]; renderReceipt: (row: ReceiptQueueItem) => React.ReactNode }) {
  const { store, states } = useCollectionRecords(records, receiptKey)
  const owned = useRef(new Set<string>())
  const groups = groupByMonth(records).map(([month, receipts]) => ({ month, receipts }))
  useEffect(() => {
    for (const group of groups) {
      const key = receiptMonthKey(group)
      owned.current.add(key); group.receipts.forEach(row => owned.current.add(receiptKey(row)))
      if (states.has(key) && group.receipts.some(row => states.get(receiptKey(row))?.phase !== 'confirmed')) { store.clear(key); continue }
      if (states.get(key)?.visualDone) group.receipts.forEach(row => { if (!states.get(receiptKey(row))?.visualDone) store.visualDone(receiptKey(row)) })
      else if (!states.has(key) && group.receipts.every(row => states.get(receiptKey(row))?.phase === 'confirmed')) store.markConfirmed(key, Math.max(...group.receipts.map(row => states.get(receiptKey(row))!.startedAt)))
    }
  }, [groups, states, store])
  useEffect(() => () => { owned.current.forEach(key => store.clear(key)) }, [store])
  return <CollectionList className="receipt-groups" records={groups} recordKey={receiptMonthKey} retireConfirmed renderRecord={group => <section className="receipt-month">
    <h3>{formatFeeMonth(group.month)}</h3><CollectionList className="receipt-list" records={group.receipts} recordKey={receiptKey} retireConfirmed={!states.has(receiptMonthKey(group))} renderRecord={renderReceipt} />
  </section>} />
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
