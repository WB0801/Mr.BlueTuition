import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getClass } from '../../classes/api/classesService'
import { ClassScheduleSection } from '../components/ClassScheduleSection'

export function ClassSessionsPage() {
  const { classId = '' } = useParams()
  const tuitionClass = useQuery({
    queryKey: ['class', classId],
    queryFn: () => getClass(classId),
  })

  if (tuitionClass.isLoading) return <LoadingBlock />
  if (tuitionClass.isError || !tuitionClass.data) return <ErrorBlock message="找不到这个班级，或课程资料载入失败。" />

  return (
    <section>
      <PageHeader
        title={`${tuitionClass.data.name} · 课程`}
        backTo={`/classes/${classId}`}
        backLabel="班级详情"
      />
      <ClassScheduleSection tuitionClass={tuitionClass.data} />
    </section>
  )
}
