/** Display-only: raw scores remain the source of truth for saves and ranking. */
export function formatQuizPercentage(score: unknown, maxScore: unknown): string | null {
  if (typeof maxScore !== 'number' || !Number.isFinite(maxScore) || maxScore <= 0) return null
  if (typeof score !== 'number' && typeof score !== 'string') return null
  if (typeof score === 'string' && score.trim() === '') return null
  const numericScore = typeof score === 'number' ? score : Number(score.trim())
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > maxScore) return null
  const tenths = numericScore / maxScore * 1000
  const rounded = Math.round(tenths + Number.EPSILON * Math.abs(tenths)) / 10
  return `${rounded}%`
}

export function formatQuizScore(score: number | null | undefined, maxScore: number | null | undefined): string {
  const raw = `${score ?? '—'} / ${maxScore ?? '—'}`
  const percentage = formatQuizPercentage(score, maxScore)
  return percentage === null ? raw : `${raw} · ${percentage}`
}
