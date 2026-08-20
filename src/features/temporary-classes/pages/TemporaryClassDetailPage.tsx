import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import { formatMoney, formatSessionTimeRange } from '../../../utils/format'
import { getErrorMessage } from '../../../utils/errors'
import { getSessionRoster } from '../../attendance/api/attendanceService'
import {
  endTemporaryClass,
  getTemporaryClass,
  getTemporaryClassSession,
  listTemporaryClassEnrollments,
} from '../api/temporaryClassesService'
import { TemporaryClassRegistrationPanel } from '../components/TemporaryClassRegistrationPanel'
import { TemporaryPaymentRow } from '../components/TemporaryPaymentRow'

const sessionStatusLabels = { scheduled: '可点名', cancelled: '已停课', completed: '已结束' } as const

export function TemporaryClassDetailPage() {
  const { temporaryClassId = '' } = useParams()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const temporaryClass = useQuery({
    queryKey: ['temporary-class', temporaryClassId],
    queryFn: () => getTemporaryClass(temporaryClassId),
  })
  const session = useQuery({
    queryKey: ['temporary-class', temporaryClassId, 'session'],
    queryFn: () => getTemporaryClassSession(temporaryClassId),
  })
  const enrollments = useQuery({
    queryKey: ['temporary-class', temporaryClassId, 'enrollments'],
    queryFn: () => listTemporaryClassEnrollments(temporaryClassId),
  })
  const roster = useQuery({
    queryKey: ['temporary-class', temporaryClassId, 'attendance-summary', session.data?.id],
    queryFn: () => getSessionRoster(session.data?.id ?? ''),
    enabled: Boolean(session.data?.id),
  })
  const end = useMutation({
    mutationFn: () => endTemporaryClass(temporaryClassId),
    onSuccess: async () => {
      setError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['temporary-class', temporaryClassId] }),
        queryClient.invalidateQueries({ queryKey: ['temporary-classes'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] }),
      ])
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '结束临时班失败。')),
  })

  if (temporaryClass.isLoading || session.isLoading || enrollments.isLoading) return <LoadingBlock />
  if (temporaryClass.isError || !temporaryClass.data) return <ErrorBlock message="找不到这个临时班。" />
  if (session.isError || !session.data) return <ErrorBlock message="临时班课程载入失败。" />
  if (enrollments.isError) return <ErrorBlock message="报名名单载入失败。" />

  const data = temporaryClass.data
  const isActive = data.status === 'active'
  const signedCount = roster.data?.filter((item) => item.attendance_record_id).length ?? 0

  return (
    <section>
      <PageHeader title={data.name} backTo="/temporary-classes" backLabel="临时班" actions={isActive ? <ContextLink backLabel="临时班" className="button button-secondary" to={`/temporary-classes/${data.id}/edit`}>编辑临时班</ContextLink> : undefined} />
      <div className="detail-title-row compact-title-row">
        <p className="eyebrow">{data.subject?.name}</p>
        <StatusBadge status={data.status} />
      </div>

      <dl className="details-card details-grid class-overview">
          <div><dt>日期与时间</dt><dd>{formatSessionTimeRange(data.start_at, data.end_at)}</dd></div>
          <div><dt>一次性收费</dt><dd>{formatMoney(data.fee_amount)} / 人</dd></div>
          <div><dt>当前报名</dt><dd>{enrollments.data?.length ?? 0} 人</dd></div>
          <div><dt>点名进度</dt><dd>{signedCount} / {enrollments.data?.length ?? 0}</dd></div>
      </dl>

      <nav className="related-nav" aria-label="临时班相关资料">
        <ContextLink backLabel="临时班" to={`/attendance/session/${session.data.id}`}>点名与签名</ContextLink>
        <ContextLink backLabel="临时班" to="/fees/receipts">收据</ContextLink>
      </nav>

      <section className="content-section">
        <div className="section-heading-row">
          <h2>当前报名 {enrollments.data?.length ?? 0} 人</h2>
        </div>
        {isActive && <TemporaryClassRegistrationPanel classId={data.id} enrollments={enrollments.data ?? []} />}
        {!enrollments.data?.length && <EmptyBlock message="目前还没有学生报名。" />}
        <div className="temporary-enrollment-list compact-data-list">
          {enrollments.data?.map((enrollment) => <TemporaryPaymentRow enrollment={enrollment} allowActions key={enrollment.id} />)}
        </div>
      </section>

      <section className="content-section temporary-attendance-summary">
        <h2>点名</h2>
        <div>
          <strong>{formatSessionTimeRange(session.data.current_start_at, session.data.current_end_at)}</strong>
          <span>{sessionStatusLabels[session.data.status]} · 已签到 {signedCount} / {enrollments.data?.length ?? 0}</span>
        </div>
        {roster.isError && <ErrorBlock message="签到摘要载入失败。" />}
        <ContextLink backLabel="临时班" className="button button-primary" to={`/attendance/session/${session.data.id}`}>进入点名</ContextLink>
      </section>

      {isActive && (
        <details className="danger-panel temporary-end-zone">
          <summary>结束临时班</summary>
          <p>结束后报名、收费、收据与签到历史都会保留。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-danger" type="button" disabled={end.isPending} onClick={() => {
            if (window.confirm('确定结束此临时班吗？报名、收费与签到历史都会保留。')) end.mutate()
          }}>
            {end.isPending ? '处理中…' : '结束此班'}
          </button>
        </details>
      )}
    </section>
  )
}
