import { ContextLink } from '../../../components/navigation/ContextLink'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { formatDateTime, toMalaysiaDateInput, todayInMalaysia } from '../../../utils/format'

interface SessionCardProps {
  session: ClassSessionWithClass
  showClass?: boolean
  attendanceSummary?: { signed: number; total: number }
  studentAttendance?: SessionRosterEntry | null
}
const statusLabels = {
  scheduled: '已安排',
  cancelled: '停课',
  completed: '已完成',
} as const

export function SessionCard({ session, showClass = false, attendanceSummary, studentAttendance }: SessionCardProps) {
  const studentStatus = studentAttendance === undefined ? null : getStudentStatus(session, studentAttendance)
  return (
    <ContextLink backLabel="课程" className={`record-card session-card ${session.status === 'cancelled' ? 'cancelled-session' : ''}`} to={`/attendance/session/${session.id}`}>
      <span className="record-main">
        {showClass && <strong>{session.class?.name ?? session.temporary_class?.name ?? '未知班级'}</strong>}
        {showClass && <span className="record-meta">{session.class?.subject?.name ?? session.temporary_class?.subject?.name}</span>}
        <span>{formatDateTime(session.current_start_at)}</span>
        <span className="session-labels">
          {session.session_type === 'extra' && <span className="session-type-label">额外补课</span>}
          {session.session_type === 'temporary' && <span className="session-type-label">临时班</span>}
          {studentStatus && <span className={`attendance-label ${studentStatus.tone}`}>{studentStatus.label}</span>}
          {studentAttendance?.participation_type === 'makeup' && <span className="session-type-label">跨班补课</span>}
          {studentAttendance?.participation_type === 'extra' && <span className="session-type-label">额外参加</span>}
          {(session.status === 'cancelled' || !studentStatus) && <span className={`session-status status-${session.status}`}>{statusLabels[session.status]}</span>}
          {attendanceSummary && !studentStatus && <span className={`attendance-label ${attendanceSummary.total > 0 && attendanceSummary.signed === attendanceSummary.total ? 'attendance-present' : 'attendance-absent'}`}>全班已签到 {attendanceSummary.signed}/{attendanceSummary.total}</span>}
        </span>
      </span>
      <span className="chevron" aria-hidden="true">›</span>
    </ContextLink>
  )
}

function getStudentStatus(session: ClassSessionWithClass, entry: SessionRosterEntry | null) {
  if (!entry) return { label: '正在核对出席…', tone: 'attendance-pending' }
  if (session.status === 'cancelled') return { label: '停课，不计缺席', tone: 'attendance-pending' }
  if (entry.attendance_record_id) return {
    label: entry.signing_type === 'backfill' ? '已补签' : '已签到',
    tone: 'attendance-present',
  }
  const date = toMalaysiaDateInput(session.current_start_at)
  const today = todayInMalaysia()
  if (date < today) return entry.made_up_session_id && entry.made_up_at
    ? { label: '缺席 · 已补课', tone: 'attendance-made-up' }
    : { label: '缺席', tone: 'attendance-absent' }
  return date > today
    ? { label: '尚未点名', tone: 'attendance-pending' }
    : { label: '尚未签到', tone: 'attendance-pending' }
}
