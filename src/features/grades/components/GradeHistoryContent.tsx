import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock } from '../../../components/feedback/QueryState'
import type { SchoolExamScore, TuitionQuizScore } from '../../../types/domain'
import { formatDate } from '../../../utils/format'

interface GradeHistoryContentProps {
  schoolScores: SchoolExamScore[]
  quizScores: TuitionQuizScore[]
  schoolLoading?: boolean
  quizLoading?: boolean
  showContext?: boolean
  quizEmptyMessage?: string
  activeSection?: 'school' | 'quiz' | 'all'
  backLabel?: string
}

export function GradeHistoryContent({
  schoolScores,
  quizScores,
  schoolLoading = false,
  quizLoading = false,
  showContext = false,
  quizEmptyMessage = '目前没有小测成绩。',
  activeSection = 'all',
  backLabel = '学生',
}: GradeHistoryContentProps) {
  const sortedSchoolScores = [...schoolScores].sort((left, right) => (
    (right.exam?.exam_date ?? '').localeCompare(left.exam?.exam_date ?? '')
  ))
  const sortedQuizScores = [...quizScores].sort((left, right) => (
    (right.quiz?.quiz_date ?? '').localeCompare(left.quiz?.quiz_date ?? '')
  ))

  return (
    <>
      {(activeSection === 'school' || activeSection === 'all') && (
        <section className="grade-history-section">
          {activeSection === 'all' && <h3>学校考试</h3>}
          {!schoolLoading && sortedSchoolScores.length === 0 && <EmptyBlock message="目前没有学校成绩。" />}
          <div className="simple-grade-list">
            {sortedSchoolScores.map((score) => score.exam && (
              <ContextLink backLabel={backLabel} className="simple-grade-row" to={`/grades/school/${score.exam.id}`} key={score.id}>
                <span>
                  <small>{formatDate(score.exam.exam_date)}{showContext && score.exam.subject ? ` · ${score.exam.subject.name}` : ''}</small>
                  {score.exam.name}
                </span>
                <strong>{score.score} / {score.exam.max_score}</strong>
                <span className="chevron" aria-hidden="true">›</span>
              </ContextLink>
            ))}
          </div>
        </section>
      )}

      {(activeSection === 'quiz' || activeSection === 'all') && (
        <section className="grade-history-section">
          {activeSection === 'all' && <h3>补习班小测</h3>}
          {!quizLoading && sortedQuizScores.length === 0 && <EmptyBlock message={quizEmptyMessage} />}
          <div className="simple-grade-list">
            {sortedQuizScores.map((score) => score.quiz && (
              <ContextLink backLabel={backLabel} className="simple-grade-row" to={`/grades/quizzes/${score.quiz.id}`} key={score.id}>
                <span>
                  <small>{formatDate(score.quiz.quiz_date)}{showContext && score.quiz.class ? ` · ${score.quiz.class.name}` : ''}</small>
                  {score.quiz.name}
                </span>
                <strong>{score.score} / {score.quiz.max_score}</strong>
                <span className="chevron" aria-hidden="true">›</span>
              </ContextLink>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
