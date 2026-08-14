export interface GradeStats {
  recorded: number
  total: number
  average: number | null
  highest: number | null
  lowest: number | null
}

export function validateScoreValue(value: string, maxScore: number) {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const score = Number(trimmed)
  if (!Number.isFinite(score)) return '成绩必须是数字。'
  if (score < 0) return '成绩不能小于 0。'
  if (score > maxScore) return `成绩不能超过满分 ${maxScore}。`
  return null
}

export function parseScoreColumnPaste(
  text: string,
  startIndex: number,
  rowCount: number,
  maxScore: number,
) {
  const normalized = text.replace(/\r/g, '')
  const values = normalized.split('\n')
  if (values.at(-1) === '') values.pop()

  if (values.length > rowCount - startIndex) {
    return {
      values: null,
      error: `粘贴了 ${values.length} 个成绩，但从当前位置起只有 ${rowCount - startIndex} 位学生。`,
    }
  }

  for (const value of values) {
    if (value.includes('\t')) {
      return { values: null, error: '请只复制一整列成绩，不要包含多列。' }
    }
    const error = validateScoreValue(value, maxScore)
    if (error) return { values: null, error }
  }

  return { values, error: null }
}

export function calculateGradeStats(values: string[], total: number): GradeStats {
  const scores = values
    .map((value) => value.trim())
    .filter((value) => value !== '')
    .map(Number)
    .filter(Number.isFinite)

  if (scores.length === 0) {
    return { recorded: 0, total, average: null, highest: null, lowest: null }
  }

  return {
    recorded: scores.length,
    total,
    average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
  }
}

export function scoreValuesEqual(left: Record<string, string>, right: Record<string, string>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => (left[key] ?? '').trim() === (right[key] ?? '').trim())
}
