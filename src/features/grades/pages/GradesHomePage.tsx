import { ContextLink } from '../../../components/navigation/ContextLink'
import { PageHeader } from '../../../components/shared/PageHeader'

export function GradesHomePage() {
  return (
    <section>
      <PageHeader title="成绩" />
      <div className="grade-entry-links">
        <ContextLink backLabel="成绩" className="grade-module-card" to="/grades/school">
          <strong>学校考试</strong>
          <span>记录学生在学校正式考试的成绩。</span>
        </ContextLink>
        <ContextLink backLabel="成绩" className="grade-module-card" to="/grades/quizzes">
          <strong>补习班小测</strong>
          <span>记录补习班自己进行的小测成绩。</span>
        </ContextLink>
      </div>
    </section>
  )
}
