import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listAttendanceSessions, type AttendanceView } from '../api/scheduleService'
import { AllDayStopPanel } from '../components/AllDayStopPanel'
import { SessionCard } from '../components/SessionCard'

const viewLabels: Record<AttendanceView, string> = {
  today: '今天',
  week: '本周',
  history: '历史',
}
export function AttendancePage() {
  const [view, setView] = useState<AttendanceView>('today')
  const sessions = useQuery({
    queryKey: ['sessions', 'attendance', view],
    queryFn: () => listAttendanceSessions(view),
  })

  return (
    <section>
      <PageHeader title="点名" />
      <details className="action-panel all-day-stop-panel">
        <summary>全日停课</summary>
        <AllDayStopPanel />
      </details>
      <div className="segmented-control" aria-label="课程日期范围">
        {(Object.keys(viewLabels) as AttendanceView[]).map((item) => (
          <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
            {viewLabels[item]}
          </button>
        ))}
      </div>

      {sessions.isLoading && <LoadingBlock />}
      {sessions.isError && <ErrorBlock message="课程载入失败，请重试。" />}
      {sessions.data?.length === 0 && <EmptyBlock message={`${viewLabels[view]}没有课程。`} />}
      <div className="record-list">
        {sessions.data?.map((session) => <SessionCard session={session} showClass key={session.id} />)}
      </div>
    </section>
  )
}
