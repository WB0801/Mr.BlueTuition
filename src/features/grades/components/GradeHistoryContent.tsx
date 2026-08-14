import type { SchoolExamScore, TuitionQuizScore } from '../../../types/domain'
import { EmptyBlock } from '../../../components/feedback/QueryState'
import { formatDate } from '../../../utils/format'

interface GradeHistoryContentProps {
  schoolScores: SchoolExamScore[]
  quizScores: TuitionQuizScore[]
  schoolLoading?: boolean
  quizLoading?: boolean
  showContext?: boolean
  quizEmptyMessage?: string
}

export function GradeHistoryContent({
  schoolScores,
  quizScores,
  schoolLoading = false,
  quizLoading = false,
  showContext = false,
  quizEmptyMessage = '目前没有小测成绩。',
}: GradeHistoryContentProps) {
  const sortedSchoolScores = [...schoolScores].sort((left, right) => (
    (right.exam?.exam_date ?? '').localeCompare(left.exam?.exam_date ?? '')
  ))
  const schoolByYear = sortedSchoolScores.reduce<Record<string, typeof sortedSchoolScores>>((groups, score) => {
    const year = String(score.exam?.year ?? '')
    groups[year] = [...(groups[year] ?? []), score]
    return groups
  }, {})
  const sortedQuizScores = [...quizScores].sort((left, right) => (
    (right.quiz?.quiz_date ?? '').localeCompare(left.quiz?.quiz_date ?? '')
  ))
  const latestSchoolScore = sortedSchoolScores[0]

  return (
    <>
      <section className="grade-history-section">
        <h3>学校成绩</h3>
        {latestSchoolScore?.exam && (
          <div className="latest-grade-card">
            <span>最近一次学校考试</span>
            <strong>{latestSchoolScore.exam.name}</strong>
            {showContext && latestSchoolScore.exam.subject && <small>{latestSchoolScore.exam.subject.name}</small>}
            <b>{latestSchoolScore.score} / {latestSchoolScore.exam.max_score}</b>
          </div>
        )}
        {!schoolLoading && sortedSchoolScores.length === 0 && <EmptyBlock message="目前没有学校成绩。" />}
        <div className="grade-year-groups">
          {Object.entries(schoolByYear).map(([year, scores]) => (
            <section key={year}>
              <h4>{year}</h4>
              <div className="simple-grade-list">
                {scores.map((score) => score.exam && (
                  <div key={score.id}>
                    <span>
                      {showContext && score.exam.subject && <small>{score.exam.subject.name}</small>}
                      {score.exam.name}
                    </span>
                    <strong>{score.score} / {score.exam.max_score}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="grade-history-section">
        <h3>补习班小测</h3>
        {!quizLoading && sortedQuizScores.length === 0 && <EmptyBlock message={quizEmptyMessage} />}
        <div className="simple-grade-list">
          {sortedQuizScores.map((score) => score.quiz && (
            <div key={score.id}>
              <span>
                <small>
                  {formatDate(score.quiz.quiz_date)}
                  {showContext && score.quiz.class ? ` · ${score.quiz.class.name}` : ''}
                </small>
                {score.quiz.name}
              </span>
              <strong>{score.score} / {score.quiz.max_score} · {formatPercentage(score.score, score.quiz.max_score)}</strong>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function formatPercentage(score: number, maxScore: number) {
  const percentage = (score / maxScore) * 100
  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(1)}%`
}
