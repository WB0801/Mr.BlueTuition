import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { completedContextOperation } from '../../../components/contextual/contextDataState'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import { Icon } from '../../../components/ui'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate, formatMoney, todayInMalaysia } from '../../../utils/format'
import { listClassEnrollments } from '../../enrollments/api/enrollmentsService'
import { EndEnrollmentAction } from '../../enrollments/components/EndEnrollmentAction'
import { ClassFixedScheduleSection } from '../../schedule/components/ClassFixedScheduleSection'
import { ClassScheduleHistory } from '../../schedule/components/ClassScheduleHistory'
import { ObjectCourseRecords } from '../../schedule/components/ObjectCourseRecords'
import { FeeRecords } from '../../fees/components/FeeRecords'
import { ClassQuizRecords } from '../../grades/components/ClassQuizRecords'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import { endClass, getClass } from '../api/classesService'
import { getEndClassConfirmationMessage } from '../classActions'
import { AddStudentToClass } from '../components/AddStudentToClass'
import { PermanentDeleteZone } from '../../deletion/components/PermanentDeleteZone'

export function ClassDetailPage() {
  const { classId = '' } = useParams()
  return <ClassDetailView key={classId} classId={classId} />
}

function ClassDetailView({ classId }: { classId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState(todayInMalaysia())
  const [error, setError] = useState('')
  const tuitionClass = useQuery({ queryKey: ['class', classId], queryFn: () => getClass(classId) })
  const enrollments = useQuery({ queryKey: ['enrollments', 'class', classId], queryFn: () => listClassEnrollments(classId) })
  const endClassMutation = useMutation({
    mutationFn: () => endClass(classId, endDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] })
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      navigate('/classes', { replace: true, state: completedContextOperation() })
    },
    onError: caughtError => setError(getErrorMessage(caughtError, '结束班级失败，请重试。')),
  })
  if (tuitionClass.isLoading) return <LoadingBlock />
  if (tuitionClass.isError || !tuitionClass.data) return <ErrorBlock message="找不到这个班级，或资料载入失败。" />
  const data = tuitionClass.data
  const current = enrollments.data?.filter(item => item.status === 'active') ?? []
  const history = enrollments.data?.filter(item => item.status === 'ended') ?? []
  async function handleEndClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(getEndClassConfirmationMessage(current.length))) return
    setError('')
    try { await endClassMutation.mutateAsync() } catch { /* mutation displays error */ }
  }
  return <section className="management-page detail-page class-detail-page">
    <PageHeader title={data.name} backTo="/classes" backLabel="班级" />
    <div className="detail-title-row compact-title-row"><p className="eyebrow">{data.subject?.name}</p><StatusBadge status={data.status} /></div>
    <dl className="details-card details-grid class-overview"><div><dt>当前学生</dt><dd>{current.length} 人</dd></div><div><dt>每月学费</dt><dd>{formatMoney(data.monthly_fee)}</dd></div></dl>
    <ContextDataWorkspace label="班级相关资料" defaultPanel="students" sections={[
      { id: 'students', label: '学生名单', render: () => <>
        <h2>当前学生 <span className="section-count">{current.length}</span></h2>
        {enrollments.isLoading && <LoadingBlock />}{enrollments.isError && <ErrorBlock message="学生名单载入失败。" />}
        {enrollments.isSuccess && current.length === 0 && <EmptyBlock message="目前没有在读学生。" />}
        <div className="compact-data-list">{current.map(item => item.student && <ContextLink backLabel="班级" className="compact-data-row compact-data-link" to={`/students/${item.student.id}`} key={item.id}><StudentIdentity student={item.student} /><Icon className="record-chevron" name="chevron-right" size={20} /></ContextLink>)}</div>
        {history.length > 0 && <details className="history-panel"><summary>历史报读（{history.length}）</summary><div className="compact-data-list">{history.map(item => item.student && <ContextLink backLabel="班级" className="compact-data-row compact-data-link" to={`/students/${item.student.id}/enrollments/${item.id}`} key={item.id}><span className="record-main"><StudentIdentity student={item.student} /><span className="record-meta">{formatDate(item.join_date)} – {formatDate(item.end_date)}</span></span><Icon className="record-chevron" name="chevron-right" size={20} /></ContextLink>)}</div></details>}
      </> },
      { id: 'courses', label: '课程', render: active => <ObjectCourseRecords scope={{ classId }} tuitionClass={data} prefix="courses" active={active} /> },
      { id: 'attendance', label: '点名', render: active => <ObjectCourseRecords scope={{ classId }} active={active} /> },
      { id: 'fees', label: '学费', render: active => <FeeRecords scope={{ classId }} active={active} /> },
      { id: 'grades', label: '小测与成绩', render: active => <ClassQuizRecords classId={classId} active={active} /> },
      { id: 'join', label: '加入学生', render: () => <><h2>加入学生</h2>{data.status === 'active' ? <AddStudentToClass classId={classId} enrolledStudentIds={current.map(item => item.student_id)} /> : <EmptyBlock message="班级已结束，不能加入学生。" />}</> },
      { id: 'management', label: '班级管理', render: () => <>
        <h2>班级管理</h2><p className="record-meta">开班日期：{formatDate(data.start_date)}</p>
        <div className="management-links"><ContextLink backLabel="班级" className="button button-secondary" to={`/classes/${classId}/edit`}>编辑班级资料</ContextLink></div>
        <ClassFixedScheduleSection tuitionClass={data} /><ClassScheduleHistory tuitionClass={data} />
        <details className="history-panel"><summary>报读管理</summary>
          {enrollments.isLoading && <LoadingBlock />}{enrollments.isError && <ErrorBlock message="报读名单载入失败。" />}
          <div className="compact-data-list">{current.map(item => item.student && <div className="compact-data-row class-student-row" key={item.id}><StudentIdentity student={item.student} /><EndEnrollmentAction enrollmentId={item.id} studentName={item.student.name} /></div>)}</div>
        </details>
        {data.status === 'active' && <details className="danger-panel"><summary>结束此班</summary>
          <p className="impact-notice">结束此班将同时结束 <strong>{current.length}</strong> 位当前学生的报读；所有历史都会保留。</p>
          <form className="compact-form" onSubmit={handleEndClass}><label className="field"><span>结束日期</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}<button className="button button-danger" type="submit" disabled={endClassMutation.isPending}>{endClassMutation.isPending ? '处理中…' : '结束班级'}</button>
          </form></details>}
        <PermanentDeleteZone entityType="class" entityId={classId} entityName={data.name} entityLabel="班级" onDeleted={async () => {
          await Promise.all(['classes', 'enrollments', 'monthly-fees'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
          navigate('/classes', { replace: true, state: completedContextOperation({ successMessage: `已永久删除班级「${data.name}」及其关联资料。` }) })
        }} />
      </> },
    ]} />
  </section>
}
