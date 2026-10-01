import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { Icon } from '../../../components/ui'
import { countPendingReceipts } from '../../fees/api/feesService'
import { countPendingQuizRewards } from '../../grades/api/gradesService'
import { GlobalStudentSearch } from '../../students/components/GlobalStudentSearch'

export function HomePage() {
  const receipts = useQuery({ queryKey: ['pending-receipt-count'], queryFn: countPendingReceipts })
  const rewards = useQuery({ queryKey: ['pending-quiz-reward-count'], queryFn: countPendingQuizRewards })
  useEffect(() => { document.title = '蓝老师补习班' }, [])
  return <section className="home-page daily-home">
    <h1>首页</h1>
    <div className="daily-actions context-home-actions">
      <ContextLink backLabel="首页" className="daily-attendance-action" to="/attendance">
        <Icon name="attendance" size={30} /><strong>开始点名</strong><Icon name="chevron-right" size={22} />
      </ContextLink>
      <ContextLink backLabel="首页" className="daily-receipt-action" to="/fees/receipts">
        <Icon name="fees" size={26} />
        <strong>{receipts.isLoading ? '读取待处理收据…' : receipts.isError ? '待处理收据暂时无法读取' : `待处理收据 ${receipts.data ?? 0} 张`}</strong>
        <Icon name="chevron-right" size={20} />
      </ContextLink>
      <ContextLink backLabel="首页" className="daily-receipt-action daily-reward-action" to="/grades/rewards">
        <Icon name="grades" size={26} />
        <strong>{rewards.isLoading ? '读取待奖励…' : rewards.isError ? '待奖励暂时无法读取' : `待奖励 ${rewards.data ?? 0} 份`}</strong>
        <Icon name="chevron-right" size={20} />
      </ContextLink>
    </div>
    <section className="home-student-search" aria-label="搜索学生与最近查看">
      <GlobalStudentSearch placeholder="搜索学生" />
    </section>
  </section>
}
