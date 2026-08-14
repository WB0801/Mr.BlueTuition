import { useQuery } from '@tanstack/react-query'
import type { EnrollmentDetails } from '../../../types/domain'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatDate } from '../../../utils/format'
import { listEnrollmentTuitionQuizScores, listStudentSchoolExamScores } from '../api/gradesService'

export function EnrollmentGradesSection({ enrollment }: { enrollment: EnrollmentDetails }) {
  const subjectId = enrollment.class?.subject_id ?? ''
  const schoolScores = useQuery({
    queryKey: ['grades', 'student', enrollment.student_id, 'subject', subjectId],
    queryFn: () => listStudentSchoolExamScores(enrollment.student_id, subjectId),
    enabled: Boolean(subjectId),
  })
  const quizScores = useQuery({
    queryKey: ['grades', 'enrollment', enrollment.id, 'quizzes'],
    queryFn: () => listEnrollmentTuitionQuizScores(enrollment.id),
  })
  const sortedSchoolScores = [...(schoolScores.data ?? [])].sort((left, right) => (
    (right.exam?.exam_date ?? '').localeCompare(left.exam?.exam_date ?? '')
  ))
  const schoolByYear = sortedSchoolScores.reduce<Record<string, typeof sortedSchoolScores>>((groups, score) => {
    const year = String(score.exam?.year ?? '')
    groups[year] = [...(groups[year] ?? []), score]
    return groups
  }, {})
  const sortedQuizScores = [...(quizScores.data ?? [])].sort((left, right) => (
    (right.quiz?.quiz_date ?? '').localeCompare(left.quiz?.quiz_date ?? '')
  ))
  const latestSchoolScore = sortedSchoolScores[0]

  return (
    <section className="content-section enrollment-grades" id="enrollment-grades">
      <h2>成绩</h2>
      {(schoolScores.isLoading || quizScores.isLoading) && <LoadingBlock />}
      {(schoolScores.isError || quizScores.isError) && <ErrorBlock message="成绩资料载入失败。" />}

      <section className="grade-history-section">
        <h3>学校成绩</h3>
        {latestSchoolScore && latestSchoolScore.exam && (
          <div className="latest-grade-card">
            <span>最近一次学校考试</span>
            <strong>{latestSchoolScore.exam.name}</strong>
            <b>{latestSchoolScore.score} / {latestSchoolScore.exam.max_score}</b>
          </div>
        )}
        {!schoolScores.isLoading && sortedSchoolScores.length === 0 && <EmptyBlock message="目前没有学校成绩。" />}
        <div className="grade-year-groups">
          {Object.entries(schoolByYear).map(([year, scores]) => (
            <section key={year}>
              <h4>{year}</h4>
              <div className="simple-grade-list">
                {scores.map((score) => score.exam && (
                  <div key={score.id}>
                    <span>{score.exam.name}</span>
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
        {!quizScores.isLoading && sortedQuizScores.length === 0 && <EmptyBlock message="这段报读目前没有小测成绩。" />}
        <div className="simple-grade-list">
          {sortedQuizScores.map((score) => score.quiz && (
            <div key={score.id}>
              <span>
                <small>{formatDate(score.quiz.quiz_date)}</small>
                {score.quiz.name}
              </span>
              <strong>{score.score} / {score.quiz.max_score} · {formatPercentage(score.score, score.quiz.max_score)}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function formatPercentage(score: number, maxScore: number) {
  const percentage = (score / maxScore) * 100
  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(1)}%`
}
