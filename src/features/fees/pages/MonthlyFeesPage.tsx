import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listClasses } from '../../classes/api/classesService'
import { currentMonthInMalaysia, formatFeeMonth, normalizeMonthInput } from '../../../utils/format'
import { ensureMonthlyFees, listMonthlyFees } from '../api/feesService'
import { FeesShell } from '../components/FeesShell'
import { MonthlyFeeCard } from '../components/MonthlyFeeCard'
import { sortFeesByActionPriority } from '../feePresentation'

type FeesView = 'current' | 'unpaid' | 'history'

interface MonthlyFeesPageProps {
  view: FeesView
}

const titles: Record<FeesView, string> = {
  current: '本月缴费',
  unpaid: '未缴名单',
  history: '历史缴费',
}

export function MonthlyFeesPage({ view }: MonthlyFeesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const monthInput = searchParams.get('month') ?? currentMonthInMalaysia().slice(0, 7)
  const classId = searchParams.get('classId') ?? ''
  const studentId = searchParams.get('studentId') ?? ''
  const search = searchParams.get('q') ?? ''
  const updateFilter = (key: 'month' | 'classId' | 'q', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const feeMonth = normalizeMonthInput(monthInput)
  const ensure = useQuery({
    queryKey: ['monthly-fees', 'ensure', feeMonth],
    queryFn: () => ensureMonthlyFees(feeMonth),
  })
  const fees = useQuery({
    queryKey: ['monthly-fees', view, feeMonth, classId, studentId],
    queryFn: () => listMonthlyFees({
      feeMonth,
      classId: classId || undefined,
      studentId: studentId || undefined,
      paymentStatus: view === 'unpaid' ? 'unpaid' : undefined,
    }),
    enabled: ensure.isSuccess,
  })
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => listClasses() })

  const visibleFees = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase()
    const sorted = sortFeesByActionPriority(fees.data ?? [])
    if (!keyword) return sorted
    return sorted.filter((fee) => [
      fee.student?.name,
      fee.student?.school_class,
      fee.student?.phone,
      fee.enrollment?.class?.name,
    ].some((value) => value?.toLocaleLowerCase().includes(keyword)))
  }, [fees.data, search])

  return (
    <FeesShell>
      <div className="section-heading-row">
        <div>
          <h2>{titles[view]}</h2>
          <p className="muted">{formatFeeMonth(feeMonth)}</p>
        </div>
      </div>

      <div className="fees-filters">
        <label className="field">
          <span>月份</span>
          <input type="month" max={currentMonthInMalaysia().slice(0, 7)} value={monthInput} onChange={(event) => updateFilter('month', event.target.value)} />
        </label>
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

      {(ensure.isLoading || fees.isLoading) && <LoadingBlock message="正在准备月费记录…" />}
      {(ensure.isError || fees.isError) && <ErrorBlock message="月费资料载入失败，请稍后重试。" />}
      {!fees.isLoading && !fees.isError && visibleFees.length === 0 && (
        <EmptyBlock message={search ? '找不到符合搜索的学生。' : '这个月份没有需要显示的月费。'} />
      )}
      <div className="fee-list">
        {visibleFees.map((fee) => <MonthlyFeeCard fee={fee} key={fee.id} />)}
      </div>
    </FeesShell>
  )
}
