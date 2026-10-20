import { useCallback, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listClasses } from '../../classes/api/classesService'
import { currentMonthInMalaysia, normalizeMonthInput } from '../../../utils/format'
import { ensureMonthlyFees, listMonthlyFees } from '../api/feesService'
import { FeesShell } from '../components/FeesShell'
import { MonthlyFeeCard } from '../components/MonthlyFeeCard'
import { BatchFeeReminderButton } from '../components/BatchFeeReminderButton'
import type { FeeStatusFilter } from '../feePresentation'
import { getTemporaryFeeRecord, listTemporaryFeeClasses, listTemporaryFeeRecords, type TemporaryFeeRecord } from '../api/temporaryFeesService'
import { parseFeeClassScope, selectUnifiedFees, unifiedFeeKey, unifiedPayment, type UnifiedFeeRecord } from '../unifiedFeePresentation'
import { TemporaryFeeCard } from '../components/TemporaryFeeCard'
import { patchTemporaryFeeLists } from '../../temporary-classes/temporaryPaymentCache'

type FeesView = 'current' | 'unpaid' | 'history'

interface MonthlyFeesPageProps {
  view: FeesView
}

export function MonthlyFeesPage({ view }: MonthlyFeesPageProps) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [busyRows, setBusyRows] = useState<Map<string, TemporaryFeeRecord>>(new Map())
  const onBusyChange = useCallback((id: string, busy: boolean, record: TemporaryFeeRecord) => setBusyRows(current => {
    if (current.has(id) === busy) return current
    const next = new Map(current); if (busy) next.set(id, record); else next.delete(id); return next
  }), [])
  const locked = busyRows.size > 0
  const requestedMonth = searchParams.get('month') ?? currentMonthInMalaysia().slice(0, 7)
  const monthInput = requestedMonth === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentMonthInMalaysia().slice(0, 7)
  const classValue = searchParams.get('classId') ?? ''
  const scope = parseFeeClassScope(classValue)
  const classId = scope.kind === 'monthly' ? scope.id : ''
  const studentId = searchParams.get('studentId') ?? ''
  const feeId = searchParams.get('feeId') ?? ''
  const search = searchParams.get('q') ?? ''
  const status = normalizeStatus(searchParams.get('status'), view)
  const updateFilter = (key: 'month' | 'classId' | 'studentId' | 'q' | 'status', value: string) => {
    if (locked) return
    const next = new URLSearchParams(searchParams)
    next.delete('feeId')
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true, state: location.state })
  }
  const allMonths = monthInput === 'all'
  const feeMonth = allMonths ? currentMonthInMalaysia() : normalizeMonthInput(monthInput)
  const monthlyEnabled = scope.kind === 'all' || scope.kind === 'monthly'
  const temporaryEnabled = (scope.kind === 'all' || scope.kind === 'temporary') && !feeId
  const ensure = useQuery({
    queryKey: ['monthly-fees-generation', feeMonth],
    queryFn: () => ensureMonthlyFees(feeMonth),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: monthlyEnabled,
  })
  const fees = useQuery({
    queryKey: ['monthly-fees', 'list', allMonths ? 'all' : feeMonth, classId, studentId, 'complete'],
    queryFn: ({ signal }) => listMonthlyFees({
      feeMonth: allMonths ? undefined : feeMonth,
      classId: classId || undefined,
      studentId: studentId || undefined,
      complete: true, signal,
    }),
    enabled: monthlyEnabled && ensure.isSuccess && !ensure.isFetching,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const classes = useQuery({ queryKey: ['classes', 'active'], queryFn: () => listClasses('active') })
  const temporaryClasses = useQuery({ queryKey: ['temporary-fee-classes'], queryFn: ({ signal }) => listTemporaryFeeClasses(signal), refetchOnWindowFocus: true, refetchOnReconnect: true })
  const temporaryClassId = scope.kind === 'temporary' ? scope.id : undefined
  const temporaryFees = useQuery({
    queryKey: ['temporary-fees', 'list', monthInput, temporaryClassId ?? '', studentId],
    queryFn: ({ signal }) => listTemporaryFeeRecords({ month: monthInput, classId: temporaryClassId, studentId: studentId || undefined }, signal),
    enabled: temporaryEnabled,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  // A retained editor is keyed by its original payment, not by the current list filter.
  // Recheck that exact payment so a paid/out-of-month refresh cannot lose its draft.
  const retainedRows = [...busyRows.values()]
  const retainedReads = useQueries({ queries: retainedRows.map(record => ({
    queryKey: ['temporary-fees', 'editing', record.payment.id, record.class.id, record.enrollment.student_id],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const latest = await getTemporaryFeeRecord(record.payment.id, record.class.id, record.enrollment.student_id, signal)
      if (!signal.aborted) patchTemporaryFeeLists(queryClient, latest.payment)
      return latest
    },
    initialData: record,
    staleTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })) })

  const visibleFees = useMemo(() => {
    const rows: UnifiedFeeRecord[] = [
      ...(monthlyEnabled ? (fees.data ?? []).map(fee => ({ source: 'monthly_fee' as const, fee })) : []),
      ...(temporaryEnabled ? (temporaryFees.data ?? []).map(record => ({ source: 'temporary_class_payment' as const, record })) : []),
    ]
    return selectUnifiedFees(rows, { month: monthInput, status: 'all', search, feeId })
  }, [fees.data, temporaryFees.data, monthlyEnabled, temporaryEnabled, monthInput, search, feeId])
  const complete = scope.kind !== 'invalid' && (!monthlyEnabled || (ensure.isSuccess && fees.isSuccess)) && (!temporaryEnabled || temporaryFees.isSuccess)
  const counts = { unpaid: complete ? visibleFees.filter(fee => unifiedPayment(fee).payment_status === 'unpaid').length : '—', paid: complete ? visibleFees.filter(fee => unifiedPayment(fee).payment_status === 'paid').length : '—', all: complete ? visibleFees.length : '—' }
  const displayed: UnifiedFeeRecord[] = [
    ...visibleFees.filter(item => (status === 'all' || unifiedPayment(item).payment_status === status) && (item.source !== 'temporary_class_payment' || !busyRows.has(item.record.payment.id))),
    ...retainedRows.map((record, index) => ({ source: 'temporary_class_payment' as const, record: retainedReads[index].data ?? record })),
  ]
  const pendingFees = displayed.filter(item => unifiedPayment(item).receipt_status === 'pending')
  const completedFees = displayed.filter(item => unifiedPayment(item).receipt_status === 'completed')
  const renderFee = (item: UnifiedFeeRecord) => item.source === 'monthly_fee'
    ? <MonthlyFeeCard fee={item.fee} key={unifiedFeeKey(item)} showSource showReminder={status !== 'paid'} />
    : <TemporaryFeeCard record={item.record} onBusyChange={onBusyChange} key={unifiedFeeKey(item)}
        verificationFailed={retainedReads[retainedRows.findIndex(record => record.payment.id === item.record.payment.id)]?.isError}
        onRetryVerification={() => { void retainedReads[retainedRows.findIndex(record => record.payment.id === item.record.payment.id)]?.refetch() }} />

  return (
    <FeesShell>
      {feeId && <div className="scope-notice"><strong>收据对应的缴费记录</strong><button type="button" className="button button-text" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('feeId'); setSearchParams(next, { replace: true }) }}>显示此范围全部缴费记录</button></div>}
      {studentId && <div className="scope-notice" role="status"><strong>{fees.data?.[0]?.student?.name ?? temporaryFees.data?.[0]?.enrollment.student?.name ?? '指定学生'}的缴费记录</strong><button disabled={locked} type="button" className="button button-text" onClick={() => updateFilter('studentId', '')}>显示所有学生</button></div>}
      <fieldset className="fees-workflow-header fees-filter-lock" disabled={locked}>
        <div className="fees-filters">
        <div className="field">
          <label htmlFor="fee-month">月份</label>
          <input id="fee-month" type="month" aria-label="指定月份" max={currentMonthInMalaysia().slice(0, 7)} value={allMonths ? '' : monthInput} onChange={(event) => updateFilter('month', event.target.value)} />
          <label className="checkbox-row"><input type="checkbox" checked={allMonths} onChange={(event) => updateFilter('month', event.target.checked ? 'all' : currentMonthInMalaysia().slice(0, 7))} />所有月份</label>
        </div>
        <label className="field">
          <span>班级</span>
          <select value={scope.kind === 'monthly' ? `monthly:${scope.id}` : classValue} onChange={(event) => updateFilter('classId', event.target.value)}>
            <option value="">全部班级</option>
            <optgroup label="常态班">{(classes.data ?? []).map((item) => <option value={`monthly:${item.id}`} key={item.id}>{item.name}</option>)}</optgroup>
            <optgroup label="临时班">{(temporaryClasses.data ?? []).map((item) => <option value={`temporary:${item.id}`} key={item.id}>{item.name}{item.status === 'ended' ? '（已结束）' : ''}</option>)}</optgroup>
          </select>
        </label>
        <label className="field fees-search-field">
          <span>搜索学生</span>
          <input type="search" value={search} onChange={(event) => updateFilter('q', event.target.value)} placeholder="输入姓名" />
        </label>
        </div>
        <div className="segmented-control fee-status-tabs" aria-label="缴费状态">
          {(['unpaid', 'paid', 'all'] as FeeStatusFilter[]).map((item) => (
            <button type="button" className={status === item ? 'active' : ''} onClick={() => updateFilter('status', item)} key={item}>
              {statusLabel(item)} <span>{counts[item]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="settings-note">常态按收费月份；临时班未缴不限月份，已缴按缴费月份。</p>

      <BatchFeeReminderButton initialMonth={allMonths ? '' : feeMonth} available={monthlyEnabled && status === 'unpaid' && !locked}
        scope={{ classId: classId || undefined, studentId: studentId || undefined, search }}
        scopeLabel={[classId ? classes.data?.find(item => item.id === classId)?.name ?? '指定班级' : '全部班级', studentId ? fees.data?.[0]?.student?.name ?? '指定学生' : '全部学生', search.trim() ? `搜索：${search.trim()}` : ''].filter(Boolean).join(' · ')} />

      {scope.kind === 'invalid' && <ErrorBlock message="班级筛选无效，请重新选择班级。" />}
      {classes.isError && <ErrorBlock message="常态班筛选列表载入失败。" />}
      {temporaryClasses.isError && <><ErrorBlock message="临时班筛选列表载入失败。" /><button className="button button-secondary" type="button" onClick={() => void temporaryClasses.refetch()}>重试临时班列表</button></>}
      {((monthlyEnabled && (ensure.isLoading || fees.isLoading)) || (temporaryEnabled && temporaryFees.isLoading)) && <LoadingBlock message="正在读取缴费记录…" />}
      {monthlyEnabled && (ensure.isError || fees.isError) && <><ErrorBlock message="常态班费用载入失败，当前显示的记录不完整。" /><button className="button button-secondary" type="button" onClick={() => void (ensure.isError ? ensure.refetch() : fees.refetch())}>重试常态班费用</button></>}
      {temporaryEnabled && temporaryFees.isError && <><ErrorBlock message="临时班费用载入失败，当前显示的记录不完整。" /><button className="button button-secondary" type="button" onClick={() => void temporaryFees.refetch()}>重试临时班费用</button></>}
      {complete && displayed.length === 0 && (
        <EmptyBlock message={search ? '找不到符合搜索的学生。' : '目前筛选范围没有需要显示的缴费记录。'} />
      )}
      {status === 'paid' ? (
        <div className="paid-fee-groups">
          <section>
            <h2>待开收据 <span className="section-count">{complete ? pendingFees.length : '—'}</span></h2>
            {complete && pendingFees.length === 0 ? <p className="settings-note">目前没有待开收据。</p> : <div className="fee-list">{pendingFees.map(renderFee)}</div>}
          </section>
          <section>
            <h2>收据已处理 <span className="section-count">{complete ? completedFees.length : '—'}</span></h2>
            {complete && completedFees.length === 0 ? <p className="settings-note">目前没有已处理收据。</p> : <div className="fee-list">{completedFees.map(renderFee)}</div>}
          </section>
        </div>
      ) : <div className="fee-list">{displayed.map(renderFee)}</div>}
    </FeesShell>
  )
}

function normalizeStatus(value: string | null, view: FeesView): FeeStatusFilter {
  if (value === 'paid' || value === 'all' || value === 'unpaid') return value
  if (view === 'history') return 'all'
  return 'unpaid'
}

function statusLabel(status: FeeStatusFilter) {
  if (status === 'unpaid') return '未缴'
  if (status === 'paid') return '已缴'
  return '全部'
}
