import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listStudents } from '../../students/api/studentsService'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { createEnrollment } from '../../enrollments/api/enrollmentsService'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'

interface AddStudentToClassProps {
  classId: string
  enrolledStudentIds: string[]
}

export function AddStudentToClass({ classId, enrolledStudentIds }: AddStudentToClassProps) {
  const [search, setSearch] = useState('')
  const [joinDate, setJoinDate] = useState(todayInMalaysia())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const queryClient = useQueryClient()
  const students = useQuery({
    queryKey: ['students', 'search', deferredSearch],
    queryFn: () => listStudents(deferredSearch),
    enabled: deferredSearch.length > 0,
  })
  const add = useMutation({
    mutationFn: (studentId: string) => createEnrollment(studentId, classId, joinDate),
    onSuccess: async () => {
      setError('')
      setSuccess('学生已加入班级。')
      setSearch('')
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '加入学生失败，请重试。')),
  })

  const results = students.data?.filter((student) => !enrolledStudentIds.includes(student.id)) ?? []

  return (
    <div className="compact-form add-student-form">
      <label className="field">
        <span>加入日期</span>
        <input type="date" value={joinDate} onChange={(event) => setJoinDate(event.target.value)} required />
      </label>
      <label className="field">
        <span>搜索学生姓名</span>
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setSuccess('')
          }}
          placeholder="输入姓名"
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      {students.isLoading && <p className="search-note">搜索中…</p>}
      {deferredSearch && !students.isLoading && results.length === 0 && <p className="search-note">找不到可加入的学生。</p>}
      <div className="search-results embedded-results">
        {results.map((student) => (
          <div className="search-result search-result-action" key={student.id}>
            <StudentIdentity student={student} />
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={add.isPending}
              onClick={() => add.mutate(student.id)}
            >
              加入
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
