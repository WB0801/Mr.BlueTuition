import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatDateTime } from '../../../utils/format'
import { listClassSessions } from '../api/scheduleService'
import { splitClassSessions } from '../scheduleView'

interface ClassCourseSummaryProps {
  classId: string
}

export function ClassCourseSummary({ classId }: ClassCourseSummaryProps) {
  const [pageOpenedAt] = useState(() => Date.now())
  const sessions = useQuery({
    queryKey: ['sessions', 'class', classId],
    queryFn: () => listClassSessions(classId),
  })
  const { future } = splitClassSessions(sessions.data ?? [], pageOpenedAt)
  const nextSession = future[0]

  return (
    <section className="content-section class-course-summary">
      <h2>课程</h2>
      {sessions.isLoading && <LoadingBlock />}
      {sessions.isError && <ErrorBlock message="课程摘要载入失败。" />}
      {!sessions.isLoading && !nextSession && <EmptyBlock message="目前没有未来课程。" />}
      {nextSession && (
        <dl className="details-card course-summary-card">
          <div>
            <dt>下一堂</dt>
            <dd>
              {formatDateTime(nextSession.current_start_at)}
              <span className="session-labels course-summary-labels">
                {nextSession.session_type === 'extra' && <span className="session-type-label">额外补课</span>}
                {nextSession.status === 'cancelled' && <span className="session-status status-cancelled">停课</span>}
                {nextSession.status === 'completed' && <span className="session-status status-completed">已完成</span>}
              </span>
            </dd>
          </div>
          <div><dt>未来已安排</dt><dd>{future.length} 堂</dd></div>
        </dl>
      )}
      <ContextLink backLabel="班级" className="button button-secondary" to={`/classes/${classId}/sessions`}>查看全部课程</ContextLink>
    </section>
  )
}
