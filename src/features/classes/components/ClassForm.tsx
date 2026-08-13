import { useState, type FormEvent } from 'react'
import type { ClassInput, Subject } from '../../../types/domain'

interface ClassFormProps {
  subjects: Subject[]
  initialValue: ClassInput
  submitLabel: string
  isSubmitting: boolean
  isEditing?: boolean
  error?: string
  onSubmit: (input: ClassInput) => Promise<void>
}

export function ClassForm({ subjects, initialValue, submitLabel, isSubmitting, isEditing = false, error, onSubmit }: ClassFormProps) {
  const [form, setForm] = useState(initialValue)
  const [validationError, setValidationError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isEditing && form.end_time <= form.start_time) {
      setValidationError('结束时间必须晚于开始时间。')
      return
    }
    setValidationError('')
    try {
      await onSubmit(form)
    } catch {
      // The parent displays the mutation error.
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label className="field">
        <span>班级名称</span>
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
          maxLength={120}
          autoFocus
          placeholder="例如：高一会计学（1）"
        />
      </label>
      <label className="field">
        <span>科目</span>
        <select value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required>
          <option value="">请选择科目</option>
          {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      {isEditing ? (
        <p className="notice inline-notice">固定星期与时间请回到班级页面，使用“修改未来固定课表”，以保留课表历史。</p>
      ) : (
        <div className="form-grid form-grid-three">
          <label className="field">
            <span>固定星期</span>
            <select value={form.weekday} onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })} required>
              <option value={1}>星期一</option>
              <option value={2}>星期二</option>
              <option value={3}>星期三</option>
              <option value={4}>星期四</option>
              <option value={5}>星期五</option>
              <option value={6}>星期六</option>
              <option value={7}>星期日</option>
            </select>
          </label>
          <label className="field">
            <span>开始时间</span>
            <input type="time" lang="en-GB" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} required />
          </label>
          <label className="field">
            <span>结束时间</span>
            <input type="time" lang="en-GB" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} required />
          </label>
        </div>
      )}
      <div className="form-grid">
        <label className="field">
          <span>每月学费（RM）</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.monthly_fee}
            onChange={(event) => setForm({ ...form, monthly_fee: Number(event.target.value) })}
            required
            inputMode="decimal"
          />
        </label>
        <label className="field">
          <span>开始日期</span>
          <input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} required />
        </label>
      </div>
      {(validationError || error) && <p className="form-error" role="alert">{validationError || error}</p>}
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
