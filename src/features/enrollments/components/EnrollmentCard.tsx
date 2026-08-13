import { Link } from 'react-router-dom'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import type { EnrollmentWithClass } from '../../../types/domain'
import { formatDate } from '../../../utils/format'

interface EnrollmentCardProps {
  enrollment: EnrollmentWithClass
}

export function EnrollmentCard({ enrollment }: EnrollmentCardProps) {
  return (
    <Link
      className="record-card enrollment-card"
      to={`/students/${enrollment.student_id}/enrollments/${enrollment.id}`}
    >
      <span className="record-main">
        <strong>{enrollment.class?.name ?? '班级资料不可用'}</strong>
        <span className="record-meta">
          {formatDate(enrollment.join_date)}
          {enrollment.end_date ? ` – ${formatDate(enrollment.end_date)}` : ' 加入'}
        </span>
      </span>
      <StatusBadge status={enrollment.status} />
    </Link>
  )
}
