import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import { Icon } from '../../../components/ui'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate, formatMoney, todayInMalaysia } from '../../../utils/format'
import { listClassEnrollments } from '../../enrollments/api/enrollmentsService'
import { EndEnrollmentAction } from '../../enrollments/components/EndEnrollmentAction'
import { ClassCourseSummary } from '../../schedule/components/ClassCourseSummary'
import { ClassFixedScheduleSection } from '../../schedule/components/ClassFixedScheduleSection'
import { ClassScheduleHistory } from '../../schedule/components/ClassScheduleHistory'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { endClass, getClass } from '../api/classesService'
import { getEndClassConfirmationMessage } from '../classActions'
import { AddStudentToClass } from '../components/AddStudentToClass'
import { ClassScheduleSummary } from '../components/ClassScheduleSummary'

export function ClassDetailPage() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState(todayInMalaysia())
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [error, setError] = useState('')
  const tuitionClass = useQuery({ queryKey: ['class', classId], queryFn: () => getClass(classId) })
  const enrollments = useQuery({
    queryKey: ['enrollments', 'class', classId],
    queryFn: () => listClassEnrollments(classId),
  })
  const endClassMutation = useMutation({
    mutationFn: () => endClass(classId, endDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] })
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      navigate('/classes', { replace: true })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '结束班级失败，请重试。')),
  })

  if (tuitionClass.isLoading) return <LoadingBlock />
  if (tuitionClass.isError || !tuitionClass.data) return <ErrorBlock message="找不到这个班级，或资料载入失败。" />

  const data = tuitionClass.data
  const current = enrollments.data?.filter((item) => item.status === 'active') ?? []
  const history = enrollments.data?.filter((item) => item.status === 'ended') ?? []

  async function handleEndClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(getEndClassConfirmationMessage(current.length))) return
    setError('')
    try { await endClassMutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  return (
    <section className="management-page detail-page class-detail-page">
      <PageHeader title={data.name} backTo="/classes" backLabel="班级" />
      <div className="detail-title-row compact-title-row">
        <p className="eyebrow">{data.subject?.name}</p>
        <StatusBadge status={data.status} />
      </div>

      <dl className="details-card details-grid class-overview">
        <div><dt>当前学生</dt><dd>{current.length} 人</dd></div>
        <div><dt>每月学费</dt><dd>{formatMoney(data.monthly_fee)}</dd></div>
        <div><dt>固定课表</dt><dd><ClassScheduleSummary tuitionClass={data} /></dd></div>
        <div><dt>开班日期</dt><dd>{formatDate(data.start_date)}</dd></div>
      </dl>

      <nav className="related-nav" aria-label="班级相关资料">
        <ContextLink backLabel="班级" to={`/classes/${classId}/sessions`}>课程</ContextLink>
        <ContextLink backLabel="班级" to="/attendance">点名</ContextLink>
        <ContextLink backLabel="班级" to={`/fees?classId=${classId}`}>学费</ContextLink>
        <ContextLink backLabel="班级" to={`/grades/quizzes?classId=${classId}`}>小测与成绩</ContextLink>
      </nav>

      <section className="content-section entity-section class-students-section">
        <div className="section-heading-row">
          <h2>当前学生 <span className="section-count">{current.length}</span></h2>
          {data.status === 'active' && (
            <button className="button button-secondary compact-button" type="button" aria-expanded={showAddStudent} onClick={() => setShowAddStudent((value) => !value)}>
              ＋ 加入学生
            </button>
          )}
        </div>
        {showAddStudent && data.status === 'active' && (
          <div className="embedded-action-panel">
            <AddStudentToClass classId={classId} enrolledStudentIds={current.map((item) => item.student_id)} />
          </div>
        )}
        {enrollments.isLoading && <LoadingBlock />}
        {enrollments.isError && <ErrorBlock message="学生名单载入失败。" />}
        {!enrollments.isLoading && current.length === 0 && <EmptyBlock message="目前没有在读学生。" />}
        <div className="compact-data-list">
          {current.map((item) => item.student && (
            <div className="compact-data-row class-student-row" key={item.id}>
              <ContextLink backLabel="班级" className="identity-link" to={`/students/${item.student.id}`}>
                <StudentIdentity student={item.student} />
              </ContextLink>
              <EndEnrollmentAction enrollmentId={item.id} studentName={item.student.name} />
            </div>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <details className="history-panel">
          <summary>历史报读（{history.length}）</summary>
          <div className="compact-data-list">
            {history.map((item) => item.student && (
              <ContextLink backLabel="班级" className="compact-data-row compact-data-link" to={`/students/${item.student.id}/enrollments/${item.id}`} key={item.id}>
                <span className="record-main">
                  <StudentIdentity student={item.student} />
                  <span className="record-meta">{formatDate(item.join_date)} – {formatDate(item.end_date)}</span>
                </span>
                <Icon className="record-chevron" name="chevron-right" size={20} />
              </ContextLink>
            ))}
          </div>
        </details>
      )}

      <ClassCourseSummary classId={classId} />

      <details className="management-panel">
        <summary>班级管理</summary>
        <div className="management-links">
          <ContextLink backLabel="班级" className="button button-secondary" to={`/classes/${classId}/edit`}>编辑班级资料</ContextLink>
        </div>
        <ClassFixedScheduleSection tuitionClass={data} />
        <ClassScheduleHistory tuitionClass={data} />
      </details>

      {data.status === 'active' && (
        <details className="danger-panel">
          <summary>结束此班</summary>
          <p className="impact-notice">结束此班将同时结束 <strong>{current.length}</strong> 位当前学生的报读；所有历史都会保留。</p>
          <form className="compact-form" onSubmit={handleEndClass}>
            <label className="field">
              <span>结束日期</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-danger" type="submit" disabled={endClassMutation.isPending}>
              {endClassMutation.isPending ? '处理中…' : '结束班级'}
            </button>
          </form>
        </details>
      )}
    </section>
  )
}
