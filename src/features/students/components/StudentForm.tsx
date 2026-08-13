import { useState, type FormEvent } from 'react'
import type { StudentInput } from '../../../types/domain'

interface StudentFormProps {
  initialValue?: StudentInput
  submitLabel: string
  isSubmitting: boolean
  error?: string
  onSubmit: (input: StudentInput) => Promise<void>
}

const emptyStudent: StudentInput = { name: '', school_class: '', phone: '' }

export function StudentForm({ initialValue = emptyStudent, submitLabel, isSubmitting, error, onSubmit }: StudentFormProps) {
  const [form, setForm] = useState(initialValue)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await onSubmit(form)
    } catch {
      // The parent displays the mutation error.
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label className="field">
        <span>姓名</span>
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          autoFocus
          required
          maxLength={100}
        />
      </label>
      <label className="field">
        <span>学校班级</span>
        <input
          value={form.school_class}
          onChange={(event) => setForm({ ...form, school_class: event.target.value })}
          required
          maxLength={100}
          placeholder="例如：高一商仁"
        />
      </label>
      <label className="field">
        <span>联系电话</span>
        <input
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          required
          maxLength={50}
          inputMode="tel"
          autoComplete="tel"
          placeholder="例如：012-3456789"
        />
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
