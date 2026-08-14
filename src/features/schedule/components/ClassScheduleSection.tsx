import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listClassSessions } from '../api/scheduleService'
import { splitClassSessions } from '../scheduleView'
import { ClassFixedScheduleSection } from './ClassFixedScheduleSection'
import { ClassScheduleHistory } from './ClassScheduleHistory'
import { SessionCard } from './SessionCard'

interface ClassScheduleSectionProps {
  tuitionClass: TuitionClass
}

export function ClassScheduleSection({ tuitionClass }: ClassScheduleSectionProps) {
  const classId = tuitionClass.id
  const [pageOpenedAt] = useState(() => Date.now())
  const sessions = useQuery({
    queryKey: ['sessions', 'class', classId],
    queryFn: () => listClassSessions(classId),
  })
  const { future, history } = splitClassSessions(sessions.data ?? [], pageOpenedAt)

  return (
    <>
      <ClassFixedScheduleSection tuitionClass={tuitionClass} />

      <section className="content-section">
        <h2>未来课程（{future.length}）</h2>
        {sessions.isLoading && <LoadingBlock />}
        {sessions.isError && <ErrorBlock message="课程载入失败。" />}
        {!sessions.isLoading && future.length === 0 && <EmptyBlock message="目前没有未来课程。" />}
        <div className="record-list">{future.map((session) => <SessionCard session={session} key={session.id} />)}</div>
      </section>

      <details className="history-panel">
        <summary>历史课程（{history.length}）</summary>
        {history.length === 0
          ? <EmptyBlock message="目前没有历史课程。" />
          : <div className="record-list">{history.map((session) => <SessionCard session={session} key={session.id} />)}</div>}
      </details>

      <ClassScheduleHistory tuitionClass={tuitionClass} />
    </>
  )
}
