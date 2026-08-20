import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { StudentInput, TemporaryClassEnrollment } from '../../../types/domain'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { listStudents } from '../../students/api/studentsService'
import { StudentForm } from '../../students/components/StudentForm'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { filterEligibleStudents } from '../../classes/studentPicker'
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const deferredSearch = useDeferredValue(search)
  const students = useQuery({
    queryKey: ['students', 'all'],
    queryFn: () => listStudents(),
  })
  const enrolledIds = useMemo(() => enrollments.map((item) => item.student_id), [enrollments])
  const candidates = useMemo(
    () => filterEligibleStudents(students.data ?? [], enrolledIds, deferredSearch),
    [deferredSearch, enrolledIds, students.data],
  )
  const visibleIds = candidates.map((student) => student.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['temporary-class', classId, 'enrollments'] }),
      queryClient.invalidateQueries({ queryKey: ['temporary-classes'] }),
      queryClient.invalidateQueries({ queryKey: ['students'] }),
      queryClient.invalidateQueries({ queryKey: ['attendance'] }),
    ])
  }
  const add = useMutation({
    mutationFn: async (studentIds: string[]) => {
      for (const studentId of studentIds) await addStudentToTemporaryClass(classId, studentId)
      return studentIds.length
    },
    onSuccess: async (count) => {
      setError('')
      setSuccess(`已加入 ${count} 位学生。`)
      setSelectedIds([])
      await refresh()
    },
    onError: async (caughtError) => {
      setError(getErrorMessage(caughtError, '加入学生失败，请检查名单后重试。'))
      await refresh()
    },
  })
  const create = useMutation({
    mutationFn: (input: StudentInput) => createStudentForTemporaryClass(classId, input),
    onSuccess: async () => {
      setError('')
      setSuccess('已新增学生并加入临时班。')
      await refresh()
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增学生并报名失败，请重试。')),
  })

  function toggleStudent(studentId: string) {
    setSuccess('')
    setSelectedIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId])
  }

  return (
    <details className="action-panel temporary-registration-panel" open>
      <summary>加入学生</summary>
      <div className="student-picker">
        <label className="field">
          <span>筛选学生</span>
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSuccess('') }} placeholder="姓名、学校班级或电话" />
        </label>
        {students.isLoading && <LoadingBlock message="正在载入学生…" />}
        {students.isError && <ErrorBlock message="学生名单载入失败。" />}
        {!students.isLoading && !students.isError && (
          <>
            <div className="student-picker-toolbar">
              <label className="select-all-control">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={candidates.length === 0}
                  onChange={() => setSelectedIds((current) => allVisibleSelected
                    ? current.filter((id) => !visibleIds.includes(id))
                    : [...new Set([...current, ...visibleIds])])}
                />
                <span>全选目前名单</span>
              </label>
              <span>已选 {selectedIds.length} 位</span>
              {selectedIds.length > 0 && <button className="button button-text button-small" type="button" onClick={() => setSelectedIds([])}>取消选择</button>}
            </div>
            {candidates.length === 0 && <p className="search-note">{search.trim() ? '找不到符合条件的可加入学生。' : '所有学生都已报名，或目前还没有学生资料。'}</p>}
            <div className="student-picker-list">
              {candidates.map((student) => (
                <label className={`student-picker-row ${selectedIds.includes(student.id) ? 'selected' : ''}`} key={student.id}>
                  <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                  <StudentIdentity student={student} />
                </label>
              ))}
            </div>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-success" role="status">{success}</p>}
        <div className="student-picker-submit">
          <span>{selectedIds.length > 0 ? `将加入 ${selectedIds.length} 位学生` : '请选择学生'}</span>
          <button className="button button-primary" type="button" disabled={selectedIds.length === 0 || add.isPending} onClick={() => add.mutate(selectedIds)}>
            {add.isPending ? '加入中…' : '确认加入'}
          </button>
        </div>
      </div>
      <details className="nested-action-panel">
        <summary>新增学生并报名</summary>
        <StudentForm submitLabel="新增并报名" isSubmitting={create.isPending} error={create.error ? getErrorMessage(create.error) : ''} onSubmit={async (input) => { await create.mutateAsync(input) }} />
      </details>
    </details>
  )
}
