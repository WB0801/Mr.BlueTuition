import type { SchoolExam, TuitionQuiz } from '../../types/domain'

export interface ScoreProgressData {
  recorded: number
  total: number
  status: 'empty' | 'partial' | 'complete'
}

export type SchoolExamOverview = SchoolExam & ScoreProgressData
export type TuitionQuizOverview = TuitionQuiz & ScoreProgressData

interface EnrollmentSnapshot {
  student_id: string
  class_id: string
  subject_id?: string
  join_date: string
  end_date: string | null
}

interface ScoreSnapshot {
  parent_id: string
  student_id: string
}

export function scoreProgress(recorded: number, total: number): ScoreProgressData {
  const safeRecorded = Math.max(0, recorded)
  const safeTotal = Math.max(0, total)
  return {
    recorded: safeRecorded,
    total: safeTotal,
    status: safeRecorded === 0 ? 'empty' : safeTotal > 0 && safeRecorded >= safeTotal ? 'complete' : 'partial',
  }
}

export function buildSchoolExamOverviews(
  exams: SchoolExam[],
  scores: ScoreSnapshot[],
  enrollments: EnrollmentSnapshot[],
): SchoolExamOverview[] {
  return exams.map((exam) => {
    const eligible = new Set(
      enrollments.filter((item) => item.subject_id === exam.subject_id).map((item) => item.student_id),
    )
    const recorded = new Set(
      scores.filter((item) => item.parent_id === exam.id).map((item) => item.student_id),
    )
    return { ...exam, ...scoreProgress(recorded.size, eligible.size) }
  })
}

export function buildTuitionQuizOverviews(
  quizzes: TuitionQuiz[],
  scores: ScoreSnapshot[],
  enrollments: EnrollmentSnapshot[],
): TuitionQuizOverview[] {
  return quizzes.map((quiz) => {
    const eligible = new Set(enrollments
      .filter((item) => item.class_id === quiz.class_id
        && item.join_date <= quiz.quiz_date
        && (item.end_date === null || item.end_date >= quiz.quiz_date))
      .map((item) => item.student_id))
    const recorded = new Set(
      scores.filter((item) => item.parent_id === quiz.id).map((item) => item.student_id),
    )
    return { ...quiz, ...scoreProgress(recorded.size, eligible.size) }
  })
}

export function scoreProgressLabel(progress: ScoreProgressData) {
  if (progress.status === 'complete') return '已完成'
  if (progress.status === 'partial') return '已录入部分'
  return '尚未录入'
}
