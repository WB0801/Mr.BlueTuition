import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate, todayInMalaysia } from '../../../utils/format'
import { createEnrollment } from '../api/enrollmentsService'
import { preparePwaFormSave } from '../../settings/pwa/updateProtection'

interface NewEnrollmentFormProps {
  studentId: string
  classes: TuitionClass[]
  excludedClassIds?: string[]
  onSuccess?: () => void
}

export function NewEnrollmentForm({ studentId, classes, excludedClassIds = [], onSuccess }: NewEnrollmentFormProps) {
  const availableClasses = classes.filter((item) => !excludedClassIds.includes(item.id))
  const [classId, setClassId] = useState('')
  const [joinDate, setJoinDate] = useState(todayInMalaysia())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { classId: string; joinDate: string; className: string }) => createEnrollment(studentId, input.classId, input.joinDate),
    onSuccess: async (_, input) => {
      setClassId(current => current === input.classId ? '' : current)
      setSuccess(`已加入${input.className} · ${formatDate(input.joinDate)}生效`)
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      onSuccess?.()
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增报读失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const classField = event.currentTarget.querySelector('select')!
    const acknowledgeSave = preparePwaFormSave(event.currentTarget)
    try {
      if (mutation.isPending) return
      setSuccess('')
      await mutation.mutateAsync({ classId, joinDate, className: classes.find(item => item.id === classId)?.name ?? '所选班级' })
      acknowledgeSave(new Map([[classField, '']]))
    } catch {
      // Error is displayed by the mutation callback.
    }
  }

  if (availableClasses.length === 0 && !success && !mutation.isPending) {
    return <p className="muted">目前没有可加入的进行中班级。</p>
  }

  return (
    <form className="compact-form enrollment-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>班级</span>
        <select value={classId} onChange={(event) => setClassId(event.target.value)} required>
          <option value="">请选择班级</option>
          {availableClasses.map((item) => (
            <option value={item.id} key={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>加入日期</span>
        <input type="date" value={joinDate} onChange={(event) => setJoinDate(event.target.value)} required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="notice inline-notice" role="status">{success}</p>}
      {availableClasses.length === 0 && <p className="muted">目前没有可加入的进行中班级。</p>}
      <button className="button button-primary" type="submit" disabled={mutation.isPending || availableClasses.length === 0}>
        {mutation.isPending ? '加入中…' : '加入班级'}
      </button>
    </form>
  )
}
