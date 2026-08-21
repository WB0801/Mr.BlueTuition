import { useQuery } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Badge } from '../../../components/ui'
import { formatMoney, formatSessionTimeRange } from '../../../utils/format'
import { listTemporaryClasses } from '../api/temporaryClassesService'
import {
  getTemporaryClassTiming,
  temporaryClassTimingLabel,
  temporaryClassTimingTone,
  temporaryPaymentLabel,
} from '../temporaryClassPresentation'

export function TemporaryClassesPage() {
  const active = useQuery({ queryKey: ['temporary-classes', 'active'], queryFn: () => listTemporaryClasses('active') })
  const ended = useQuery({ queryKey: ['temporary-classes', 'ended'], queryFn: () => listTemporaryClasses('ended') })

  return (
    <section>
      <PageHeader title="临时班" actions={<ContextLink backLabel="临时班" className="button button-primary" to="/temporary-classes/new">建立临时班</ContextLink>} />
      <section className="content-section temporary-current-section">
        <h2>目前临时班</h2>
        {active.isLoading && <LoadingBlock />}
        {active.isError && <ErrorBlock message="临时班载入失败。" />}
        {!active.isLoading && active.data?.length === 0 && <EmptyBlock message="目前没有进行中的临时班。" />}
        <div className="record-list">
          {active.data?.map((item) => <TemporaryClassCard item={item} key={item.id} />)}
        </div>
      </section>

      <details className="history-panel temporary-history-panel">
        <summary>已结束临时班（{ended.data?.length ?? 0}）</summary>
        {ended.isLoading && <LoadingBlock />}
        {ended.isError && <ErrorBlock message="历史临时班载入失败。" />}
        {!ended.isLoading && ended.data?.length === 0 && <EmptyBlock message="还没有已结束临时班。" />}
        <div className="record-list">
          {ended.data?.map((item) => <TemporaryClassCard item={item} key={item.id} />)}
        </div>
      </details>
    </section>
  )
}

function TemporaryClassCard({ item }: { item: Awaited<ReturnType<typeof listTemporaryClasses>>[number] }) {
  const timing = getTemporaryClassTiming(item)
  return (
    <ContextLink backLabel="临时班" className="record-card temporary-class-card" to={`/temporary-classes/${item.id}`}>
      <span className="record-main">
        <strong>{item.name}</strong>
        <span>{formatSessionTimeRange(item.start_at, item.end_at)}</span>
        <small>{item.subject?.name} · {item.enrollment_count} 人 · {formatMoney(item.fee_amount)} / 人</small>
      </span>
      <span className="temporary-class-card-status">
        <Badge tone={temporaryClassTimingTone(timing)}>{temporaryClassTimingLabel(timing)}</Badge>
        <span>{temporaryPaymentLabel({ paid: item.paid_count, unpaid: item.unpaid_count, total: item.enrollment_count })}</span>
      </span>
      <span className="chevron" aria-hidden="true">›</span>
    </ContextLink>
  )
}
