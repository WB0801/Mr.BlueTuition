import { Link, useLocation, useSearchParams } from 'react-router-dom'

export function GradesTabs({ active }: { active: 'school' | 'quizzes' }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()

  return (
    <nav className="grades-tabs" aria-label="成绩类别">
      <Link className={active === 'school' ? 'active' : ''} to={`/grades/school${query ? `?${query}` : ''}`} state={location.state}>学校考试</Link>
      <Link className={active === 'quizzes' ? 'active' : ''} to={`/grades/quizzes${query ? `?${query}` : ''}`} state={location.state}>补习班小测</Link>
    </nav>
  )
}
