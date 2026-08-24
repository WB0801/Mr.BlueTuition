export interface QuizRankingInput {
  class_id: string
  student_id: string
  student_name: string
  enrollment_id: string
  score: number | null | undefined
}

export interface QuizRankingResult extends Omit<QuizRankingInput, 'score'> {
  score: number
  rank: number
}

export function calculateQuizTopThree(
  rows: QuizRankingInput[],
  maxScore = Number.POSITIVE_INFINITY,
): QuizRankingResult[] {
  const valid = rows
    .filter((row): row is QuizRankingInput & { score: number } => (
      typeof row.score === 'number'
      && Number.isFinite(row.score)
      && row.score >= 0
      && row.score <= maxScore
    ))
    .sort((left, right) => (
      right.score - left.score
      || left.student_name.localeCompare(right.student_name, 'zh-Hans')
      || left.student_id.localeCompare(right.student_id)
    ))

  if (valid.length === 0) return []
  const cutoff = valid[Math.min(2, valid.length - 1)].score
  return valid
    .filter((row) => row.score >= cutoff)
    .map((row) => ({
      class_id: row.class_id,
      student_id: row.student_id,
      student_name: row.student_name,
      enrollment_id: row.enrollment_id,
      score: row.score,
      rank: 1 + valid.filter((candidate) => candidate.score > row.score).length,
    }))
}

export function calculateQuizTopThreeByClass(
  rows: QuizRankingInput[],
  maxScore = Number.POSITIVE_INFINITY,
) {
  const classIds = [...new Set(rows.map((row) => row.class_id))]
  return classIds.flatMap((classId) => calculateQuizTopThree(
    rows.filter((row) => row.class_id === classId),
    maxScore,
  ))
}

export function rewardProgress(unredeemedCount: number) {
  const safeCount = Math.max(0, Math.trunc(unredeemedCount))
  return {
    rewardCount: Math.floor(safeCount / 3),
    remainder: safeCount % 3,
  }
}

export function oldestThree<T extends { quiz_date: string; confirmed_at: string; record_id: string }>(records: T[]) {
  return [...records].sort((left, right) => (
    left.quiz_date.localeCompare(right.quiz_date)
    || left.confirmed_at.localeCompare(right.confirmed_at)
    || left.record_id.localeCompare(right.record_id)
  )).slice(0, 3)
}
