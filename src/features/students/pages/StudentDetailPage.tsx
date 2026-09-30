import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listClasses } from '../../classes/api/classesService'
import { listStudentEnrollments } from '../../enrollments/api/enrollmentsService'
import { EnrollmentCard } from '../../enrollments/components/EnrollmentCard'
import { NewEnrollmentForm } from '../../enrollments/components/NewEnrollmentForm'
import { StudentGradesSection } from '../../grades/components/StudentGradesSection'
import { StudentTemporaryClassesSection } from '../../temporary-classes/components/StudentTemporaryClassesSection'
import { PermanentDeleteZone } from '../../deletion/components/PermanentDeleteZone'
import { getStudent } from '../api/studentsService'
import { recordStudentView } from '../recentStudentViews'

export function StudentDetailPage() {
  const { studentId = '' } = useParams()
  const navigate = useNavigate()
  const [showGrades, setShowGrades] = useState(false)
  const student = useQuery({ queryKey: ['student', studentId], queryFn: () => getStudent(studentId) })
  const enrollments = useQuery({
    queryKey: ['enrollments', 'student', studentId],
    queryFn: () => listStudentEnrollments(studentId),
  })
  const classes = useQuery({ queryKey: ['classes', 'active'], queryFn: () => listClasses('active') })
  useEffect(() => {
    if (student.data) recordStudentView(student.data.owner_id, student.data.id)
  }, [student.data])

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
      />

      <dl className="details-card student-profile-card">
        <div><dt>学校班级</dt><dd>{student.data.school_class || '未填写'}</dd></div>
        <div><dt>联系电话</dt><dd>{student.data.phone || '未填写'}</dd></div>
      </dl>

      <nav className="related-nav" aria-label="学生相关资料">
        <button type="button" onClick={() => document.getElementById('current-enrollments')?.scrollIntoView({ behavior: 'auto' })}>班级与报读</button>
        <ContextLink backLabel="学生" to={`/fees?studentId=${studentId}&month=all&status=all`}>缴费记录</ContextLink>
        <ContextLink backLabel="学生" to={`/attendance?studentId=${studentId}&view=history`}>出席与课程（分批查询）</ContextLink>
        <button type="button" onClick={() => { setShowGrades(true); requestAnimationFrame(() => document.getElementById('student-grade-details')?.scrollIntoView({ behavior: 'auto' })) }}>考试与成绩</button>
      </nav>

      <section className="content-section entity-section" id="current-enrollments">
        <h2>当前报读 <span className="section-count">{current.length}</span></h2>
        {enrollments.isLoading && <LoadingBlock />}
        {enrollments.isError && <ErrorBlock message="报读资料载入失败。" />}
        {!enrollments.isLoading && current.length === 0 && <EmptyBlock message="目前没有进行中的报读。" />}
        <div className="record-list">
          {current.map((item) => <EnrollmentCard enrollment={item} key={item.id} />)}
        </div>
      </section>

      <details className="action-panel enrollment-create-panel">
        <summary>加入班级或重新报读</summary>
        {classes.isLoading && <LoadingBlock message="正在载入班级…" />}
        {classes.isError && <ErrorBlock message="班级载入失败。" />}
        {classes.data && <NewEnrollmentForm studentId={studentId} classes={classes.data} excludedClassIds={current.map((item) => item.class_id)} />}
      </details>

      <details className="history-panel" id="student-grade-details" open={showGrades} onToggle={(event) => setShowGrades(event.currentTarget.open)}>
        <summary>考试与成绩</summary>
        {showGrades && <StudentGradesSection studentId={studentId} />}
      </details>

      <details className="history-panel" id="student-history">
        <summary>历史报读（{history.length}）</summary>
        {!enrollments.isLoading && history.length === 0 && <EmptyBlock message="还没有历史报读。" />}
        <div className="record-list">
          {history.map((item) => <EnrollmentCard enrollment={item} key={item.id} />)}
        </div>
      </details>

      <details className="history-panel"><summary>临时班参与</summary><StudentTemporaryClassesSection studentId={studentId} /></details>

      <details className="management-panel">
        <summary>学生管理</summary>
        <div className="management-links"><ContextLink backLabel="学生" className="button button-secondary" to={`/students/${studentId}/edit`}>编辑学生</ContextLink></div>
      <PermanentDeleteZone
        entityType="student"
        entityId={studentId}
        entityName={student.data.name}
        entityLabel="学生"
        onDeleted={() => navigate('/students', { replace: true, state: { successMessage: `已永久删除学生「${student.data.name}」及其关联资料。` } })}
      />
      </details>
    </section>
  )
}
