import { Badge } from '../ui'

interface StatusBadgeProps {
  status: 'active' | 'ended'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge className={`status-badge status-${status}`} tone={status === 'active' ? 'success' : 'neutral'}>
      {status === 'active' ? '进行中' : '已结束'}
    </Badge>
  )
}
