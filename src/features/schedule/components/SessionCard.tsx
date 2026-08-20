import { Link } from 'react-router-dom'
import type { ClassSessionWithClass } from '../../../types/domain'
import { formatDateTime } from '../../../utils/format'

interface SessionCardProps {
  session: ClassSessionWithClass
  showClass?: boolean
  attendanceSummary?: { signed: number; total: number }
}
const statusLabels = {
  scheduled: '已安排',
  cancelled: '停课',
  completed: '已完成',
} as const

export function SessionCard({ session, showClass = false, attendanceSummary }: SessionCardProps) {
  return (
    <Link className={`record-card session-card ${session.status === 'cancelled' ? 'cancelled-session' : ''}`} to={`/attendance/session/${session.id}`}>
      <span className="record-main">
        {showClass && <strong>{session.class?.name ?? session.temporary_class?.name ?? '未知班级'}</strong>}
        {showClass && <span className="record-meta">{session.class?.subject?.name ?? session.temporary_class?.subject?.name}</span>}
        <span>{formatDateTime(session.current_start_at)}</span>
        <span className="session-labels">
          {session.session_type === 'extra' && <span className="session-type-label">额外补课</span>}
          {session.session_type === 'temporary' && <span className="session-type-label">临时班</span>}
          <span className={`session-status status-${session.status}`}>{statusLabels[session.status]}</span>
          {attendanceSummary && <span className={`attendance-label ${attendanceSummary.total > 0 && attendanceSummary.signed === attendanceSummary.total ? 'attendance-present' : 'attendance-absent'}`}>已签到 {attendanceSummary.signed}/{attendanceSummary.total}</span>}
        </span>
      </span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  )
}
