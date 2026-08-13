import { Link } from 'react-router-dom'
import type { ClassSessionWithClass } from '../../../types/domain'
import { formatDateTime } from '../../../utils/format'

interface SessionCardProps {
  session: ClassSessionWithClass
  showClass?: boolean
}
const statusLabels = {
  scheduled: '已安排',
  cancelled: '停课',
  completed: '已完成',
} as const

export function SessionCard({ session, showClass = false }: SessionCardProps) {
  return (
    <Link className={`record-card session-card ${session.status === 'cancelled' ? 'cancelled-session' : ''}`} to={`/attendance/session/${session.id}`}>
      <span className="record-main">
        {showClass && <strong>{session.class?.name ?? '未知班级'}</strong>}
        <span>{formatDateTime(session.current_start_at)}</span>
        <span className="session-labels">
          {session.session_type === 'extra' && <span className="session-type-label">额外补课</span>}
          <span className={`session-status status-${session.status}`}>{statusLabels[session.status]}</span>
        </span>
      </span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  )
}
