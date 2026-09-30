import { Fragment, useState } from 'react'
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import { listAttendanceHistoryPage, listAttendanceSessions, listStudentAttendanceHistoryPage, loadStudentAttendanceScope, type AttendanceHistoryCursor, type AttendanceView } from '../api/scheduleService'
import { formatDate, formatFeeMonth, toMalaysiaDateInput, todayInMalaysia } from '../../../utils/format'
import { getStudent } from '../../students/api/studentsService'
import { AllDayStopPanel } from '../components/AllDayStopPanel'
import { SessionCard } from '../components/SessionCard'

const viewLabels: Record<AttendanceView, string> = {
  today: '今天',
  week: '本周',
  history: '历史',
}

export function AttendancePage() {
  const [stopPreviewOpen, setStopPreviewOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const classId = searchParams.get('classId') ?? ''
  const studentId = searchParams.get('studentId') ?? ''
  const student = useQuery({ queryKey: ['student', studentId], queryFn: () => getStudent(studentId), enabled: Boolean(studentId) })
  const view: AttendanceView = requestedView === 'week' || requestedView === 'history' ? requestedView : 'today'
  const selectView = (next: AttendanceView) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'today') params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }
  const sessions = useQuery({
    queryKey: ['sessions', 'attendance', view],
    queryFn: () => listAttendanceSessions(view),
    enabled: view !== 'history',
  })
  const referenceDate = todayInMalaysia()
  const studentScope = useQuery({
    queryKey: ['attendance', 'student-history-scope', studentId],
    queryFn: () => loadStudentAttendanceScope(studentId),
    enabled: view === 'history' && Boolean(studentId),
    staleTime: 30_000,
  })
  const history = useInfiniteQuery({
    queryKey: ['sessions', 'attendance', 'paged-history', classId, studentId, referenceDate],
    queryFn: ({ pageParam }) => studentId
      ? listStudentAttendanceHistoryPage(pageParam, studentScope.data!, referenceDate, classId)
      : listAttendanceHistoryPage(pageParam, classId, referenceDate),
    initialPageParam: null as AttendanceHistoryCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: view === 'history' && (!studentId || studentScope.isSuccess),
    staleTime: 30_000,
  })
  const activeQuery = view === 'history' ? history : sessions
  const loadedSessions = view === 'history' ? history.data?.pages.flatMap((page) => page.sessions) ?? [] : sessions.data ?? []
  const hasLoadedPastCourses = history.data?.pages.some((page) => page.pastCount > 0) ?? false
  const earliest = view === 'history' && hasLoadedPastCourses ? loadedSessions.at(-1)?.current_start_at : undefined
  const rosterQueries = useQueries({
    queries: loadedSessions.map((session) => ({
      queryKey: ['attendance', session.id, 'roster'],
      queryFn: () => getSessionRoster(session.id),
      staleTime: 30_000,
    })),
  })
  const rows = loadedSessions.map((session, index) => {
    const roster = rosterQueries[index]?.data ?? []
    const signed = roster.filter((entry) => entry.attendance_record_id).length
    return { session, signed, total: roster.length, loading: rosterQueries[index]?.isLoading, studentEntry: studentId ? roster.find((entry) => entry.student_id === studentId) : undefined }
  }).filter((row) => (!classId || row.session.class_id === classId) && (!studentId || row.loading || row.studentEntry))
  const complete = rows.filter((row) => !row.loading && (studentId ? Boolean(row.studentEntry?.attendance_record_id) : row.total > 0 && row.signed === row.total))
  const unfinished = rows.filter((row) => !complete.includes(row))
  const renderCard = (row: (typeof rows)[number]) => <SessionCard
    session={row.session} showClass key={row.session.id}
    attendanceSummary={studentId ? undefined : { signed: row.signed, total: row.total }}
    studentAttendance={studentId ? row.studentEntry ?? null : undefined}
  />

  return (
    <section className="attendance-page">
      <PageHeader title={studentId ? student.data?.name ?? '出席记录' : '点名'} />
      {studentId && student.data && <h2 className="attendance-subtitle">出席记录</h2>}
      {studentId && student.isLoading && <LoadingBlock message="正在读取学生姓名…" />}
      {studentId && student.isError && <div className="identity-error"><ErrorBlock message="学生姓名读取失败。" /><button className="button button-secondary" type="button" onClick={() => void student.refetch()}>重试学生姓名</button></div>}
      {(classId || studentId) && <div className="scope-notice"><strong>{studentId ? classId ? '此学生 · 指定班级范围' : '此学生' : '指定班级的课程'}</strong><button className="button button-text" type="button" onClick={() => {
        const next = new URLSearchParams(searchParams); next.delete('classId'); next.delete('studentId'); setSearchParams(next, { replace: true })
      }}>显示全部课程</button></div>}
      <div className="attendance-toolbar">
        <div className="attendance-tabs" role="group" aria-label="课程日期范围">
          <span aria-hidden="true" className="attendance-tab-marker" style={{ transform: `translateX(${(view === 'today' ? 0 : view === 'week' ? 1 : 2) * 100}%)` }} />
          {(Object.keys(viewLabels) as AttendanceView[]).map((item) => (
            <button type="button" aria-pressed={view === item} className={view === item ? 'active' : ''} onClick={() => selectView(item)} key={item}>
              {viewLabels[item]}
            </button>
          ))}
        </div>
      </div>
      {view === 'history' && <p className="field-hint attendance-range">{earliest && `已加载至：${formatDate(toMalaysiaDateInput(earliest))} · `}仅显示已加载记录</p>}

      {(activeQuery.isLoading || (view === 'history' && studentId && studentScope.isLoading)) && <LoadingBlock />}
      {view === 'history' && studentId && studentScope.isError && <><ErrorBlock message="学生报读及补课范围载入失败，无法确认课程，请重试。" /><button type="button" className="button button-secondary" onClick={() => void studentScope.refetch()}>重试</button></>}
      {activeQuery.isError && <><ErrorBlock message="课程载入失败。" /><button type="button" className="button button-secondary" onClick={() => void activeQuery.refetch()}>重试</button></>}
      {rosterQueries.some((query) => query.isError) && <ErrorBlock message="部分点名名单载入失败，学生状态未能确认。请刷新重试。" />}
      {activeQuery.isSuccess && !rosterQueries.some((query) => query.isLoading || query.isError) && rows.length === 0 && <EmptyBlock message={view === 'history' ? '已加载范围内没有符合条件的课程。' : `${viewLabels[view]}没有符合条件的课程。`} />}
      {view === 'today' ? (
        <div className="attendance-groups">
          <section>
            <h2>待完成 <span className="section-count">{unfinished.length}</span></h2>
            {unfinished.length === 0 && rows.length > 0 && <p className="compact-empty">今天的点名已全部完成。</p>}
            <div className="compact-data-list">
              {unfinished.map(renderCard)}
            </div>
          </section>
          {complete.length > 0 && (
            <details className="history-panel" open>
              <summary>已完成（{complete.length}）</summary>
              <div className="compact-data-list">
                {complete.map(renderCard)}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="compact-data-list">
          {rows.map((row, index) => {
            const month = toMalaysiaDateInput(row.session.current_start_at).slice(0, 7)
            const previousMonth = index > 0 ? toMalaysiaDateInput(rows[index - 1].session.current_start_at).slice(0, 7) : null
            return <Fragment key={row.session.id}>
              {view === 'history' && month !== previousMonth && <h2 className="attendance-month">{formatFeeMonth(month)}</h2>}
              {renderCard(row)}
            </Fragment>
          })}
        </div>
      )}
      <details className="action-panel all-day-stop-panel" onToggle={(event) => setStopPreviewOpen(event.currentTarget.open)}>
        <summary>全日停课</summary>
        {stopPreviewOpen && <AllDayStopPanel />}
      </details>
      {view === 'history' && history.data && <div className="history-load-more">
        {history.hasNextPage ? <button className="button button-secondary" type="button" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? '正在读取更早课程…' : '继续查看更早课程'}</button> : <p className="field-hint">没有更早的课程</p>}
        {history.isFetchNextPageError && <p role="alert" className="form-error">更早课程读取失败，已加载资料保留，请重试。</p>}
      </div>}
    </section>
  )
}
