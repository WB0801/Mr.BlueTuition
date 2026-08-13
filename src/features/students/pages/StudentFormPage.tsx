import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { useAuth } from '../../auth/authContext'
import { getErrorMessage } from '../../../utils/errors'
import type { StudentInput } from '../../../types/domain'
import { createStudent, getStudent, updateStudent } from '../api/studentsService'
import { StudentForm } from '../components/StudentForm'

export function StudentFormPage() {
  const { studentId } = useParams()
  const isEditing = Boolean(studentId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const student = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => getStudent(studentId!),
    enabled: isEditing,
  })

  const saveStudent = useMutation({
    mutationFn: (input: StudentInput) => isEditing
      ? updateStudent(studentId!, input)
      : createStudent(user!.id, input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.setQueryData(['student', saved.id], saved)
      navigate(`/students/${saved.id}`, { replace: true })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '学生资料保存失败，请重试。')),
  })

  if (isEditing && student.isLoading) return <LoadingBlock />
  if (isEditing && student.isError) return <ErrorBlock message="找不到这位学生，或资料载入失败。" />

  const initialValue = student.data
    ? {
        name: student.data.name,
        school_class: student.data.school_class ?? '',
        phone: student.data.phone ?? '',
      }
    : undefined

  return (
    <section>
      <PageHeader
        title={isEditing ? '编辑学生' : '新增学生'}
        backTo={isEditing ? `/students/${studentId}` : '/students'}
        backLabel="学生"
      />
      <StudentForm
        key={student.data?.updated_at ?? 'new'}
        initialValue={initialValue}
        submitLabel={isEditing ? '保存修改' : '新增学生'}
        isSubmitting={saveStudent.isPending}
        error={error}
        onSubmit={async (input) => {
          setError('')
          await saveStudent.mutateAsync(input)
        }}
      />
    </section>
  )
}
