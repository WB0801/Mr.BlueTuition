import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'
import { endEnrollment } from '../api/enrollmentsService'

interface EndEnrollmentActionProps {
  enrollmentId: string
  studentName: string
  onSuccess?: () => void
}

export function EndEnrollmentAction({ enrollmentId, studentName, onSuccess }: EndEnrollmentActionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [endDate, setEndDate] = useState(todayInMalaysia())
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => endEnrollment(enrollmentId, endDate),
    onSuccess: async () => {
      setIsOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      onSuccess?.()
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '结束报读失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(`确定结束 ${studentName} 的这段报读吗？历史资料会保留。`)) return
    setError('')
    try {
      await mutation.mutateAsync()
    } catch {
      // Error is displayed by the mutation callback.
    }
  }

  if (!isOpen) {
    return (
      <button className="button button-secondary button-small" type="button" onClick={() => setIsOpen(true)}>
        结束报读
      </button>
    )
  }

  return (
    <form className="inline-action-form" onSubmit={handleSubmit}>
      <label className="field field-small">
        <span>结束日期</span>
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="inline-actions">
        <button className="button button-danger button-small" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '处理中…' : '确认结束'}
        </button>
        <button className="button button-text button-small" type="button" onClick={() => setIsOpen(false)}>取消</button>
      </div>
    </form>
  )
}
