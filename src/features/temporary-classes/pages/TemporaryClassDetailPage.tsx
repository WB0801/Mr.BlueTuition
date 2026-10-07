import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
import { PermanentDeleteZone } from '../../deletion/components/PermanentDeleteZone'
import { ContextDataWorkspace } from '../../../components/contextual/ContextDataWorkspace'
import { completedContextOperation } from '../../../components/contextual/contextDataState'

const sessionStatusLabels = { scheduled: '可点名', cancelled: '已停课', completed: '已结束' } as const

export function TemporaryClassDetailPage() {
  const { temporaryClassId = '' } = useParams()
  return <TemporaryClassDetailView key={temporaryClassId} temporaryClassId={temporaryClassId} />
}
function TemporaryClassDetailView({ temporaryClassId }: { temporaryClassId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const paymentId = searchParams.get('paymentId') ?? ''
  const navigate = useNavigate()
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
  const paidCount = enrollments.data?.filter((item) => item.payment?.payment_status === 'paid').length ?? 0
  const enrollmentCount = enrollments.data?.length ?? 0

  return (
    <section>
      <PageHeader title={data.name} backTo="/temporary-classes" backLabel="临时班" />
      <div className="detail-title-row compact-title-row">
        <p className="eyebrow">{data.subject?.name}</p>
        <StatusBadge status={data.status} />
      </div>

      <dl className="details-card details-grid class-overview">
          <div><dt>日期与时间</dt><dd>{formatSessionTimeRange(data.start_at, data.end_at)}</dd></div>
          <div><dt>一次性收费</dt><dd>{formatMoney(data.fee_amount)} / 人</dd></div>
          <div><dt>当前报名</dt><dd>{enrollmentCount} 人</dd></div>
          <div><dt>收费进度</dt><dd>{paidCount} / {enrollmentCount} 已缴</dd></div>
      </dl>

      <ContextDataWorkspace label="临时班相关资料" defaultPanel="students" sections={[
      { id: 'students', label: '学生与收费', render: () => <section className="content-section">
        {paymentId && <div className="scope-notice"><strong>收据对应的临时班缴费记录</strong><button className="button button-text" type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('paymentId'); setSearchParams(next, { replace: true }) }}>显示全部学生缴费记录</button></div>}
        <div className="section-heading-row">
          <h2>学生名单 {enrollmentCount} 人</h2>
        </div>
        {!enrollments.data?.length && <EmptyBlock message="目前还没有学生报名。" />}
        <div className="temporary-enrollment-list compact-data-list">
          {enrollments.data?.filter((enrollment) => !paymentId || enrollment.payment?.id === paymentId).map((enrollment) => <TemporaryPaymentRow enrollment={enrollment} allowActions allowAmountEdit={isActive} key={enrollment.id} />)}
          {paymentId && !enrollments.data?.some((enrollment) => enrollment.payment?.id === paymentId) && <EmptyBlock message="这笔缴费记录已不存在或不属于此临时班。" />}
        </div>
      </section> },
      { id: 'join', kind: 'action' as const, label: '加入学生', render: active => isActive ? <TemporaryClassRegistrationPanel classId={data.id} enrollments={enrollments.data ?? []} active={active} /> : <EmptyBlock message="此临时班已结束，不能加入学生。" /> },
      { id: 'create', kind: 'action' as const, label: '新增学生并报名', render: active => isActive ? <TemporaryClassRegistrationPanel classId={data.id} enrollments={enrollments.data ?? []} mode="create" active={active} /> : <EmptyBlock message="此临时班已结束，不能新增报名。" /> },
      { id: 'attendance', label: '点名', render: active => <TemporaryAttendanceSummary session={session.data!} enrollmentCount={enrollmentCount} active={active} /> },
      { id: 'receipts', label: '收据', render: () => <ContextLink backLabel="临时班" className="button button-secondary" to="/fees/receipts">收据处理</ContextLink> },
      { id: 'management', kind: 'action' as const, label: '临时班管理', render: () => <section className="temporary-management-panel">
        <h2>临时班管理</h2>
        {isActive && <ContextLink backLabel="临时班" className="button button-secondary" to={`/temporary-classes/${data.id}/edit`}>编辑临时班</ContextLink>}
        {isActive && (
          <div className="danger-action-card temporary-end-zone">
            <h3>结束临时班</h3>
            <p>结束后报名、收费、收据与签到历史都会保留。</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-danger" type="button" disabled={end.isPending} onClick={() => {
              if (window.confirm('确定结束此临时班吗？报名、收费与签到历史都会保留。')) end.mutate()
            }}>
              {end.isPending ? '处理中…' : '结束此班'}
            </button>
          </div>
        )}
        {!isActive && <p className="settings-note">此临时班已结束，报名、收费与签到历史保留为只读资料。</p>}
      <PermanentDeleteZone
        entityType="temporary_class"
        entityId={temporaryClassId}
        entityName={data.name}
        entityLabel="临时班"
        onDeleted={async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['temporary-classes'] }),
            queryClient.invalidateQueries({ queryKey: ['sessions'] }),
            queryClient.invalidateQueries({ queryKey: ['monthly-fees'] }),
          ])
          navigate('/temporary-classes', { replace: true, state: completedContextOperation({ successMessage: `已永久删除临时班「${data.name}」及其关联资料。` }) })
        }}
      />
      </section> },
      ]} />
    </section>
  )
}

function TemporaryAttendanceSummary({ session, enrollmentCount, active }: { session: NonNullable<Awaited<ReturnType<typeof getTemporaryClassSession>>>; enrollmentCount: number; active: boolean }) {
  const roster = useQuery({ queryKey: ['temporary-class', session.temporary_class_id, 'attendance-summary', session.id], queryFn: () => getSessionRoster(session.id), enabled: active })
  const signed = roster.data?.filter(item => item.attendance_record_id).length ?? 0
  return <section className="content-section temporary-attendance-summary"><h2>点名</h2>
    <div><strong>{formatSessionTimeRange(session.current_start_at, session.current_end_at)}</strong><span>{sessionStatusLabels[session.status]}{roster.isSuccess && ` · 已签到 ${signed} / ${enrollmentCount}`}</span></div>
    {roster.isLoading && <LoadingBlock />}{roster.isError && <ErrorBlock message="签到摘要载入失败。" />}
    <ContextLink backLabel="临时班" className="button button-primary" to={`/attendance/session/${session.id}`}>进入点名</ContextLink>
  </section>
}
