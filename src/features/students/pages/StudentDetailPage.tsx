import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listClasses } from '../../classes/api/classesService'
import { listStudentEnrollments } from '../../enrollments/api/enrollmentsService'
import { EnrollmentCard } from '../../enrollments/components/EnrollmentCard'
import { NewEnrollmentForm } from '../../enrollments/components/NewEnrollmentForm'
import { StudentGradesSection } from '../../grades/components/StudentGradesSection'
import { StudentTemporaryClassesSection } from '../../temporary-classes/components/StudentTemporaryClassesSection'
import { getStudent } from '../api/studentsService'

export function StudentDetailPage() {
  const { studentId = '' } = useParams()
  const student = useQuery({ queryKey: ['student', studentId], queryFn: () => getStudent(studentId) })
  const enrollments = useQuery({
    queryKey: ['enrollments', 'student', studentId],
    queryFn: () => listStudentEnrollments(studentId),
  })
  const classes = useQuery({ queryKey: ['classes', 'active'], queryFn: () => listClasses('active') })

  if (student.isLoading) return <LoadingBlock />
  if (student.isError || !student.data) return <ErrorBlock message="找不到这位学生，或资料载入失败。" />

  const current = enrollments.data?.filter((item) => item.status === 'active') ?? []
  const history = enrollments.data?.filter((item) => item.status === 'ended') ?? []

  return (
    <section className="management-page detail-page student-detail-page">
      <PageHeader
        title={student.data.name}
        backTo="/students"
        backLabel="学生"
        actions={<ContextLink backLabel="学生" className="button button-secondary" to={`/students/${studentId}/edit`}>编辑学生</ContextLink>}
      />

      <dl className="details-card student-profile-card">
        <div><dt>学校班级</dt><dd>{student.data.school_class || '未填写'}</dd></div>
        <div><dt>联系电话</dt><dd>{student.data.phone || '未填写'}</dd></div>
      </dl>

      <nav className="related-nav" aria-label="学生相关资料">
        <a href="#current-enrollments">当前报读</a>
        <ContextLink backLabel="学生" to={`/fees?studentId=${studentId}`}>学费</ContextLink>
        <a href="#student-grades">考试与成绩</a>
        <a href="#student-history">历史报读</a>
      </nav>

      <details className="action-panel enrollment-create-panel">
        <summary>加入班级或重新报读</summary>
        {classes.isLoading && <LoadingBlock message="正在载入班级…" />}
        {classes.isError && <ErrorBlock message="班级载入失败。" />}
        {classes.data && (
          <NewEnrollmentForm
            studentId={studentId}
            classes={classes.data}
            excludedClassIds={current.map((item) => item.class_id)}
          />
        )}
      </details>

      <section className="content-section entity-section" id="current-enrollments">
        <h2>当前报读 <span className="section-count">{current.length}</span></h2>
        {enrollments.isLoading && <LoadingBlock />}
        {enrollments.isError && <ErrorBlock message="报读资料载入失败。" />}
        {!enrollments.isLoading && current.length === 0 && <EmptyBlock message="目前没有进行中的报读。" />}
        <div className="record-list">
          {current.map((item) => <EnrollmentCard enrollment={item} key={item.id} />)}
        </div>
      </section>

      <StudentGradesSection studentId={studentId} />

      <section className="content-section entity-section" id="student-history">
        <h2>历史报读 <span className="section-count">{history.length}</span></h2>
        {!enrollments.isLoading && history.length === 0 && <EmptyBlock message="还没有历史报读。" />}
        <div className="record-list">
          {history.map((item) => <EnrollmentCard enrollment={item} key={item.id} />)}
        </div>
      </section>

      <StudentTemporaryClassesSection studentId={studentId} />
    </section>
  )
}
