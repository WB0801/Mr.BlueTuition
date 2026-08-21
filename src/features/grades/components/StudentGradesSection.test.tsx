import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listStudentSchoolExamScores, listStudentTuitionQuizScores } from '../api/gradesService'
import { StudentGradesSection } from './StudentGradesSection'

vi.mock('../api/gradesService', () => ({
  listStudentSchoolExamScores: vi.fn(),
  listStudentTuitionQuizScores: vi.fn(),
}))

describe('StudentGradesSection', () => {
  it('switches grade tabs, preserves the student URL and returns from a quiz to that student', async () => {
    const user = userEvent.setup()
    vi.mocked(listStudentSchoolExamScores).mockResolvedValue([{
      id: 'school-score', score: 0, exam: { id: 'exam-1', name: '期末考', exam_date: '2026-06-01', max_score: 100, year: 2026 },
    }] as never)
    vi.mocked(listStudentTuitionQuizScores).mockResolvedValue([{
      id: 'quiz-score', score: 8, quiz: { id: 'quiz-1', name: '第一课小测', quiz_date: '2026-06-02', max_score: 10 },
    }] as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter([
      { path: '/students/:studentId', element: <StudentGradesSection studentId="student-1" /> },
      { path: '/grades/quizzes/:quizId', element: <PageHeader title="小测" backTo="/grades/quizzes" backLabel="成绩" /> },
    ], { initialEntries: ['/students/student-1?profile=summary'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    expect(await screen.findByText('0 / 100')).toBeInTheDocument()
    expect(screen.queryByText('第一课小测')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '补习班小测' }))
    expect(await screen.findByText('第一课小测')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?profile=summary&gradeTab=quiz')

    await user.click(screen.getByRole('link', { name: /第一课小测/ }))
    expect(screen.getByRole('link', { name: '返回学生' })).toHaveAttribute('href', '/students/student-1?profile=summary&gradeTab=quiz')
  })
})
