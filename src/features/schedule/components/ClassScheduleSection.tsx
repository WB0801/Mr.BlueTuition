import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
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
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'

interface ClassScheduleSectionProps {
  tuitionClass: TuitionClass
  active?: boolean
  prefix?: string
  onSelect?: (id: string) => void
}

export function ClassScheduleSection({ tuitionClass, active = true, prefix = '', onSelect }: ClassScheduleSectionProps) {
  const { get } = useRecordParams(prefix)
  const listView = get('list', get('history') === '1' ? 'history' : 'upcoming')
  const generation = useScopedSessionGeneration(active && listView !== 'management')
  const classId = tuitionClass.id
  const [pageOpenedAt] = useState(() => Date.now())
  const sessions = useQuery({
    queryKey: ['sessions', 'class', classId, todayInMalaysia()],
    queryFn: () => listClassSessions(classId, false),
    enabled: active && listView !== 'management' && generation.isSuccess && !generation.isFetching,
    staleTime: prefix ? Infinity : 0,
    refetchOnWindowFocus: !prefix,
  })
  const { future, history } = splitClassSessions(sessions.data ?? [], pageOpenedAt)
  const nextSessions = future.slice(0, 12)
  const laterSessions = future.slice(12)

  return (
    <ContextDataWorkspace label="课程列表栏目" defaultPanel={get('history') === '1' ? 'history' : 'upcoming'} panelParam={prefix ? `${prefix}.list` : 'list'} sections={[
      { id: 'upcoming', label: '接下来课程', render: () => <>
      <section className="content-section">
        <h2>接下来课程（{future.length}）</h2>
        {generation.isLoading && <LoadingBlock />}
        {generation.isError && <><ErrorBlock message="课程准备失败。" /><button type="button" className="button button-secondary" onClick={() => void generation.refetch()}>重试</button></>}
        {sessions.isLoading && <LoadingBlock />}
        {sessions.isError && <><ErrorBlock message="课程载入失败。" /><button type="button" className="button button-secondary" onClick={() => void sessions.refetch()}>重试</button></>}
        {sessions.isSuccess && future.length === 0 && <EmptyBlock message="目前没有未来课程。" />}
        <div className="compact-data-list">{nextSessions.map((session) => <SessionCard session={session} key={session.id} onSelect={onSelect} />)}</div>
      </section>

      {laterSessions.length > 0 && (
        <details className="history-panel">
          <summary>稍后课程（{laterSessions.length}）</summary>
          <div className="compact-data-list">{laterSessions.map((session) => <SessionCard session={session} key={session.id} onSelect={onSelect} />)}</div>
        </details>
      )}
      </> },
      { id: 'history', label: '历史课程', render: () => <section>
        <h2>历史课程（{history.length}）</h2>
        {generation.isLoading && <LoadingBlock />}
        {generation.isError && <><ErrorBlock message="课程准备失败。" /><button type="button" className="button button-secondary" onClick={() => void generation.refetch()}>重试</button></>}
        {sessions.isLoading && <LoadingBlock />}{sessions.isError && <><ErrorBlock message="课程载入失败。" /><button type="button" className="button button-secondary" onClick={() => void sessions.refetch()}>重试</button></>}
        <p className="field-hint">仅显示已加载记录</p>
        {sessions.data && (history.length === 0
          ? <EmptyBlock message="目前没有历史课程。" />
          : <div className="compact-data-list">{history.map((session) => <SessionCard session={session} key={session.id} onSelect={onSelect} />)}</div>)}
      </section> },
      ...(!prefix ? [{ id: 'management', kind: 'action' as const, label: '课表管理', render: () => <section>
        <ClassFixedScheduleSection tuitionClass={tuitionClass} />
        <ClassScheduleHistory tuitionClass={tuitionClass} />
      </section> }] : []),
    ]} />
  )
}
