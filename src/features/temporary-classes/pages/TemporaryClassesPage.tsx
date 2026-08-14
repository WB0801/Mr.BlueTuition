import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { StatusBadge } from '../../../components/shared/StatusBadge'
import { formatMoney, formatSessionTimeRange } from '../../../utils/format'
import { listTemporaryClasses } from '../api/temporaryClassesService'

export function TemporaryClassesPage() {
  const active = useQuery({ queryKey: ['temporary-classes', 'active'], queryFn: () => listTemporaryClasses('active') })
  const ended = useQuery({ queryKey: ['temporary-classes', 'ended'], queryFn: () => listTemporaryClasses('ended') })

  return (
    <section>
      <PageHeader title="临时班" actions={<Link className="button button-primary" to="/temporary-classes/new">建立临时班</Link>} />
      <section className="content-section">
        <h2>进行中</h2>
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
  return (
    <Link className="record-card temporary-class-card" to={`/temporary-classes/${item.id}`}>
      <span className="record-main">
        <strong>{item.name}</strong>
        <span>{formatSessionTimeRange(item.start_at, item.end_at)}</span>
        <small>{formatMoney(item.fee_amount)} / 人 · 报名 {item.enrollment_count} 人</small>
      </span>
      <StatusBadge status={item.status} />
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  )
}
