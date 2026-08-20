import { ContextLink } from '../../../components/navigation/ContextLink'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { formatDateTime, toMalaysiaDateInput, todayInMalaysia } from '../../../utils/format'

interface AttendanceRosterProps {
  session: ClassSessionWithClass
  entries: SessionRosterEntry[]
}

const participationLabels = {
  regular: '',
  makeup: '跨班补课',
  extra: '额外参加',
} as const

export function AttendanceRoster({ session, entries }: AttendanceRosterProps) {
  const sessionDate = toMalaysiaDateInput(session.current_start_at)
  const isFuture = sessionDate > todayInMalaysia()

  if (session.status === 'cancelled') {
    return <div className="state-block">此课程已停课，不能点名，也不会产生缺席。</div>
  }

  if (entries.length === 0) {
    return <div className="state-block">这堂课程目前没有学生。</div>
  }

  return (
    <div className="attendance-roster">
      {entries.map((entry) => {
        const hasAttendance = Boolean(entry.attendance_record_id)
        return (
          <article className={`attendance-student-card ${hasAttendance ? 'is-signed' : 'is-unsigned'}`} key={`${entry.student_id}-${entry.participation_type}`}>
            <div className="attendance-student-main">
              <ContextLink backLabel="课程" className="attendance-student-link" to={`/students/${entry.student_id}`}>{entry.student_name}</ContextLink>
              <span>{[entry.school_class, entry.phone].filter(Boolean).join(' · ') || '未填写学校班级与电话'}</span>
              <div className="session-labels">
                {participationLabels[entry.participation_type] && (
                  <span className="session-type-label">{participationLabels[entry.participation_type]}</span>
                )}
                {hasAttendance ? (
                  <span className="attendance-label attendance-present">
                    {entry.signing_type === 'backfill' ? '已补签' : '已签到'}
                  </span>
                ) : (
                  <span className="attendance-label attendance-absent">{isFuture ? '待点名' : '未签到'}</span>
                )}
              </div>
              {!hasAttendance && entry.made_up_at && (
                <small className="makeup-complete-note">已于 {formatDateTime(entry.made_up_at)} 补课</small>
              )}
              {hasAttendance && entry.captured_at && (
                <small className="signed-time">签名时间：{formatDateTime(entry.captured_at)}</small>
              )}
              {hasAttendance && entry.capture_source === 'device_offline' && entry.synced_at && (
                <small className="offline-signature-note">离线签名 · 同步于 {formatDateTime(entry.synced_at)}</small>
              )}
            </div>
            {hasAttendance ? (
              <ContextLink
                backLabel="课程"
                className="button button-secondary button-small"
                to={`/attendance/session/${session.id}/record/${entry.attendance_record_id}`}
              >
                查看签名
              </ContextLink>
            ) : isFuture ? (
              <span className="future-attendance-note">尚未到课程日期</span>
            ) : (
              <ContextLink
                backLabel="课程"
                className="button button-primary attendance-sign-button"
                to={`/attendance/session/${session.id}/sign/${entry.student_id}`}
              >
                {sessionDate < todayInMalaysia() ? '补签' : '签名签到'}
              </ContextLink>
            )}
          </article>
        )
      })}
    </div>
  )
}
