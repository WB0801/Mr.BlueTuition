import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import { listClasses } from '../../classes/api/classesService'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate, todayInMalaysia } from '../../../utils/format'
import { getEnrollment, transferEnrollment } from '../api/enrollmentsService'
import { EndEnrollmentAction } from '../components/EndEnrollmentAction'

export function EnrollmentDetailPage() {
  const { studentId = '', enrollmentId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [newClassId, setNewClassId] = useState('')
  const [transferDate, setTransferDate] = useState(todayInMalaysia())
  const [error, setError] = useState('')
  const enrollment = useQuery({
    queryKey: ['enrollment', enrollmentId],
    queryFn: () => getEnrollment(enrollmentId),
  })
  const classes = useQuery({ queryKey: ['classes', 'active'], queryFn: () => listClasses('active') })
  const transfer = useMutation({
    mutationFn: () => transferEnrollment(enrollmentId, newClassId, transferDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      navigate(`/students/${studentId}`, { replace: true })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '转班失败，请重试。')),
  })

  if (enrollment.isLoading) return <LoadingBlock />
  if (enrollment.isError || !enrollment.data) return <ErrorBlock message="找不到这段报读，或资料载入失败。" />

  const data = enrollment.data
  const transferTargets = classes.data?.filter((item) => item.id !== data.class_id) ?? []

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm('确定转班吗？旧报读会结束，并建立一段新的报读记录。')) return
    setError('')
    try {
      await transfer.mutateAsync()
    } catch {
      // Error is displayed by the mutation callback.
    }
  }

  return (
    <section>
      <PageHeader title={data.student?.name ?? '报读资料'} backTo={`/students/${studentId}`} backLabel="学生资料" />
      <div className="detail-title-row">
        <div>
          <p className="eyebrow">报读班级</p>
          <h2>{data.class?.name ?? '班级资料不可用'}</h2>
        </div>
        <StatusBadge status={data.status} />
      </div>
      <dl className="details-card">
        <div><dt>加入日期</dt><dd>{formatDate(data.join_date)}</dd></div>
        <div><dt>结束日期</dt><dd>{formatDate(data.end_date)}</dd></div>
        <div><dt>状态</dt><dd>{data.status === 'active' ? '在读' : '已结束'}</dd></div>
      </dl>

      {data.status === 'active' && (
        <section className="content-section action-stack">
          <h2>报读操作</h2>
          <div className="action-card">
            <h3>结束报读</h3>
            <p className="muted">学生资料与这段报读历史都会保留。</p>
            <EndEnrollmentAction
              enrollmentId={data.id}
              studentName={data.student?.name ?? '这位学生'}
              onSuccess={() => navigate(`/students/${studentId}`)}
            />
          </div>
          <details className="action-card">
            <summary>转班</summary>
            {classes.isLoading && <LoadingBlock message="正在载入班级…" />}
            {classes.isError && <ErrorBlock message="班级载入失败。" />}
            {!classes.isLoading && transferTargets.length === 0 && <EmptyBlock message="目前没有其他可转入的班级。" />}
            {transferTargets.length > 0 && (
              <form className="compact-form" onSubmit={handleTransfer}>
                <label className="field">
                  <span>转入班级</span>
                  <select value={newClassId} onChange={(event) => setNewClassId(event.target.value)} required>
                    <option value="">请选择班级</option>
                    {transferTargets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>转班日期</span>
                  <input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required />
                </label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="button button-primary" type="submit" disabled={transfer.isPending}>
                  {transfer.isPending ? '处理中…' : '确认转班'}
                </button>
              </form>
            )}
          </details>
        </section>
      )}

      <section className="content-section">
        <h2>这段报读的资料</h2>
        <div className="future-links" aria-label="后续阶段功能">
          <span>出席 <small>Phase 4</small></span>
          <span>学费 <small>Phase 5</small></span>
          <span>成绩 <small>Phase 6</small></span>
        </div>
      </section>
    </section>
  )
}
