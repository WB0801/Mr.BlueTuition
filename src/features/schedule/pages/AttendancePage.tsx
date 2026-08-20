import { useQueries, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import { listAttendanceSessions, type AttendanceView } from '../api/scheduleService'
import { AllDayStopPanel } from '../components/AllDayStopPanel'
import { SessionCard } from '../components/SessionCard'

const viewLabels: Record<AttendanceView, string> = {
  today: '今天',
  week: '本周',
  history: '历史',
}

export function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const view: AttendanceView = requestedView === 'week' || requestedView === 'history' ? requestedView : 'today'
  const selectView = (next: AttendanceView) => setSearchParams(next === 'today' ? {} : { view: next }, { replace: true })
  const sessions = useQuery({
    queryKey: ['sessions', 'attendance', view],
    queryFn: () => listAttendanceSessions(view),
  })
  const rosterQueries = useQueries({
    queries: (sessions.data ?? []).map((session) => ({
      queryKey: ['attendance', session.id, 'roster'],
      queryFn: () => getSessionRoster(session.id),
      staleTime: 30_000,
    })),
  })
  const rows = (sessions.data ?? []).map((session, index) => {
    const roster = rosterQueries[index]?.data ?? []
    const signed = roster.filter((entry) => entry.attendance_record_id).length
    return { session, signed, total: roster.length, loading: rosterQueries[index]?.isLoading }
  })
  const complete = rows.filter((row) => !row.loading && row.total > 0 && row.signed === row.total)
  const unfinished = rows.filter((row) => row.loading || row.total === 0 || row.signed < row.total)

  return (
    <section className="attendance-page">
      <PageHeader title="点名" />
      <div className="attendance-toolbar">
        <div className="segmented-control" aria-label="课程日期范围">
          {(Object.keys(viewLabels) as AttendanceView[]).map((item) => (
            <button type="button" className={view === item ? 'active' : ''} onClick={() => selectView(item)} key={item}>
              {viewLabels[item]}
            </button>
          ))}
        </div>
        <details className="action-panel all-day-stop-panel">
          <summary>全日停课</summary>
          <AllDayStopPanel />
        </details>
      </div>

      {sessions.isLoading && <LoadingBlock />}
      {sessions.isError && <ErrorBlock message="课程载入失败，请重试。" />}
      {sessions.data?.length === 0 && <EmptyBlock message={`${viewLabels[view]}没有课程。`} />}
      {view === 'today' ? (
        <div className="attendance-groups">
          <section>
            <h2>待完成 <span className="section-count">{unfinished.length}</span></h2>
            {unfinished.length === 0 && rows.length > 0 && <p className="compact-empty">今天的点名已全部完成。</p>}
            <div className="compact-data-list">
              {unfinished.map((row) => <SessionCard session={row.session} showClass attendanceSummary={{ signed: row.signed, total: row.total }} key={row.session.id} />)}
            </div>
          </section>
          {complete.length > 0 && (
            <details className="history-panel" open>
              <summary>已完成（{complete.length}）</summary>
              <div className="compact-data-list">
                {complete.map((row) => <SessionCard session={row.session} showClass attendanceSummary={{ signed: row.signed, total: row.total }} key={row.session.id} />)}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="compact-data-list">
          {rows.map((row) => <SessionCard session={row.session} showClass attendanceSummary={{ signed: row.signed, total: row.total }} key={row.session.id} />)}
        </div>
      )}
    </section>
  )
}
