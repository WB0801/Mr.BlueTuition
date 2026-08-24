import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../../../components/ui'
import { countPendingQuizRewards } from '../api/gradesService'

export function GradesTabs({ active }: { active: 'school' | 'quizzes' | 'rewards' }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()
  const pendingRewards = useQuery({ queryKey: ['pending-quiz-reward-count'], queryFn: countPendingQuizRewards })

  return (
    <nav className="grades-tabs" aria-label="成绩类别">
      <Link className={active === 'school' ? 'active' : ''} to={`/grades/school${query ? `?${query}` : ''}`} state={location.state}>学校考试</Link>
      <Link className={active === 'quizzes' ? 'active' : ''} to={`/grades/quizzes${query ? `?${query}` : ''}`} state={location.state}>补习班小测</Link>
      <Link className={active === 'rewards' ? 'active' : ''} to={`/grades/rewards${query ? `?${query}` : ''}`} state={location.state}>
        前三名奖励 {pendingRewards.data ? <Badge tone="danger">待奖励 {pendingRewards.data}</Badge> : null}
      </Link>
    </nav>
  )
}
