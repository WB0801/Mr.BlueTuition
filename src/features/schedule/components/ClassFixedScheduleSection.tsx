import { useQuery } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatDate, formatTime, todayInMalaysia, weekdayLabels } from '../../../utils/format'
import { listScheduleRules } from '../api/scheduleService'
import { selectPrimaryScheduleRules } from '../scheduleView'
import { ExtraSessionForm } from './ExtraSessionForm'
import { ScheduleChangeForm } from './ScheduleChangeForm'

interface ClassFixedScheduleSectionProps {
  tuitionClass: TuitionClass
}

export function ClassFixedScheduleSection({ tuitionClass }: ClassFixedScheduleSectionProps) {
  const classId = tuitionClass.id
  const rules = useQuery({
    queryKey: ['schedule-rules', classId],
    queryFn: () => listScheduleRules(classId),
  })
  const { currentRule, openRule, upcomingRule } = selectPrimaryScheduleRules(
    rules.data ?? [],
    tuitionClass.schedule_summary_rule_id,
    todayInMalaysia(),
  )

  return (
    <section className="content-section schedule-section">
      <h2>固定课表</h2>
      {rules.isLoading && <LoadingBlock />}
      {rules.isError && <ErrorBlock message="固定课表载入失败。" />}
      {!rules.isLoading && !currentRule && <EmptyBlock message="目前没有固定课表。" />}
      {currentRule && (
        <dl className="details-card schedule-rule-card">
          <div><dt>当前安排</dt><dd>{weekdayLabels[currentRule.weekday]} · {formatTime(currentRule.start_time)}–{formatTime(currentRule.end_time)}</dd></div>
          <div><dt>生效日期</dt><dd>{formatDate(currentRule.effective_from)}</dd></div>
          {upcomingRule && (
            <div><dt>未来安排</dt><dd>{formatDate(upcomingRule.effective_from)} 起 · {weekdayLabels[upcomingRule.weekday]} · {formatTime(upcomingRule.start_time)}–{formatTime(upcomingRule.end_time)}</dd></div>
          )}
        </dl>
      )}

      {tuitionClass.status === 'active' && openRule && (
        <div className="schedule-actions-grid compact-schedule-actions">
          <details className="action-panel">
            <summary>调整课表</summary>
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
    </section>
  )
}
