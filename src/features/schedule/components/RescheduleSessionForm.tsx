import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ClassSession } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import {
  malaysiaDateTime,
  toMalaysiaDateInput,
  toMalaysiaTimeInput,
} from '../../../utils/format'
import { rescheduleSession } from '../api/scheduleService'

interface RescheduleSessionFormProps {
  session: ClassSession
}
export function RescheduleSessionForm({ session }: RescheduleSessionFormProps) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(toMalaysiaDateInput(session.current_start_at))
  const [startTime, setStartTime] = useState(toMalaysiaTimeInput(session.current_start_at))
  const [endTime, setEndTime] = useState(toMalaysiaTimeInput(session.current_end_at))
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => rescheduleSession(
      session.id,
      malaysiaDateTime(date, startTime),
      malaysiaDateTime(date, endTime),
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session', session.id] })
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '课程改期失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (endTime <= startTime) {
      setError('结束时间必须晚于开始时间。')
      return
    }
    setError('')
    try { await mutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  return (
    <form className="compact-form" onSubmit={handleSubmit}>
      <div className="form-grid form-grid-three">
        <label className="field">
          <span>新日期</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="field">
          <span>开始时间</span>
          <input type="time" lang="en-GB" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
        <label className="field">
          <span>结束时间</span>
          <input type="time" lang="en-GB" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '保存中…' : '确认改期'}
      </button>
    </form>
  )
}
