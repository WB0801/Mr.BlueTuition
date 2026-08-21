import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { PageHeader } from '../../../components/shared/PageHeader'
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
    render(<MemoryRouter initialEntries={['/students/student-1']}><GradeHistoryContent schoolScores={schoolScores} quizScores={quizScores} showContext /></MemoryRouter>)

    const schoolLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/grades/school/'))
    expect(schoolLinks[0]).toHaveTextContent('第二次段考')
    expect(schoolLinks[0]).toHaveTextContent('80 / 100')
    expect(schoolLinks[0]).toHaveAttribute('href', '/grades/school/exam-new')
    expect(schoolLinks[0]).toHaveTextContent('会计学')
    expect(screen.getByRole('link', { name: /Depreciation/ })).toHaveTextContent('高一会计学（1）')
    expect(screen.getByText('16 / 20')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Depreciation/ })).toHaveAttribute('href', '/grades/quizzes/quiz-1')
  })

  it('returns from an exam to the student who opened it', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([
      { path: '/students/:studentId', element: <GradeHistoryContent schoolScores={schoolScores} quizScores={[]} showContext /> },
      { path: '/grades/school/:examId', element: <PageHeader title="考试" backTo="/grades/school" backLabel="成绩" /> },
    ], { initialEntries: ['/students/student-1?gradeTab=school'] })
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: /第二次段考/ }))

    expect(screen.getByRole('link', { name: '返回学生' })).toHaveAttribute('href', '/students/student-1?gradeTab=school')
  })
})
