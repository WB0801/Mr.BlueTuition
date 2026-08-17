import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TuitionClass } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'
import { createEnrollment } from '../api/enrollmentsService'

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
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => createEnrollment(studentId, classId, joinDate),
    onSuccess: async () => {
      setClassId('')
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      onSuccess?.()
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增报读失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      await mutation.mutateAsync()
    } catch {
      // Error is displayed by the mutation callback.
    }
  }

  if (availableClasses.length === 0) {
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
      <button className="button button-primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '加入中…' : '加入班级'}
      </button>
    </form>
  )
}
