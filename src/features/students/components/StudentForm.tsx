import { useState, type FormEvent } from 'react'
import { ContextLink } from '../../../components/navigation/ContextLink'
import type { StudentInput } from '../../../types/domain'
import type { DuplicateStudentWarning } from '../api/studentsService'

interface StudentFormProps {
  initialValue?: StudentInput
  submitLabel: string
  isSubmitting: boolean
  error?: string
  duplicateStudents?: DuplicateStudentWarning[]
  duplicateCheckPending?: boolean
  onInputChange?: (input: StudentInput) => void
  onSubmit: (input: StudentInput) => Promise<void>
}

const emptyStudent: StudentInput = { name: '', school_class: '', phone: '' }

export function StudentForm({
  initialValue = emptyStudent,
  submitLabel,
  isSubmitting,
  error,
  duplicateStudents = [],
  duplicateCheckPending = false,
  onInputChange,
  onSubmit,
}: StudentFormProps) {
  const [form, setForm] = useState(initialValue)
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false)

  const updateForm = (next: StudentInput) => {
    setConfirmedDuplicate(false)
    setForm(next)
    onInputChange?.(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await onSubmit(form)
    } catch {
      // The parent displays the mutation error.
    }
  }

  return (
    <form className="form-card student-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>姓名</span>
        <input
          value={form.name}
          onChange={(event) => updateForm({ ...form, name: event.target.value })}
          autoFocus
          required
          maxLength={100}
        />
      </label>
      <label className="field">
        <span>学校班级 <small className="optional-label">选填</small></span>
        <input
          value={form.school_class}
          onChange={(event) => updateForm({ ...form, school_class: event.target.value })}
          maxLength={100}
          placeholder="例如：高一商仁"
        />
      </label>
      <label className="field">
        <span>联系电话 <small className="optional-label">选填</small></span>
        <input
          value={form.phone}
          onChange={(event) => updateForm({ ...form, phone: event.target.value })}
          maxLength={50}
          inputMode="tel"
          autoComplete="tel"
          placeholder="例如：012-3456789"
        />
      </label>
      {duplicateCheckPending && <p className="settings-note" aria-live="polite">正在检查可能重复的学生…</p>}
      {duplicateStudents.length > 0 && (
        <section className="duplicate-warning" aria-label="可能重复的学生">
          <h2>可能已有相同学生</h2>
          <div className="duplicate-student-list">
            {duplicateStudents.map((student) => (
              <div key={student.id}>
                <span><strong>{student.name}</strong><small>{student.school_class || '未填写学校班级'} · {student.phone || '未填写电话'}</small></span>
                <span><small>{student.reasons.join('、')}</small><ContextLink backLabel="新增学生" to={`/students/${student.id}`}>查看现有资料</ContextLink></span>
              </div>
            ))}
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={confirmedDuplicate} onChange={(event) => setConfirmedDuplicate(event.target.checked)} />
            <span>这些可能是不同学生，我确认仍然建立</span>
          </label>
        </section>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting || duplicateCheckPending || (duplicateStudents.length > 0 && !confirmedDuplicate)}>
          {isSubmitting ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
