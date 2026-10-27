import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { objectEditReturnTarget } from '../../../components/navigation/objectEditReturn'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { useAuth } from '../../auth/authContext'
import { getErrorMessage } from '../../../utils/errors'
import type { StudentInput } from '../../../types/domain'
import { createStudent, findPotentialDuplicateStudents, getStudent, updateStudent } from '../api/studentsService'
import { StudentForm } from '../components/StudentForm'
import { useRef } from 'react'
import { completedContextOperation } from '../../../components/contextual/contextDataState'

export function StudentFormPage() {
  const { studentId } = useParams()
  const isEditing = Boolean(studentId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const savedId = useRef('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<StudentInput>({ name: '', school_class: '', phone: '' })
  const deferredDraft = useDeferredValue(draft)
  const student = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => getStudent(studentId!),
    enabled: isEditing,
  })
  const duplicates = useQuery({
    queryKey: ['students', 'duplicate-check', deferredDraft],
    queryFn: () => findPotentialDuplicateStudents(deferredDraft),
    enabled: !isEditing && Boolean(deferredDraft.name.trim() || deferredDraft.phone.trim()),
  })

  const saveStudent = useMutation({
    mutationFn: (input: StudentInput) => isEditing
      ? updateStudent(studentId!, input)
      : createStudent(user!.id, input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.setQueryData(['student', saved.id], saved)
      savedId.current = saved.id
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '学生资料保存失败，请重试。')),
  })

  if (isEditing && student.isLoading) return <LoadingBlock />
  if (isEditing && student.isError && !student.data) return <ErrorBlock message="找不到这位学生，或资料载入失败。" />

  const initialValue = student.data
    ? {
        name: student.data.name,
        school_class: student.data.school_class ?? '',
        phone: student.data.phone ?? '',
      }
    : undefined

  return (
    <section className="management-page form-page">
      <PageHeader
        title={isEditing ? '编辑学生' : '新增学生'}
        backTo={isEditing ? `/students/${studentId}` : '/students'}
        backLabel={isEditing ? '学生资料' : '学生列表'}
      />
      <StudentForm
        key={studentId ?? 'new'}
        initialValue={initialValue}
        submitLabel={isEditing ? '保存修改' : '新增学生'}
        isSubmitting={saveStudent.isPending}
        isEditing={isEditing}
        onSaved={() => {
          const target = objectEditReturnTarget('students', studentId, savedId.current, location.state)
          navigate(target.to, { replace: true, state: completedContextOperation({ ...target.state, objectSaved: { kind: 'students', id: savedId.current } }) })
        }}
        error={error}
        duplicateStudents={isEditing ? [] : duplicates.data}
        duplicateCheckPending={!isEditing && duplicates.isFetching}
        onInputChange={isEditing ? undefined : setDraft}
        onSubmit={async (input) => {
          setError('')
          await saveStudent.mutateAsync(input)
        }}
      />
      {student.isError && student.data && <ErrorBlock message="学生资料刷新失败，当前编辑已保留。" />}
    </section>
  )
}
