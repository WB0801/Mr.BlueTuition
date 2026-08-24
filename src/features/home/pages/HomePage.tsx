import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, CardLink, Icon, SectionHeader, type AppIconName } from '../../../components/ui'
import { countPendingReceipts } from '../../fees/api/feesService'
import { countPendingQuizRewards } from '../../grades/api/gradesService'

interface HomeEntry {
  icon: AppIconName
  label: string
  path: string
  showsReceiptCount?: boolean
  showsRewardCount?: boolean
}

const commonEntries: HomeEntry[] = [
  { label: '点名', path: '/attendance', icon: 'attendance' },
  { label: '学生', path: '/students', icon: 'students' },
  { label: '班级', path: '/classes', icon: 'classes' },
]

const managementEntries: HomeEntry[] = [
  { label: '学费', path: '/fees', icon: 'fees', showsReceiptCount: true },
  { label: '成绩', path: '/grades', icon: 'grades', showsRewardCount: true },
  { label: '临时班', path: '/temporary-classes', icon: 'temporary' },
  { label: '设置', path: '/settings', icon: 'settings' },
]

export function HomePage() {
  const receiptCount = useQuery({ queryKey: ['pending-receipt-count'], queryFn: countPendingReceipts })
  const rewardCount = useQuery({ queryKey: ['pending-quiz-reward-count'], queryFn: countPendingQuizRewards })

  useEffect(() => {
    document.title = '蓝老师补习班'
  }, [])

  return (
    <section className="home-page">
      <h1 className="sr-only">蓝老师补习班</h1>
      <nav className="home-function-lobby" aria-label="主要功能">
        <section aria-labelledby="common-functions-title">
          <SectionHeader id="common-functions-title" title="常用" />
          <div className="home-grid home-grid-primary">
            {commonEntries.map((entry) => <HomeEntryCard entry={entry} key={entry.path} />)}
          </div>
        </section>

        <section aria-labelledby="management-functions-title">
          <SectionHeader id="management-functions-title" title="管理" />
          <div className="home-grid home-grid-management">
            {managementEntries.map((entry) => (
              <HomeEntryCard entry={entry} key={entry.path} receiptCount={receiptCount.data ?? 0} rewardCount={rewardCount.data ?? 0} />
            ))}
          </div>
        </section>
      </nav>
    </section>
  )
}

function HomeEntryCard({ entry, receiptCount = 0, rewardCount = 0 }: { entry: HomeEntry; receiptCount?: number; rewardCount?: number }) {
  return (
    <CardLink ariaLabel={entry.label} className="home-entry" to={entry.path}>
      <span className="entry-icon" aria-hidden="true"><Icon name={entry.icon} /></span>
      <span className="entry-content">
        <span className="entry-title-row">
          <span className="entry-label">{entry.label}</span>
          {entry.showsReceiptCount && receiptCount > 0 && <Badge tone="danger">待开收据 {receiptCount}</Badge>}
          {entry.showsRewardCount && rewardCount > 0 && <Badge tone="danger">待奖励 {rewardCount}</Badge>}
        </span>
      </span>
      <Icon className="entry-chevron" name="chevron-right" size={20} />
    </CardLink>
  )
}
