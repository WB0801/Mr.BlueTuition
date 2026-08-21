import { describe, expect, it } from 'vitest'
import type { SchoolExam, TuitionQuiz } from '../../types/domain'
import { buildSchoolExamOverviews, buildTuitionQuizOverviews, scoreProgressLabel } from './gradeOverview'

describe('grade overview progress', () => {
  it('derives school-exam progress from subject enrollment history without confusing a zero score with blank', () => {
    const exams = [{ id: 'exam-1', subject_id: 'subject-1' }] as SchoolExam[]
    const result = buildSchoolExamOverviews(
      exams,
      [{ parent_id: 'exam-1', student_id: 'student-1' }],
      [
        { student_id: 'student-1', class_id: 'class-1', subject_id: 'subject-1', join_date: '2025-01-01', end_date: null },
        { student_id: 'student-2', class_id: 'class-old', subject_id: 'subject-1', join_date: '2024-01-01', end_date: '2024-12-31' },
      ],
    )

    expect(result[0]).toMatchObject({ recorded: 1, total: 2, status: 'partial' })
    expect(scoreProgressLabel(result[0])).toBe('已录入部分')
  })

  it('uses the quiz date roster rather than the current class roster', () => {
    const quizzes = [{ id: 'quiz-1', class_id: 'class-1', quiz_date: '2026-03-15' }] as TuitionQuiz[]
    const result = buildTuitionQuizOverviews(
      quizzes,
      [
        { parent_id: 'quiz-1', student_id: 'student-old' },
        { parent_id: 'quiz-1', student_id: 'student-active' },
      ],
      [
        { student_id: 'student-old', class_id: 'class-1', join_date: '2026-01-01', end_date: '2026-03-31' },
        { student_id: 'student-active', class_id: 'class-1', join_date: '2026-01-01', end_date: null },
        { student_id: 'student-later', class_id: 'class-1', join_date: '2026-04-01', end_date: null },
      ],
    )

    expect(result[0]).toMatchObject({ recorded: 2, total: 2, status: 'complete' })
    expect(scoreProgressLabel(result[0])).toBe('已完成')
  })
})
