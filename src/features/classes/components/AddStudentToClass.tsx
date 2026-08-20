import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listStudents } from '../../students/api/studentsService'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { createEnrollment } from '../../enrollments/api/enrollmentsService'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'
import { filterEligibleStudents } from '../studentPicker'

interface AddStudentToClassProps {
  classId: string
  enrolledStudentIds: string[]
}

export function AddStudentToClass({ classId, enrolledStudentIds }: AddStudentToClassProps) {
  const [search, setSearch] = useState('')
  const [joinDate, setJoinDate] = useState(todayInMalaysia())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const deferredSearch = useDeferredValue(search)
  const queryClient = useQueryClient()
  const students = useQuery({
    queryKey: ['students', 'all'],
    queryFn: () => listStudents(),
  })
  const results = useMemo(
    () => filterEligibleStudents(students.data ?? [], enrolledStudentIds, deferredSearch),
    [deferredSearch, enrolledStudentIds, students.data],
  )
  const visibleIds = results.map((student) => student.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  const add = useMutation({
    mutationFn: async (studentIds: string[]) => {
      for (const studentId of studentIds) await createEnrollment(studentId, classId, joinDate)
      return studentIds.length
    },
    onSuccess: async (count) => {
      setError('')
      setSuccess(`已加入 ${count} 位学生。`)
      setSelectedIds([])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
        queryClient.invalidateQueries({ queryKey: ['monthly-fees'] }),
      ])
    },
    onError: async (caughtError) => {
      setError(getErrorMessage(caughtError, '加入学生失败，请检查名单后重试。'))
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
    },
  })

  function toggleStudent(studentId: string) {
    setSuccess('')
    setSelectedIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId])
  }

  function toggleVisible() {
    setSuccess('')
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])])
  }

  return (
    <div className="student-picker">
      <div className="student-picker-controls">
        <label className="field">
          <span>加入日期</span>
          <input type="date" value={joinDate} onChange={(event) => setJoinDate(event.target.value)} required />
        </label>
        <label className="field student-picker-search">
          <span>筛选学生</span>
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setSuccess('') }}
            placeholder="姓名、学校班级或电话"
          />
        </label>
      </div>

      {students.isLoading && <LoadingBlock message="正在载入学生…" />}
      {students.isError && <ErrorBlock message="学生名单载入失败。" />}
      {!students.isLoading && !students.isError && (
        <>
          <div className="student-picker-toolbar">
            <label className="select-all-control">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={results.length === 0} />
              <span>全选目前名单</span>
            </label>
            <span>已选 {selectedIds.length} 位</span>
            {selectedIds.length > 0 && <button className="button button-text button-small" type="button" onClick={() => setSelectedIds([])}>取消选择</button>}
          </div>
          {results.length === 0 && <p className="search-note">{search.trim() ? '找不到符合条件的可加入学生。' : '所有学生都已在本班，或目前还没有学生资料。'}</p>}
          <div className="student-picker-list">
            {results.map((student) => (
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
  )
}
