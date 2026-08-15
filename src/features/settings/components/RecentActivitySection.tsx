import { useQuery } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatMalaysiaDateTime } from '../../../utils/format'
import { getRecentActivityLogs } from '../api/settingsService'

export function RecentActivitySection() {
  const activity = useQuery({ queryKey: ['activity-logs', 'recent'], queryFn: getRecentActivityLogs })

  return (
    <details className="content-section settings-activity-section">
      <summary>最近操作</summary>
      <p className="muted">显示最近 100 项，用来确认刚才的操作是否完成。</p>
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
    </details>
  )
}

