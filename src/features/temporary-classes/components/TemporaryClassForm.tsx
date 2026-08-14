import { useState, type FormEvent } from 'react'
import type { Subject, TemporaryClassInput } from '../../../types/domain'

interface TemporaryClassFormProps {
  subjects: Subject[]
  initialValue: TemporaryClassInput
  submitLabel: string
  isSubmitting: boolean
  error?: string
  onSubmit: (input: TemporaryClassInput) => Promise<void>
}

export function TemporaryClassForm({
  subjects,
  initialValue,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
}: TemporaryClassFormProps) {
  const [form, setForm] = useState(initialValue)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { await onSubmit(form) } catch { /* parent displays mutation error */ }
  }

  return (
    <form className="form-card temporary-class-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>临时班名称</span>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={150} autoFocus />
      </label>
      <label className="field">
        <span>科目</span>
        <select value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required>
          <option value="">请选择科目</option>
          {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      <div className="temporary-class-time-grid">
        <label className="field temporary-class-date-field">
          <span>日期</span>
          <input type="date" value={form.class_date} onChange={(event) => setForm({ ...form, class_date: event.target.value })} required />
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
      <label className="field">
        <span>一次性收费（RM）</span>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={form.fee_amount} onChange={(event) => setForm({ ...form, fee_amount: Number(event.target.value) })} required />
        <small className="field-hint">修改收费只影响之后加入的学生，已有报名收费保留原快照。</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
