import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ClassScheduleRule, ScheduleChangeInput } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { addCalendarDays, todayInMalaysia, weekdayLabels } from '../../../utils/format'
import { changeClassSchedule, previewScheduleChange } from '../api/scheduleService'
import { getScheduleChangeConfirmationMessage } from '../scheduleActions'

interface ScheduleChangeFormProps {
  classId: string
  currentRule: ClassScheduleRule
}

export function ScheduleChangeForm({ classId, currentRule }: ScheduleChangeFormProps) {
  const queryClient = useQueryClient()
  const [today] = useState(todayInMalaysia)
  const earliestDate = [
    addCalendarDays(today, 1),
    addCalendarDays(currentRule.effective_from, 1),
  ].sort().at(-1)!
  const [form, setForm] = useState<ScheduleChangeInput>({
    weekday: currentRule.weekday,
    start_time: currentRule.start_time.slice(0, 5),
    end_time: currentRule.end_time.slice(0, 5),
    effective_from: earliestDate,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const mutation = useMutation({
    mutationFn: (input: ScheduleChangeInput) => changeClassSchedule(classId, currentRule.id, input),
    onSuccess: async () => {
      setSuccess('未来固定课表已更新。')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['class', classId] }),
        queryClient.invalidateQueries({ queryKey: ['classes'] }),
        queryClient.invalidateQueries({ queryKey: ['schedule-rules', classId] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
      ])
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '固定课表修改失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (form.end_time <= form.start_time) {
      setError('结束时间必须晚于开始时间。')
      return
    }

    setError('')
    setSuccess('')
    try {
      const preview = await previewScheduleChange(classId, currentRule.id, form.effective_from)
      if (!window.confirm(getScheduleChangeConfirmationMessage(preview))) return
      await mutation.mutateAsync(form)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '无法检查或修改未来课表，请重试。'))
    }
  }

  return (
    <form className="compact-form" onSubmit={handleSubmit}>
      <p className="muted compact-copy">旧课表会保留为历史；已停课及已人工改期的课程不会被覆盖。</p>
      <div className="form-grid form-grid-three">
        <label className="field">
          <span>新固定星期</span>
          <select value={form.weekday} onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })} required>
            {Object.entries(weekdayLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>开始时间</span>
          <input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} required />
        </label>
        <label className="field">
          <span>结束时间</span>
          <input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} required />
        </label>
      </div>
      <label className="field field-small">
        <span>生效日期</span>
        <input type="date" min={earliestDate} value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} required />
        <small className="field-hint">从这天起采用新课表。</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <button className="button button-primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '处理中…' : '检查影响并修改'}
      </button>
    </form>
  )
}
