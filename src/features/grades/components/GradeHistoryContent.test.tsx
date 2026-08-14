import { render, screen } from '@testing-library/react'
import type { SchoolExamScore, TuitionQuizScore } from '../../../types/domain'
import { GradeHistoryContent } from './GradeHistoryContent'

const schoolScores = [
  {
    id: 'score-old',
    score: 72,
    exam: { id: 'exam-old', name: '第一次段考', year: 2026, exam_date: '2026-04-10', max_score: 100, subject: { id: 'subject-1', name: '会计学' } },
  },
  {
    id: 'score-new',
    score: 80,
    exam: { id: 'exam-new', name: '第二次段考', year: 2026, exam_date: '2026-08-05', max_score: 100, subject: { id: 'subject-1', name: '会计学' } },
  },
] as SchoolExamScore[]

const quizScores = [{
  id: 'quiz-score',
  score: 16,
  quiz: {
    id: 'quiz-1',
    name: 'Depreciation',
    quiz_date: '2026-08-20',
    max_score: 20,
    class: { id: 'class-1', name: '高一会计学（1）' },
  },
}] as TuitionQuizScore[]

describe('GradeHistoryContent', () => {
  it('shows the latest exam by exam date and displays student-wide context', () => {
    render(<GradeHistoryContent schoolScores={schoolScores} quizScores={quizScores} showContext />)

    const latestCard = screen.getByText('最近一次学校考试').closest('.latest-grade-card')
    expect(latestCard).toHaveTextContent('第二次段考')
    expect(latestCard).toHaveTextContent('80 / 100')
    expect(screen.getAllByText('会计学').length).toBeGreaterThan(0)
    expect(screen.getByText('Depreciation').parentElement).toHaveTextContent('高一会计学（1）')
    expect(screen.getByText('16 / 20 · 80%')).toBeInTheDocument()
  })
})
