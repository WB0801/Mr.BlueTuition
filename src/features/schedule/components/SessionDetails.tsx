import { useEffect, useState } from 'react'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { formatDateTime, formatSessionTimeRange, toMalaysiaDateInput, todayInMalaysia } from '../../../utils/format'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import { AttendanceRoster } from '../../attendance/components/AttendanceRoster'
import { CrossClassGuestPanel } from '../../attendance/components/CrossClassGuestPanel'
import { getSession, listSessionChanges, restoreSession, stopSession } from '../api/scheduleService'
import { RescheduleSessionForm } from './RescheduleSessionForm'
import { canRestoreSession, canStopSession } from '../scheduleActions'

const statusLabels = {
  scheduled: '已安排',
  cancelled: '停课',
  completed: '已完成',
} as const

// A notice belongs to this mounted, active roster only. Consume router state
// immediately so list/panel navigation and browser history cannot replay it.
function SignatureSuccessNotice({ sessionId }: { sessionId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { signatureSaved?: boolean; signedSessionId?: string; signedStudentName?: string } | null
  const [name] = useState(() => state?.signatureSaved && state.signedSessionId === sessionId ? state.signedStudentName ?? '学生' : null)
  useEffect(() => {
    if (!state?.signatureSaved) return
    const next = { ...state }
    delete next.signatureSaved
    delete next.signedSessionId
    delete next.signedStudentName
    navigate(location.pathname + location.search, { replace: true, state: next })
  }, [state, navigate, location.pathname, location.search])
  return name ? <p className="form-success signature-success" role="status">{name}的签名已保存。请选择下一位学生。</p> : null
}

export function SessionDetails({ sessionId, scope, prefix = '', active = true }: { sessionId: string; scope?: { studentId?: string; classId?: string }; prefix?: string; active?: boolean }) {
  const { get, set } = useRecordParams(prefix)
  const [params] = useSearchParams()
  const sectionParam = prefix ? `${prefix}.${sessionId}.section` : 'section'
  const managementActive = params.get(sectionParam) === 'management'
  const rosterFilter = get('roster', 'all')
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const session = useQuery({ queryKey: ['session', sessionId], queryFn: () => getSession(sessionId), enabled: active })
  const changes = useQuery({ queryKey: ['session', sessionId, 'changes'], queryFn: () => listSessionChanges(sessionId), enabled: active && managementActive && (!scope?.classId || session.data?.class_id === scope.classId) })
  const roster = useQuery({ queryKey: ['attendance', sessionId, 'roster'], queryFn: () => getSessionRoster(sessionId), enabled: active && (!scope?.classId || session.data?.class_id === scope.classId) })
  const stopMutation = useMutation({
    mutationFn: () => stopSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '停课失败，请重试。')),
  })
  const restoreMutation = useMutation({
    mutationFn: () => restoreSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '恢复上课失败，请重试。')),
  })

  if (session.isLoading) return <LoadingBlock />
  if (session.isError || !session.data) return <ErrorBlock message="找不到这堂课程，或资料载入失败。" />

  if (scope?.classId && session.data.class_id !== scope.classId) return <ErrorBlock message="这堂课程不属于当前资料范围。" />
  if (scope?.studentId && roster.isLoading) return <LoadingBlock />
  if (scope?.studentId && roster.isError) return <ErrorBlock message="点名名单载入失败，无法确认学生范围。" />
  if (scope?.studentId && !roster.data?.some(entry => entry.student_id === scope.studentId)) return <ErrorBlock message="这堂课程不属于当前资料范围。" />
  const data = session.data
  const wasRescheduled = data.original_start_at !== data.current_start_at || data.original_end_at !== data.current_end_at
  const signedCount = roster.data?.filter((entry) => entry.attendance_record_id).length ?? 0
  const hasValidAttendance = signedCount > 0
  const className = data.class?.name ?? data.temporary_class?.name ?? '课程详情'
  const subjectName = data.class?.subject?.name ?? data.temporary_class?.subject?.name
  const visibleRoster = (roster.data ?? []).filter((entry) => rosterFilter === 'signed' ? Boolean(entry.attendance_record_id) : rosterFilter === 'unsigned' ? !entry.attendance_record_id : true)

  async function handleStop() {
    if (!window.confirm('确定将这堂课程标记为停课？课程不会删除，并会保留在历史中。')) return
    setError('')
    try { await stopMutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  async function handleRestore() {
    setError('')
    try { await restoreMutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  return (
    <section className="session-detail-page">
      {prefix ? <h3>{className}</h3> : <PageHeader title={className} backTo="/attendance" backLabel="课程" />}
      <div className="detail-title-row compact-title-row">
        <p className="eyebrow">{subjectName}</p>
        <span className={`session-status status-${data.status}`}>{statusLabels[data.status]}</span>
      </div>
      {active && <SignatureSuccessNotice key={sessionId} sessionId={sessionId} />}
      <dl className="details-card details-grid session-overview">
        <div><dt>日期与时间</dt><dd>{formatSessionTimeRange(data.current_start_at, data.current_end_at)}</dd></div>
        <div><dt>课程类型</dt><dd>{data.session_type === 'temporary' ? '临时班' : data.session_type === 'extra' ? '额外补课' : '常态课程'}</dd></div>
        {wasRescheduled && <div><dt>原定时间</dt><dd>{formatSessionTimeRange(data.original_start_at, data.original_end_at)}</dd></div>}
      </dl>
      {!prefix && <nav className="related-nav" aria-label="课程相关资料">
        <ContextLink backLabel="课程" to={`/attendance${data.class ? `?classId=${data.class.id}` : ''}`}>其他课程</ContextLink>
        {data.class && <ContextLink backLabel="课程" to={`/classes/${data.class.id}`}>班级详情</ContextLink>}
        {data.class && <ContextLink backLabel="课程" to={`/classes/${data.class.id}/sessions`}>本班课程</ContextLink>}
        {data.temporary_class && <ContextLink backLabel="课程" to={`/temporary-classes/${data.temporary_class.id}`}>临时班详情</ContextLink>}
      </nav>}

      <ContextDataWorkspace label="课程功能" defaultPanel="roster" panelParam={sectionParam} sections={[
      { id: 'roster', label: '当前名单', render: () => <section className="content-section attendance-section">
        <div className="section-heading-row">
          <h2>学生点名</h2>
          <span className="attendance-progress">{signedCount} / {roster.data?.length ?? 0} 已签到</span>
        </div>
        <div className="segmented-control roster-filter" aria-label="点名名单筛选">
          {(['all', 'unsigned', 'signed'] as const).map((filter) => <button type="button" key={filter} className={rosterFilter === filter ? 'active' : ''} aria-pressed={rosterFilter === filter} onClick={() => {
            set('roster', filter === 'all' ? '' : filter)
          }}>{filter === 'all' ? '全部' : filter === 'signed' ? `已签到 ${signedCount}` : `${toMalaysiaDateInput(data.current_start_at) > todayInMalaysia() ? '待签到' : '未签到'} ${(roster.data?.length ?? 0) - signedCount}`}</button>)}
        </div>
        {roster.isLoading && <LoadingBlock />}
        {roster.isError && <ErrorBlock message="点名名单载入失败，请重试。" />}
        {roster.data && (visibleRoster.length === 0 && roster.data.length > 0
          ? <EmptyBlock message={rosterFilter === 'signed' ? '还没有学生签到。' : '所有学生均已签到。'} />
          : <AttendanceRoster session={data} entries={visibleRoster} />)}
      </section> },
      ...(data.status === 'scheduled' && data.session_type !== 'temporary' ? [{ id: 'guests', label: '添加跨班补课学生', render: (selected: boolean) => <><h2>添加跨班补课学生</h2><CrossClassGuestPanel sessionId={data.id} active={active && selected} /></> }] : []),
      { id: 'management', label: '课程管理与历史', render: () => <section className="management-panel">
        <h2>课程管理与历史</h2>
        {changes.isLoading && <LoadingBlock />}
        {changes.isError && <ErrorBlock message="改期历史载入失败。" />}
        {(changes.data?.length ?? 0) > 0 && (
          <div className="schedule-change-list">
            {changes.data?.map((change, index) => (
              <div key={change.id}>
                <strong>第 {index + 1} 次改期</strong>
                <span>{formatDateTime(change.old_start_at)} → {formatDateTime(change.new_start_at)}</span>
                <small>操作于 {formatDateTime(change.changed_at)}</small>
              </div>
            ))}
          </div>
        )}

        {canStopSession(data.status) && !hasValidAttendance && (
          <div className="schedule-actions-grid">
            {data.session_type !== 'temporary' && (
              <details className="action-panel">
                <summary>只修改这一次</summary>
                <RescheduleSessionForm session={data} />
              </details>
            )}
            <details className="danger-panel session-cancel-panel">
              <summary>单堂停课</summary>
              <p className="muted">课程不会删除，并会保留在历史中。</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-danger" type="button" onClick={handleStop} disabled={stopMutation.isPending}>
                {stopMutation.isPending ? '处理中…' : '确认停课'}
              </button>
            </details>
          </div>
        )}

        {hasValidAttendance && data.status === 'scheduled' && (
          <p className="notice">这堂课程已有有效签到，为保护签名事实，不能再改期或停课。</p>
        )}

        {canRestoreSession(data.status, data.class?.status ?? data.temporary_class?.status) && (
          <div className="restore-session-panel">
            <div><strong>恢复这堂课程</strong><p>恢复后沿用目前课程时间。</p></div>
            <button className="button button-primary" type="button" onClick={handleRestore} disabled={restoreMutation.isPending}>
              {restoreMutation.isPending ? '处理中…' : '恢复上课'}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        )}
      </section> },
      ]} />
    </section>
  )
}
