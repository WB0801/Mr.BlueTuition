import { useQuery } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listClassSessions } from '../api/scheduleService'
import { splitClassSessions } from '../scheduleView'
import { ClassFixedScheduleSection } from './ClassFixedScheduleSection'
import { ClassScheduleHistory } from './ClassScheduleHistory'
import { SessionCard } from './SessionCard'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { useScopedSessionGeneration } from './useScopedSessionGeneration'
import { todayInMalaysia } from '../../../utils/format'

interface ClassScheduleSectionProps {
  tuitionClass: TuitionClass
  active?: boolean
  prefix?: string
  onSelect?: (id: string) => void
}

export function ClassScheduleSection({ tuitionClass, active = true, prefix = '', onSelect }: ClassScheduleSectionProps) {
  const { get, set } = useRecordParams(prefix)
  const generation = useScopedSessionGeneration(Boolean(prefix) && active)
  const classId = tuitionClass.id
  const [pageOpenedAt] = useState(() => Date.now())
  const sessions = useQuery({
    queryKey: ['sessions', 'class', classId, todayInMalaysia()],
    queryFn: () => listClassSessions(classId, !prefix),
    enabled: active && (!prefix || (generation.isSuccess && !generation.isFetching)),
    staleTime: prefix ? Infinity : 0,
    refetchOnWindowFocus: !prefix,
  })
  const { future, history } = splitClassSessions(sessions.data ?? [], pageOpenedAt)
  const nextSessions = future.slice(0, 12)
  const laterSessions = future.slice(12)

  return (
    <>
      <section className="content-section">
        <h2>接下来课程（{future.length}）</h2>
        {generation.isLoading && prefix && <LoadingBlock />}
        {generation.isError && prefix && <><ErrorBlock message="课程准备失败。" /><button type="button" className="button button-secondary" onClick={() => void generation.refetch()}>重试</button></>}
        {sessions.isLoading && <LoadingBlock />}
        {sessions.isError && <ErrorBlock message="课程载入失败。" />}
        {sessions.isSuccess && future.length === 0 && <EmptyBlock message="目前没有未来课程。" />}
        <div className="compact-data-list">{nextSessions.map((session) => <SessionCard session={session} key={session.id} onSelect={onSelect} />)}</div>
      </section>

      {laterSessions.length > 0 && (
        <details className="history-panel">
          <summary>稍后课程（{laterSessions.length}）</summary>
          <div className="compact-data-list">{laterSessions.map((session) => <SessionCard session={session} key={session.id} onSelect={onSelect} />)}</div>
        </details>
      )}

      <details className="history-panel" open={prefix ? get('history') === '1' : undefined}>
        <summary onClick={prefix ? event => { event.preventDefault(); set('history', get('history') === '1' ? '' : '1') } : undefined}>历史课程（{history.length}）</summary>
        <p className="field-hint">仅显示已加载记录</p>
        {sessions.isSuccess && (history.length === 0
          ? <EmptyBlock message="目前没有历史课程。" />
          : <div className="compact-data-list">{history.map((session) => <SessionCard session={session} key={session.id} onSelect={onSelect} />)}</div>)}
      </details>

      {!prefix && <details className="management-panel">
        <summary>固定课表与调整历史</summary>
        <ClassFixedScheduleSection tuitionClass={tuitionClass} />
        <ClassScheduleHistory tuitionClass={tuitionClass} />
      </details>}
    </>
  )
}
import { useState } from 'react'
