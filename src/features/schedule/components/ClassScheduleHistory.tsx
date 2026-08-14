import { useQuery } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatDate, formatTime, weekdayLabels } from '../../../utils/format'
import { listScheduleRules } from '../api/scheduleService'

interface ClassScheduleHistoryProps {
  tuitionClass: TuitionClass
}

export function ClassScheduleHistory({ tuitionClass }: ClassScheduleHistoryProps) {
  const rules = useQuery({
    queryKey: ['schedule-rules', tuitionClass.id],
    queryFn: () => listScheduleRules(tuitionClass.id),
  })

  return (
    <details className="history-panel">
      <summary>课表历史（{rules.data?.length ?? 0}）</summary>
      {rules.isLoading && <LoadingBlock />}
      {rules.isError && <ErrorBlock message="课表历史载入失败。" />}
      {!rules.isLoading && (rules.data?.length ?? 0) === 0 && <EmptyBlock message="目前没有课表历史。" />}
      <div className="simple-history-list">
        {rules.data?.map((rule) => (
          <div key={rule.id}>
            <strong>{weekdayLabels[rule.weekday]} · {formatTime(rule.start_time)}–{formatTime(rule.end_time)}</strong>
            <span>{formatDate(rule.effective_from)}–{formatDate(rule.effective_to)}</span>
          </div>
        ))}
      </div>
    </details>
  )
}
