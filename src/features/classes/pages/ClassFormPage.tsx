import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { objectEditReturnTarget } from '../../../components/navigation/objectEditReturn'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import type { ClassInput } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'
import { useAuth } from '../../auth/authContext'
import { createClass, getClass, updateClass } from '../api/classesService'
import { listSubjects } from '../api/subjectsService'
import { ClassForm } from '../components/ClassForm'
import { invalidateContextClassCreation } from '../../../components/contextual/contextDataInvalidation'
import { useRef } from 'react'
import { completedContextOperation } from '../../../components/contextual/contextDataState'

const newClassDefaults: ClassInput = {
  name: '',
  subject_id: '',
  weekday: 6,
  start_time: '14:00',
  end_time: '15:30',
  monthly_fee: 100,
  start_date: todayInMalaysia(),
}

export function ClassFormPage() {
  const { classId } = useParams()
  const isEditing = Boolean(classId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const savedId = useRef('')
  const [error, setError] = useState('')
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: listSubjects })
  const tuitionClass = useQuery({
    queryKey: ['class', classId],
    queryFn: () => getClass(classId!),
    enabled: isEditing,
  })
  const save = useMutation({
    mutationFn: (input: ClassInput) => isEditing
      ? updateClass(classId!, input)
      : createClass(user!.id, input),
    onSuccess: async (saved) => {
      if (!isEditing) await invalidateContextClassCreation(queryClient)
      await queryClient.invalidateQueries({ queryKey: ['classes'] })
      queryClient.setQueryData(['class', saved.id], saved)
      savedId.current = saved.id
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '班级资料保存失败，请重试。')),
  })

  if (subjects.isLoading || (isEditing && tuitionClass.isLoading)) return <LoadingBlock />
  if (subjects.isError && !subjects.data) return <ErrorBlock message="科目资料载入失败。" />
  if (isEditing && !tuitionClass.data) return <ErrorBlock message="找不到这个班级，或资料载入失败。" />

  const initialValue: ClassInput = tuitionClass.data
    ? {
        name: tuitionClass.data.name,
        subject_id: tuitionClass.data.subject_id,
        weekday: tuitionClass.data.weekday,
        start_time: tuitionClass.data.start_time.slice(0, 5),
        end_time: tuitionClass.data.end_time.slice(0, 5),
        monthly_fee: tuitionClass.data.monthly_fee,
        start_date: tuitionClass.data.start_date,
      }
    : newClassDefaults

  return (
    <section className="management-page form-page">
      <PageHeader
        title={isEditing ? '编辑班级' : '新增班级'}
        backTo={isEditing ? `/classes/${classId}` : '/classes'}
        backLabel="班级"
      />
      {subjects.data?.length === 0 ? (
        <div>
          <EmptyBlock message="请先新增至少一个科目。" />
          <ContextLink backLabel="班级" className="button button-primary" to="/classes/subjects">管理科目</ContextLink>
        </div>
      ) : (
        <ClassForm
          key={classId ?? 'new'}
          subjects={subjects.data ?? []}
          initialValue={initialValue}
          submitLabel={isEditing ? '保存修改' : '新增班级'}
          isSubmitting={save.isPending}
          isEditing={isEditing}
          onSaved={() => {
            const target = objectEditReturnTarget('classes', classId, savedId.current, location.state)
            navigate(target.to, { replace: true, state: completedContextOperation({ ...target.state, objectSaved: { kind: 'classes', id: savedId.current } }) })
          }}
          error={error}
          onSubmit={async (input) => {
            setError('')
            await save.mutateAsync(input)
          }}
        />
      )}
      {((tuitionClass.isError && tuitionClass.data) || (subjects.isError && subjects.data)) && <ErrorBlock message="班级资料刷新失败，当前编辑已保留。" />}
    </section>
  )
}
