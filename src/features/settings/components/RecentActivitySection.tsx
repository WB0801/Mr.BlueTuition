import { useQuery } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatMalaysiaDateTime } from '../../../utils/format'
import { getRecentActivityLogs } from '../api/settingsService'

export function RecentActivitySection({ standalone = false }: { standalone?: boolean }) {
  const activity = useQuery({ queryKey: ['activity-logs', 'recent'], queryFn: getRecentActivityLogs })

  const content = (
    <>
      {activity.isLoading && <LoadingBlock message="正在载入最近操作…" />}
      {activity.isError && <ErrorBlock message="最近操作载入失败。" />}
      {activity.data?.length === 0 && <EmptyBlock message="目前还没有操作记录。" />}
      {activity.data && activity.data.length > 0 && (
        <div className="settings-activity-list">
          {activity.data.map((entry) => (
            <div key={entry.id}>
              <time dateTime={entry.created_at}>{formatMalaysiaDateTime(entry.created_at)}</time>
              <span>{entry.description}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )

  if (standalone) return <section className="settings-activity-page">{content}</section>

  return (
    <details className="content-section settings-activity-section">
      <summary>最近操作</summary>
      {content}
    </details>
  )
}
