import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate, formatTime, toMalaysiaTimeInput, todayInMalaysia } from '../../../utils/format'
import { listScheduledSessionsForDate, stopSessionsForDate } from '../api/scheduleService'
import { getAllDayStopConfirmationMessage } from '../scheduleActions'

export function AllDayStopPanel() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInMalaysia)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const sessions = useQuery({
    queryKey: ['sessions', 'stop-preview', date],
    queryFn: () => listScheduledSessionsForDate(date),
  })
  const stopMutation = useMutation({
    mutationFn: () => stopSessionsForDate(date),
    onSuccess: async (stoppedCount) => {
      setSuccess(`已将 ${stoppedCount} 堂课程标记为停课。`)
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '全日停课失败，请重试。')),
  })

  async function handleStopAll() {
    const count = sessions.data?.length ?? 0
    if (count === 0) return
    if (!window.confirm(getAllDayStopConfirmationMessage(formatDate(date), count))) return

    setError('')
    setSuccess('')
    try { await stopMutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  return (
    <div className="compact-form">
      <label className="field field-small">
        <span>停课日期</span>
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value)
            setError('')
            setSuccess('')
          }}
        />
      </label>
      <p className="muted compact-copy">以下是当天所有尚未停课的课程，不需要填写停课理由。</p>

      {sessions.isLoading && <LoadingBlock message="正在载入当天课程…" />}
      {sessions.isError && <ErrorBlock message="当天课程载入失败，请重试。" />}
      {!sessions.isLoading && !sessions.isError && sessions.data?.length === 0 && (
        <EmptyBlock message="当天没有需要停课的课程。" />
      )}
      <div className="all-day-session-list">
        {sessions.data?.map((session) => (
          <div className="all-day-session-row" key={session.id}>
            <span>
              <strong>{session.class?.name ?? '未知班级'}</strong>
              {session.session_type === 'extra' && <small>额外补课</small>}
            </span>
            <span>{formatTime(toMalaysiaTimeInput(session.current_start_at))} – {formatTime(toMalaysiaTimeInput(session.current_end_at))}</span>
          </div>
        ))}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <button
        className="button button-danger"
        type="button"
        disabled={stopMutation.isPending || sessions.isLoading || (sessions.data?.length ?? 0) === 0}
        onClick={handleStopAll}
      >
        {stopMutation.isPending ? '处理中…' : `将当天 ${sessions.data?.length ?? 0} 堂课程标记为停课`}
      </button>
    </div>
  )
}
