import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listClasses } from '../../classes/api/classesService'
import { currentMonthInMalaysia, normalizeMonthInput } from '../../../utils/format'
import { ensureMonthlyFees, listMonthlyFees } from '../api/feesService'
import { FeesShell } from '../components/FeesShell'
import { MonthlyFeeCard } from '../components/MonthlyFeeCard'
import { matchesFeeStatus, sortFeesForWorkflow, type FeeStatusFilter } from '../feePresentation'

type FeesView = 'current' | 'unpaid' | 'history'

interface MonthlyFeesPageProps {
  view: FeesView
}

export function MonthlyFeesPage({ view }: MonthlyFeesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const monthInput = searchParams.get('month') ?? currentMonthInMalaysia().slice(0, 7)
  const classId = searchParams.get('classId') ?? ''
  const studentId = searchParams.get('studentId') ?? ''
  const feeId = searchParams.get('feeId') ?? ''
  const search = searchParams.get('q') ?? ''
  const status = normalizeStatus(searchParams.get('status'), view)
  const updateFilter = (key: 'month' | 'classId' | 'studentId' | 'q' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete('feeId')
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const allMonths = monthInput === 'all'
  const feeMonth = allMonths ? currentMonthInMalaysia() : normalizeMonthInput(monthInput)
  const ensure = useQuery({
    queryKey: ['monthly-fees', 'ensure', feeMonth],
    queryFn: () => ensureMonthlyFees(feeMonth),
  })
  const fees = useQuery({
    queryKey: ['monthly-fees', 'list', allMonths ? 'all' : feeMonth, classId, studentId],
    queryFn: () => listMonthlyFees({
      feeMonth: allMonths ? undefined : feeMonth,
      classId: classId || undefined,
      studentId: studentId || undefined,
    }),
    enabled: ensure.isSuccess,
  })
  const classes = useQuery({ queryKey: ['classes', 'active'], queryFn: () => listClasses('active') })

  const visibleFees = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase()
    const filtered = (fees.data ?? []).filter((fee) => matchesFeeStatus(fee, status) && (!feeId || fee.id === feeId))
    const searched = !keyword ? filtered : filtered.filter((fee) => [
      fee.student?.name,
      fee.enrollment?.class?.name,
    ].some((value) => value?.toLocaleLowerCase().includes(keyword)))
    return sortFeesForWorkflow(searched, { status, classId: classId || undefined })
  }, [fees.data, search, status, classId, feeId])

  const counts = useMemo(() => ({
    unpaid: (fees.data ?? []).filter((fee) => fee.payment_status === 'unpaid').length,
    paid: (fees.data ?? []).filter((fee) => fee.payment_status === 'paid').length,
    all: (fees.data ?? []).length,
  }), [fees.data])
  const pendingFees = status === 'paid' ? visibleFees.filter((fee) => fee.receipt_status === 'pending') : []
  const completedFees = status === 'paid' ? visibleFees.filter((fee) => fee.receipt_status === 'completed') : []

  return (
    <FeesShell>
      {feeId && <div className="scope-notice"><strong>收据对应的缴费记录</strong><button type="button" className="button button-text" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('feeId'); setSearchParams(next, { replace: true }) }}>显示此范围全部缴费记录</button></div>}
      {studentId && <div className="scope-notice" role="status"><strong>{fees.data?.[0]?.student?.name ?? '指定学生'}的缴费记录</strong><button type="button" className="button button-text" onClick={() => updateFilter('studentId', '')}>显示所有学生</button></div>}
      <div className="fees-workflow-header">
        <div className="fees-filters">
        <div className="field">
          <label htmlFor="fee-month">月份</label>
          <input id="fee-month" type="month" aria-label="指定月份" max={currentMonthInMalaysia().slice(0, 7)} value={allMonths ? '' : monthInput} onChange={(event) => updateFilter('month', event.target.value)} />
          <label className="checkbox-row"><input type="checkbox" checked={allMonths} onChange={(event) => updateFilter('month', event.target.checked ? 'all' : currentMonthInMalaysia().slice(0, 7))} />所有月份</label>
        </div>
        <label className="field">
          <span>班级</span>
          <select value={classId} onChange={(event) => updateFilter('classId', event.target.value)}>
            <option value="">全部班级</option>
            {(classes.data ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
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
      </div>

      {(ensure.isLoading || fees.isLoading) && <LoadingBlock message="正在准备月费记录…" />}
      {(ensure.isError || fees.isError) && <ErrorBlock message="月费资料载入失败，请稍后重试。" />}
      {fees.isSuccess && visibleFees.length === 0 && (
        <EmptyBlock message={search ? '找不到符合搜索的学生。' : allMonths ? '目前筛选范围没有需要显示的月费。' : '这个月份没有需要显示的月费。'} />
      )}
      {status === 'paid' ? (
        <div className="paid-fee-groups">
          <section>
            <h2>待开收据 <span className="section-count">{pendingFees.length}</span></h2>
            {pendingFees.length === 0 ? <p className="settings-note">目前没有待开收据。</p> : <div className="fee-list">{pendingFees.map((fee) => <MonthlyFeeCard fee={fee} key={fee.id} />)}</div>}
          </section>
          <section>
            <h2>收据已处理 <span className="section-count">{completedFees.length}</span></h2>
            {completedFees.length === 0 ? <p className="settings-note">目前没有已处理收据。</p> : <div className="fee-list">{completedFees.map((fee) => <MonthlyFeeCard fee={fee} key={fee.id} />)}</div>}
          </section>
        </div>
      ) : <div className="fee-list">{visibleFees.map((fee) => <MonthlyFeeCard fee={fee} key={fee.id} />)}</div>}
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
