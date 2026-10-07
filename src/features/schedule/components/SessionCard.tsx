import { ContextLink } from '../../../components/navigation/ContextLink'
import { SignaturePreviewButton } from '../../attendance/components/SignaturePreviewButton'
import { hasSignaturePreview } from '../../attendance/api/signaturePreviewService'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { formatDate, formatDateTime, toMalaysiaDateInput, toMalaysiaTimeInput, todayInMalaysia } from '../../../utils/format'

interface SessionCardProps {
  session: ClassSessionWithClass
  showClass?: boolean
  attendanceSummary?: { signed: number; total: number }
  studentAttendance?: SessionRosterEntry | null
  onSelect?: (sessionId: string) => void
}
const statusLabels = {
  scheduled: '已安排',
  cancelled: '停课',
  completed: '已完成',
} as const

export function SessionCard({ session, showClass = false, attendanceSummary, studentAttendance, onSelect }: SessionCardProps) {
  const studentStatus = studentAttendance === undefined ? null : getStudentStatus(session, studentAttendance)
  const date = toMalaysiaDateInput(session.current_start_at)
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'short' }).format(new Date(session.current_start_at))
  const preview = hasSignaturePreview(session, studentAttendance)
  const status = <span className="session-attendance">
    {studentStatus && <span key={studentStatus.label} className={`attendance-label ${studentStatus.tone}`}>{studentStatus.label}</span>}
    {(session.status === 'cancelled' || !studentStatus) && <span className={`session-status status-${session.status}`}>{statusLabels[session.status]}</span>}
    {attendanceSummary && !studentStatus && <span className={`attendance-label ${attendanceSummary.total > 0 && attendanceSummary.signed === attendanceSummary.total ? 'attendance-present' : 'attendance-absent'}`}>全班已签到 {attendanceSummary.signed}/{attendanceSummary.total}</span>}
  </span>
  const content = <>
      <time className="session-date" dateTime={session.current_start_at} aria-label={formatDateTime(session.current_start_at)}>
        <strong>{Number(date.slice(-2))}</strong><small>{weekday}</small>
      </time>
      <span className="record-main session-course">
        {!showClass && <strong>{formatDate(date)}</strong>}
        {showClass && <strong>{session.class?.name ?? session.temporary_class?.name ?? '未知班级'}</strong>}
        {showClass && <span className="record-meta">{session.class?.subject?.name ?? session.temporary_class?.subject?.name}</span>}
        <span className="record-meta">{showClass && `${formatDate(date)} · `}{toMalaysiaTimeInput(session.current_start_at)}{session.current_end_at && ` – ${toMalaysiaTimeInput(session.current_end_at)}`}</span>
        <span className="session-labels">
          {session.session_type === 'extra' && <span className="session-type-label">额外补课</span>}
          {session.session_type === 'temporary' && <span className="session-type-label">临时班</span>}
          {studentAttendance?.participation_type === 'makeup' && <span className="session-type-label">跨班补课</span>}
          {studentAttendance?.participation_type === 'extra' && <span className="session-type-label">额外参加</span>}
        </span>
      </span>
      {!preview && status}
      <span className="chevron" aria-hidden="true">›</span>
    </>
  const className = `record-card session-card ${session.status === 'cancelled' ? 'cancelled-session' : ''}`
  if (preview && studentAttendance) return <article className="session-preview-row">
    {onSelect ? <button className={`${className} session-preview-course`} type="button" data-context-record={session.id} onClick={() => onSelect(session.id)}>{content}</button>
      : <ContextLink backLabel="课程" className={`${className} session-preview-course`} to={`/attendance/session/${session.id}`}>{content}</ContextLink>}
    <div className="session-preview-actions">{status}<SignaturePreviewButton session={session} entry={studentAttendance} /></div>
  </article>
  return onSelect ? <button className={className} type="button" data-context-record={session.id} onClick={() => onSelect(session.id)}>{content}</button>
    : <ContextLink backLabel="课程" className={className} to={`/attendance/session/${session.id}`}>{content}</ContextLink>
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
