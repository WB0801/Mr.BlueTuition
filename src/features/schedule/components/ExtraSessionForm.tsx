import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage } from '../../../utils/errors'
import { malaysiaDateTime, todayInMalaysia } from '../../../utils/format'
import { createExtraSession } from '../api/scheduleService'

interface ExtraSessionFormProps {
  classId: string
  defaultStartTime: string
  defaultEndTime: string
}

export function ExtraSessionForm({ classId, defaultStartTime, defaultEndTime }: ExtraSessionFormProps) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInMalaysia)
  const [startTime, setStartTime] = useState(defaultStartTime.slice(0, 5))
  const [endTime, setEndTime] = useState(defaultEndTime.slice(0, 5))
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const mutation = useMutation({
    mutationFn: () => createExtraSession(
      classId,
      malaysiaDateTime(date, startTime),
      malaysiaDateTime(date, endTime),
    ),
    onSuccess: async () => {
      setSuccess('额外补课已加入课程列表。')
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增额外补课失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (endTime <= startTime) {
      setError('结束时间必须晚于开始时间。')
      return
    }
    setError('')
    setSuccess('')
    try { await mutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  return (
    <form className="compact-form" onSubmit={handleSubmit}>
      <p className="muted compact-copy">额外补课不会改变固定课表，也不会产生额外月费。</p>
      <div className="form-grid form-grid-three">
        <label className="field">
          <span>日期</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="field">
          <span>开始时间</span>
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
        <label className="field">
          <span>结束时间</span>
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <button className="button button-primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '新增中…' : '新增额外补课'}
      </button>
    </form>
  )
}
