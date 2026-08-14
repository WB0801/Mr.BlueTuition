import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { formatDateTime, formatSessionTimeRange } from '../../../utils/format'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import { AttendanceRoster } from '../../attendance/components/AttendanceRoster'
import { CrossClassGuestPanel } from '../../attendance/components/CrossClassGuestPanel'
import { getSession, listSessionChanges, restoreSession, stopSession } from '../api/scheduleService'
import { RescheduleSessionForm } from '../components/RescheduleSessionForm'
import { canRestoreSession, canStopSession } from '../scheduleActions'

const statusLabels = {
  scheduled: '已安排',
  cancelled: '停课',
  completed: '已完成',
} as const

export function SessionDetailPage() {
  const { sessionId = '' } = useParams()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
  })
  const changes = useQuery({
    queryKey: ['session', sessionId, 'changes'],
    queryFn: () => listSessionChanges(sessionId),
  })
  const roster = useQuery({
    queryKey: ['attendance', sessionId, 'roster'],
    queryFn: () => getSessionRoster(sessionId),
  })
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

  const data = session.data
  const wasRescheduled = data.original_start_at !== data.current_start_at || data.original_end_at !== data.current_end_at
  const hasValidAttendance = roster.data?.some((entry) => entry.attendance_record_id) ?? false

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
    <section>
      <PageHeader title={data.class?.name ?? data.temporary_class?.name ?? '课程详情'} backTo="/attendance" backLabel="点名" />
      <div className="detail-title-row compact-title-row">
        <p className="eyebrow">{data.class?.subject?.name ?? data.temporary_class?.subject?.name}</p>
        <span className={`session-status status-${data.status}`}>{statusLabels[data.status]}</span>
      </div>
      <dl className="details-card">
        <div><dt>目前时间</dt><dd>{formatSessionTimeRange(data.current_start_at, data.current_end_at)}</dd></div>
        {wasRescheduled && <div><dt>原定时间</dt><dd>{formatSessionTimeRange(data.original_start_at, data.original_end_at)}</dd></div>}
        <div><dt>课程类型</dt><dd>{data.session_type === 'temporary' ? '临时班' : data.session_type === 'extra' ? '额外补课' : '常态课程'}</dd></div>
      </dl>

      {changes.isError && <ErrorBlock message="改期历史载入失败。" />}
      {(changes.data?.length ?? 0) > 0 && (
        <details className="history-panel">
          <summary>查看改期历史（{changes.data?.length}）</summary>
          <div className="schedule-change-list">
            {changes.data?.map((change, index) => (
              <div key={change.id}>
                <strong>第 {index + 1} 次改期</strong>
                <span>{formatDateTime(change.old_start_at)} → {formatDateTime(change.new_start_at)}</span>
                <small>操作于 {formatDateTime(change.changed_at)}</small>
              </div>
            ))}
          </div>
        </details>
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
            <p className="muted">停课后不会出现在当天需要点名的课程中，历史仍会保留。</p>
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
          <div>
            <strong>恢复这堂课程</strong>
            <p>恢复后使用原来的 Session 与目前课程时间，并重新出现在正常课程列表。</p>
          </div>
          <button className="button button-primary" type="button" onClick={handleRestore} disabled={restoreMutation.isPending}>
            {restoreMutation.isPending ? '处理中…' : '恢复上课'}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      )}

      <section className="content-section attendance-section">
        <h2>学生点名</h2>
        {roster.isLoading && <LoadingBlock />}
        {roster.isError && <ErrorBlock message="点名名单载入失败，请重试。" />}
        {roster.data && <AttendanceRoster session={data} entries={roster.data} />}
      </section>

      {data.status === 'scheduled' && data.session_type !== 'temporary' && (
        <details className="action-panel">
          <summary>添加跨班补课学生</summary>
          <CrossClassGuestPanel sessionId={data.id} />
        </details>
      )}
      {data.class && <Link className="text-link" to={`/classes/${data.class.id}`}>查看班级</Link>}
      {data.temporary_class && <Link className="text-link" to={`/temporary-classes/${data.temporary_class.id}`}>查看临时班</Link>}
    </section>
  )
}
