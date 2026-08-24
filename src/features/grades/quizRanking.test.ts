import { calculateQuizTopThree, calculateQuizTopThreeByClass, oldestThree, rewardProgress } from './quizRanking'

const row = (student: string, score: number | null, classId = 'class-a') => ({
  class_id: classId,
  student_id: student,
  student_name: student,
  enrollment_id: `enrollment-${student}`,
  score,
})

describe('quiz top-three ranking', () => {
  it('selects a normal top three with competition ranks', () => {
    expect(calculateQuizTopThree([row('A', 100), row('B', 95), row('C', 90), row('D', 80)]))
      .toMatchObject([{ student_id: 'A', rank: 1 }, { student_id: 'B', rank: 2 }, { student_id: 'C', rank: 3 }])
  })

  it('includes everyone tied at the third-place cutoff', () => {
    expect(calculateQuizTopThree([row('A', 100), row('B', 95), row('C', 90), row('D', 90)]))
      .toMatchObject([
        { student_id: 'A', rank: 1 },
        { student_id: 'B', rank: 2 },
        { student_id: 'C', rank: 3 },
        { student_id: 'D', rank: 3 },
      ])
  })

  it.each([
    [[100, 100, 90], [1, 1, 3]],
    [[100, 90, 90], [1, 2, 2]],
  ])('uses competition ranking for tied first or second place', (scores, ranks) => {
    expect(calculateQuizTopThree(scores.map((score, index) => row(String(index), score))).map((item) => item.rank)).toEqual(ranks)
  })

  it('keeps all valid scores when fewer than three, excludes blanks, and includes zero', () => {
    expect(calculateQuizTopThree([row('A', 10), row('B', 0), row('C', null), row('D', Number.NaN)], 10))
      .toMatchObject([{ student_id: 'A', rank: 1 }, { student_id: 'B', rank: 2 }])
  })

  it('calculates classes independently', () => {
    const results = calculateQuizTopThreeByClass([
      row('A1', 100, 'a'), row('A2', 90, 'a'), row('A3', 80, 'a'), row('A4', 70, 'a'),
      row('B1', 60, 'b'), row('B2', 50, 'b'), row('B3', 40, 'b'), row('B4', 30, 'b'),
    ])
    expect(results.filter((item) => item.class_id === 'a')).toHaveLength(3)
    expect(results.filter((item) => item.class_id === 'b')).toHaveLength(3)
  })
})

describe('quiz reward progression', () => {
  it('reaches a first reward only on the third record (for example quizzes 1, 3 and 5)', () => {
    expect([1, 2, 3].map((count) => rewardProgress(count).rewardCount)).toEqual([0, 0, 1])
  })

  it('preserves extras for four and six unredeemed records', () => {
    expect(rewardProgress(4)).toEqual({ rewardCount: 1, remainder: 1 })
    expect(rewardProgress(6)).toEqual({ rewardCount: 2, remainder: 0 })
  })

  it('chooses the oldest three records for one reward', () => {
    const records = [
      { record_id: '3', quiz_date: '2026-08-05', confirmed_at: '2026-08-05T10:00:00Z' },
      { record_id: '1', quiz_date: '2026-08-01', confirmed_at: '2026-08-01T10:00:00Z' },
      { record_id: '4', quiz_date: '2026-08-07', confirmed_at: '2026-08-07T10:00:00Z' },
      { record_id: '2', quiz_date: '2026-08-03', confirmed_at: '2026-08-03T10:00:00Z' },
    ]
    expect(oldestThree(records).map((record) => record.record_id)).toEqual(['1', '2', '3'])
  })
})
