import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { StudentInput, TemporaryClassEnrollment } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { listStudents } from '../../students/api/studentsService'
import { StudentForm } from '../../students/components/StudentForm'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { addStudentToTemporaryClass, createStudentForTemporaryClass } from '../api/temporaryClassesService'

export function TemporaryClassRegistrationPanel({
  classId,
  enrollments,
}: {
  classId: string
  enrollments: TemporaryClassEnrollment[]
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const students = useQuery({
    queryKey: ['students', 'temporary-class-search', search],
    queryFn: () => listStudents(search),
    enabled: Boolean(search.trim()),
  })
  const refresh = async () => {
    setSearch('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['temporary-class', classId, 'enrollments'] }),
      queryClient.invalidateQueries({ queryKey: ['temporary-classes'] }),
      queryClient.invalidateQueries({ queryKey: ['students'] }),
      queryClient.invalidateQueries({ queryKey: ['attendance'] }),
    ])
  }
  const add = useMutation({
    mutationFn: (studentId: string) => addStudentToTemporaryClass(classId, studentId),
    onSuccess: refresh,
    onError: (caughtError) => setError(getErrorMessage(caughtError, '加入学生失败，请重试。')),
  })
  const create = useMutation({
    mutationFn: (input: StudentInput) => createStudentForTemporaryClass(classId, input),
    onSuccess: refresh,
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增学生并报名失败，请重试。')),
  })
  const enrolledIds = new Set(enrollments.map((item) => item.student_id))
  const candidates = (students.data ?? []).filter((student) => !enrolledIds.has(student.id))

  return (
    <details className="action-panel temporary-registration-panel">
      <summary>加入学生</summary>
      <label className="field">
        <span>搜索已有学生</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入姓名" />
      </label>
      {students.isLoading && <LoadingBlock message="正在搜索学生…" />}
      {students.isError && <ErrorBlock message="学生搜索失败。" />}
      {search.trim() && !students.isLoading && candidates.length === 0 && <EmptyBlock message="没有可加入的学生。" />}
      <div className="temporary-student-search-results">
        {candidates.map((student) => (
          <div className="temporary-student-search-row" key={student.id}>
            <StudentIdentity student={student} />
            <button className="button button-primary button-small" type="button" disabled={add.isPending} onClick={() => add.mutate(student.id)}>
              加入
            </button>
          </div>
        ))}
      </div>
      <details className="nested-action-panel">
        <summary>新增学生并报名</summary>
        <StudentForm submitLabel="新增并报名" isSubmitting={create.isPending} error={create.error ? getErrorMessage(create.error) : ''} onSubmit={async (input) => { await create.mutateAsync(input) }} />
      </details>
      {error && <p className="form-error" role="alert">{error}</p>}
    </details>
  )
}
