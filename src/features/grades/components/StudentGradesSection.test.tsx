import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listStudentSchoolExamScores, listStudentTuitionQuizScores } from '../api/gradesService'
import { StudentGradesSection } from './StudentGradesSection'

vi.mock('../api/gradesService', () => ({
  listStudentSchoolExamScores: vi.fn(),
  listStudentTuitionQuizScores: vi.fn(),
  getStudentQuizRewardSummary: vi.fn().mockResolvedValue({ pending: [], progress: [], history: [] }),
}))

describe('StudentGradesSection', () => {
  it('keeps quiz percentages and list context in-place without additional score reads', async () => {
    vi.mocked(listStudentSchoolExamScores).mockResolvedValue([])
    vi.mocked(listStudentTuitionQuizScores).mockResolvedValue([
      { id: 'fraction', score: 1, quiz: { id: 'q1', name: '长中文三分小考', quiz_date: '2026-10-01', max_score: 3 } },
      { id: 'zero', score: 0, quiz: { id: 'q2', name: '零分小考', quiz_date: '2026-10-02', max_score: 20 } },
    ] as never)
    const router = createMemoryRouter([{ path: '/students/:studentId', element: <StudentGradesSection studentId="student-1" embedded /> }], { initialEntries: ['/students/student-1?panel=grades&grades.tab=quiz&fees.month=2026-09'] })
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
    const user = userEvent.setup()
    expect(await screen.findByText('1 / 3 · 33.3%')).toBeVisible()
    expect(screen.getByText('0 / 20 · 0%')).toBeVisible()
    const reads = vi.mocked(listStudentTuitionQuizScores).mock.calls.length
    await user.click(screen.getByRole('button', { name: /长中文三分小考/ }))
    const detail = screen.getByRole('heading', { name: '长中文三分小考' }).closest('section')!
    expect(within(detail).getByText('1 / 3 · 33.3%')).toBeVisible()
    expect(router.state.location.search).toContain('fees.month=2026-09')
    await user.click(screen.getByRole('button', { name: '← 返回成绩列表' }))
    expect(screen.getByRole('button', { name: /长中文三分小考/ })).toBeVisible()
    expect(vi.mocked(listStudentTuitionQuizScores).mock.calls.length).toBe(reads)
  })
  it('does not describe a rejected grade query as an empty grade history', async () => {
    vi.mocked(listStudentSchoolExamScores).mockRejectedValue(new Error('offline'))
    vi.mocked(listStudentTuitionQuizScores).mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter([{ path: '/', element: <StudentGradesSection studentId="a" embedded /> }])
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
    expect(await screen.findByText('成绩资料载入失败。')).toBeVisible()
    expect(screen.queryByText('目前没有学校成绩。')).not.toBeInTheDocument()
  })
  it('opens the actual zero score in-place and returns to the retained school list', async () => {
    vi.mocked(listStudentSchoolExamScores).mockResolvedValue([{ id: 'zero-score', score: 0, exam: { id: 'exam-zero', name: '零分考试', exam_date: '2026-06-01', max_score: 100 } }] as never)
    vi.mocked(listStudentTuitionQuizScores).mockResolvedValue([])
    const router = createMemoryRouter([{ path: '/students/:studentId', element: <StudentGradesSection studentId="student-1" embedded /> }], { initialEntries: ['/students/student-1?panel=grades'] })
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /零分考试/ }))
    expect(router.state.location.pathname).toBe('/students/student-1')
    expect(screen.getByRole('heading', { name: '零分考试' })).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: '零分考试' }).closest('section')!).getByText('0 / 100')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '← 返回成绩列表' }))
    expect(screen.getByRole('button', { name: /零分考试/ })).toBeVisible()
  })
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
