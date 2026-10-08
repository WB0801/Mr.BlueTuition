import { formatQuizPercentage, formatQuizScore } from './quizScoreDisplay'
import { calculateQuizTopThree } from './quizRanking'

describe('current quiz score display', () => {
  it.each([
    [14, 20, '14 / 20 · 70%'], [18, 30, '18 / 30 · 60%'],
    [1, 3, '1 / 3 · 33.3%'], [0, 20, '0 / 20 · 0%'],
    [2, 3, '2 / 3 · 66.7%'], [14.5, 20, '14.5 / 20 · 72.5%'],
    [20, 20, '20 / 20 · 100%'], [1.235, 100, '1.235 / 100 · 1.2%'],
    [1.25, 100, '1.25 / 100 · 1.3%'],
  ])('keeps raw %s / %s and only rounds its percentage', (score, max, expected) => {
    expect(formatQuizScore(score, max)).toBe(expected)
  })

  it.each(['', ' ', null, undefined, NaN, Infinity, -1, 21, 'abc', false, {}, 'Infinity'])('does not invent a percentage for invalid score %s', score => {
    expect(formatQuizPercentage(score, 20)).toBeNull()
  })

  it.each([null, undefined, NaN, Infinity, -Infinity, 0, -20, '', '20'])('rejects unreliable maximum %s', max => {
    expect(formatQuizPercentage(1, max)).toBeNull()
  })

  it('accepts valid raw entry text but distinguishes blank from actual zero', () => {
    expect(formatQuizPercentage(' 0 ', 20)).toBe('0%')
    expect(formatQuizPercentage('14', 20)).toBe('70%')
    expect(formatQuizScore(null, 20)).toBe('— / 20')
    expect(formatQuizScore(undefined, undefined)).toBe('— / —')
    expect(formatQuizScore(21, 20)).toBe('21 / 20')
  })

  it('does not merge rankings when different raw scores round to the same display', () => {
    const students = [
      { class_id: 'c', student_id: 'a', student_name: '甲', enrollment_id: 'ea', score: 14.001 },
      { class_id: 'c', student_id: 'b', student_name: '乙', enrollment_id: 'eb', score: 14.002 },
      { class_id: 'c', student_id: 'c', student_name: '丙', enrollment_id: 'ec', score: 10 },
      { class_id: 'c', student_id: 'd', student_name: '丁', enrollment_id: 'ed', score: 9 },
    ]
    expect(students.slice(0, 2).map(s => formatQuizPercentage(s.score, 20))).toEqual(['70%', '70%'])
    expect(calculateQuizTopThree(students, 20).map(s => [s.student_id, s.rank, s.score])).toEqual([
      ['b', 1, 14.002], ['a', 2, 14.001], ['c', 3, 10],
    ])
    expect(students[0].score).toBe(14.001)
  })
})
