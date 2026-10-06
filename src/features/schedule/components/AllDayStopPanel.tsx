import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate, formatTime, toMalaysiaTimeInput, todayInMalaysia } from '../../../utils/format'
import { ensureSessionsForDate, listScheduledSessionsForDate, stopSessionsForDate } from '../api/scheduleService'
import { getAllDayStopConfirmationMessage } from '../scheduleActions'

export function AllDayStopPanel({ active = true }: { active?: boolean }) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInMalaysia)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const generation = useQuery({
    queryKey: ['context-session-generation', 'stop-preview', date],
    queryFn: async () => { await ensureSessionsForDate(date); return true },
    enabled: active,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const sessions = useQuery({
    queryKey: ['sessions', 'stop-preview', date],
    queryFn: () => listScheduledSessionsForDate(date, false),
    enabled: active && generation.isSuccess && !generation.isFetching,
    staleTime: 0,
  })
  const stopMutation = useMutation({
    mutationFn: () => stopSessionsForDate(date),
    onSuccess: async (stoppedCount) => {
      const protectedCount = sessions.data?.filter((session) => session.has_valid_attendance).length ?? 0
      setSuccess(`已停课 ${stoppedCount} 堂；因已有签到而保留 ${protectedCount} 堂。`)
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '全日停课失败，请重试。')),
  })

  async function handleStopAll() {
    const stoppableCount = sessions.data?.filter((session) => !session.has_valid_attendance).length ?? 0
    const protectedCount = sessions.data?.filter((session) => session.has_valid_attendance).length ?? 0
    if (!active || !generation.isSuccess || generation.isFetching || sessions.isFetching || sessions.isError || stoppableCount === 0) return
    if (!window.confirm(getAllDayStopConfirmationMessage(formatDate(date), stoppableCount, protectedCount))) return

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

      {(generation.isLoading || sessions.isFetching) && <LoadingBlock message="正在载入当天课程…" />}
      {generation.isError && <><ErrorBlock message="当天课程准备失败，请重试。" /><button type="button" className="button button-secondary" onClick={() => void generation.refetch()}>重试</button></>}
      {sessions.isError && <ErrorBlock message="当天课程载入失败，请重试。" />}
      {sessions.isError && <button type="button" className="button button-secondary" onClick={() => void sessions.refetch()}>重试</button>}
      {!sessions.isLoading && !sessions.isError && sessions.data?.length === 0 && (
        <EmptyBlock message="当天没有需要停课的课程。" />
      )}
      <div className="all-day-session-list">
        {sessions.data?.map((session) => (
          <div className={`all-day-session-row${session.has_valid_attendance ? ' protected-session-row' : ''}`} key={session.id}>
            <span>
              <strong>{session.class?.name ?? '未知班级'}</strong>
              {session.session_type === 'extra' && <small>额外补课</small>}
              <small>{session.has_valid_attendance ? '已有签到 · 保留上课' : '将停课'}</small>
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
        disabled={!active || stopMutation.isPending || !generation.isSuccess || generation.isFetching || sessions.isFetching || sessions.isError || !sessions.data?.some((session) => !session.has_valid_attendance)}
        onClick={handleStopAll}
      >
        {stopMutation.isPending
          ? '处理中…'
          : `停课 ${sessions.data?.filter((session) => !session.has_valid_attendance).length ?? 0} 堂 · 保留 ${sessions.data?.filter((session) => session.has_valid_attendance).length ?? 0} 堂`}
      </button>
    </div>
  )
}
