import type { TuitionClass } from '../../../types/domain'
import { formatMoney, formatTime, weekdayLabels } from '../../../utils/format'

interface ClassScheduleSummaryProps {
  tuitionClass: Pick<TuitionClass, 'weekday' | 'start_time' | 'end_time' | 'monthly_fee'>
}

export function ClassScheduleSummary({ tuitionClass }: ClassScheduleSummaryProps) {
  return (
    <span className="class-summary">
      <span>{weekdayLabels[tuitionClass.weekday]} · {formatTime(tuitionClass.start_time)} – {formatTime(tuitionClass.end_time)}</span>
      <span>{formatMoney(tuitionClass.monthly_fee)} / 月</span>
    </span>
  )
}
