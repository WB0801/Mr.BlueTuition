import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { completedContextOperation } from '../../../components/contextual/contextDataState'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listClasses } from '../../classes/api/classesService'
import { listStudentEnrollments } from '../../enrollments/api/enrollmentsService'
import { StudentEnrollmentRecords } from '../../enrollments/components/StudentEnrollmentRecords'
import { NewEnrollmentForm } from '../../enrollments/components/NewEnrollmentForm'
import { StudentGradesSection } from '../../grades/components/StudentGradesSection'
import { StudentTemporaryClassesSection } from '../../temporary-classes/components/StudentTemporaryClassesSection'
import { PermanentDeleteZone } from '../../deletion/components/PermanentDeleteZone'
import { FeeRecords } from '../../fees/components/FeeRecords'
import { ObjectCourseRecords } from '../../schedule/components/ObjectCourseRecords'
import { getStudent } from '../api/studentsService'
import { recordStudentView } from '../recentStudentViews'

export function StudentDetailPage() {
  const { studentId = '' } = useParams()
  return <StudentDetailView key={studentId} studentId={studentId} />
}

function StudentDetailView({ studentId }: { studentId: string }) {
  const navigate = useNavigate()
  const student = useQuery({ queryKey: ['student', studentId], queryFn: () => getStudent(studentId) })
  const enrollments = useQuery({ queryKey: ['enrollments', 'student', studentId], queryFn: () => listStudentEnrollments(studentId) })
  useEffect(() => { if (student.data) recordStudentView(student.data.owner_id, student.data.id) }, [student.data])
  if (student.isLoading) return <LoadingBlock />
  if (student.isError || !student.data) return <ErrorBlock message="找不到这位学生，或资料载入失败。" />
  const data = student.data
  const current = enrollments.data?.filter(item => item.status === 'active') ?? []
  return <section className="management-page detail-page student-detail-page">
    <PageHeader title={data.name} backTo="/students" backLabel="学生" />
    <dl className="details-card student-profile-card"><div><dt>学校班级</dt><dd>{data.school_class || '未填写'}</dd></div><div><dt>联系电话</dt><dd>{data.phone || '未填写'}</dd></div></dl>
    <ContextDataWorkspace label="学生相关资料" defaultPanel="enrollments" sections={[
      { id: 'enrollments', label: '班级与报读', render: () => <>
        {enrollments.isLoading && <LoadingBlock />}{enrollments.isError && <ErrorBlock message="报读资料载入失败。" />}
        {enrollments.isSuccess && <StudentEnrollmentRecords records={enrollments.data} studentId={studentId} />}
      </> },
      { id: 'history', label: '历史报读', render: () => <>
        {enrollments.isLoading && <LoadingBlock />}{enrollments.isError && <ErrorBlock message="报读资料载入失败。" />}
        {enrollments.isSuccess && <StudentEnrollmentRecords records={enrollments.data} studentId={studentId} history />}
      </> },
      { id: 'fees', label: '缴费记录', render: active => <FeeRecords scope={{ studentId }} active={active} /> },
      { id: 'attendance', label: '出席与课程', render: active => <ObjectCourseRecords scope={{ studentId }} active={active} /> },
      { id: 'grades', label: '考试与成绩', render: active => <StudentGradesSection studentId={studentId} embedded active={active} /> },
      { id: 'temporary', label: '临时班参与', render: active => <StudentTemporaryClassesSection studentId={studentId} active={active} /> },
      { id: 'join', label: '加入班级／重新报读', render: active => <StudentJoinClass studentId={studentId} excludedClassIds={current.map(item => item.class_id)} active={active} /> },
      { id: 'management', label: '学生管理', render: () => <>
        <h2>学生管理</h2><div className="management-links"><ContextLink backLabel="学生" className="button button-secondary" to={`/students/${studentId}/edit`}>编辑学生</ContextLink></div>
        <PermanentDeleteZone entityType="student" entityId={studentId} entityName={data.name} entityLabel="学生" onDeleted={() => navigate('/students', { replace: true, state: completedContextOperation({ successMessage: `已永久删除学生「${data.name}」及其关联资料。` }) })} />
      </> },
    ]} />
  </section>
}

function StudentJoinClass({ studentId, excludedClassIds, active }: { studentId: string; excludedClassIds: string[]; active: boolean }) {
  const classes = useQuery({ queryKey: ['classes', 'active'], queryFn: () => listClasses('active'), enabled: active })
  return <><h2>加入班级或重新报读</h2>{classes.isLoading && <LoadingBlock message="正在载入班级…" />}{classes.isError && <ErrorBlock message="班级载入失败。" />}
    {classes.data?.length === 0 && <EmptyBlock message="目前没有可加入的进行中班级。" />}
    {classes.data && classes.data.length > 0 && <NewEnrollmentForm studentId={studentId} classes={classes.data} excludedClassIds={excludedClassIds} />}
  </>
}
