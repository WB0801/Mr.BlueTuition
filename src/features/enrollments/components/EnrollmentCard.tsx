import { ContextLink } from '../../../components/navigation/ContextLink'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import { Icon } from '../../../components/ui'
import type { EnrollmentWithClass } from '../../../types/domain'
import { formatDate } from '../../../utils/format'

interface EnrollmentCardProps {
  enrollment: EnrollmentWithClass
}

export function EnrollmentCard({ enrollment }: EnrollmentCardProps) {
  return (
    <article className="record-card enrollment-card">
      <ContextLink
        backLabel="学生"
        className="enrollment-card-main"
        to={`/students/${enrollment.student_id}/enrollments/${enrollment.id}`}
      >
        <span className="record-main">
          <strong>{enrollment.class?.name ?? '班级资料不可用'}</strong>
          <span className="record-meta">
            {formatDate(enrollment.join_date)}
            {enrollment.end_date ? ` – ${formatDate(enrollment.end_date)}` : ' 加入'}
          </span>
        </span>
        <span className="record-card-end">
          <StatusBadge status={enrollment.status} />
          <Icon className="record-chevron" name="chevron-right" size={20} />
        </span>
      </ContextLink>
      {enrollment.class && (
        <ContextLink backLabel="学生" className="button button-text button-small" to={`/classes/${enrollment.class.id}`}>
          班级详情
        </ContextLink>
      )}
    </article>
  )
}
