import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatDate, formatTime, todayInMalaysia, weekdayLabels } from '../../../utils/format'
import { listClassSessions, listScheduleRules } from '../api/scheduleService'
import { ExtraSessionForm } from './ExtraSessionForm'
import { ScheduleChangeForm } from './ScheduleChangeForm'
import { SessionCard } from './SessionCard'

interface ClassScheduleSectionProps {
  tuitionClass: TuitionClass
}

export function ClassScheduleSection({ tuitionClass }: ClassScheduleSectionProps) {
  const classId = tuitionClass.id
  const [pageOpenedAt] = useState(() => Date.now())
  const [pageDate] = useState(todayInMalaysia)
  const rules = useQuery({
    queryKey: ['schedule-rules', classId],
    queryFn: () => listScheduleRules(classId),
  })
  const sessions = useQuery({
    queryKey: ['sessions', 'class', classId],
    queryFn: () => listClassSessions(classId),
  })

  const future = sessions.data?.filter((session) => new Date(session.current_start_at).getTime() >= pageOpenedAt) ?? []
  const history = sessions.data
    ?.filter((session) => new Date(session.current_start_at).getTime() < pageOpenedAt)
    .reverse() ?? []
  const summaryRule = rules.data?.find((rule) => rule.id === tuitionClass.schedule_summary_rule_id)
  const primarySlotId = summaryRule?.schedule_slot_id
  const primaryRules = primarySlotId
    ? rules.data?.filter((rule) => rule.schedule_slot_id === primarySlotId)
    : rules.data
  const openRule = primaryRules?.find((rule) => rule.effective_to === null)
  const currentRule = primaryRules?.find((rule) => (
    rule.effective_from <= pageDate && (rule.effective_to === null || rule.effective_to >= pageDate)
  )) ?? openRule ?? primaryRules?.[0]
  const upcomingRule = primaryRules
    ?.filter((rule) => rule.effective_from > pageDate)
    .sort((left, right) => left.effective_from.localeCompare(right.effective_from))[0] ?? null

  return (
    <section className="content-section schedule-section">
      <h2>固定课表</h2>
      {rules.isLoading && <LoadingBlock />}
      {rules.isError && <ErrorBlock message="固定课表载入失败。" />}
      {currentRule && (
        <div className="details-card schedule-rule-card">
          <div><dt>当前安排</dt><dd>{weekdayLabels[currentRule.weekday]} · {formatTime(currentRule.start_time)} – {formatTime(currentRule.end_time)}</dd></div>
          <div><dt>生效日期</dt><dd>{formatDate(currentRule.effective_from)}</dd></div>
          {upcomingRule && (
            <div><dt>未来安排</dt><dd>{formatDate(upcomingRule.effective_from)} 起 · {weekdayLabels[upcomingRule.weekday]} · {formatTime(upcomingRule.start_time)} – {formatTime(upcomingRule.end_time)}</dd></div>
          )}
        </div>
      )}

      {tuitionClass.status === 'active' && openRule && (
        <div className="schedule-actions-grid">
          <details className="action-panel">
            <summary>修改未来固定课表</summary>
            <ScheduleChangeForm classId={classId} currentRule={openRule} />
          </details>
          <details className="action-panel">
            <summary>新增额外补课</summary>
            <ExtraSessionForm
              classId={classId}
              defaultStartTime={currentRule?.start_time ?? openRule.start_time}
              defaultEndTime={currentRule?.end_time ?? openRule.end_time}
            />
          </details>
        </div>
      )}

      {(rules.data?.length ?? 0) > 1 && (
        <details className="history-panel">
          <summary>课表历史（{rules.data?.length}）</summary>
          <div className="simple-history-list">
            {rules.data?.map((rule) => (
              <div key={rule.id}>
                <strong>{weekdayLabels[rule.weekday]} · {formatTime(rule.start_time)} – {formatTime(rule.end_time)}</strong>
                <span>{formatDate(rule.effective_from)} – {formatDate(rule.effective_to)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="content-section nested-section">
        <h2>未来课程</h2>
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
    </section>
  )
}
