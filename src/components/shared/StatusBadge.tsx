interface StatusBadgeProps {
  status: 'active' | 'ended'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status}`}>
      {status === 'active' ? '进行中' : '已结束'}
    </span>
  )
}
