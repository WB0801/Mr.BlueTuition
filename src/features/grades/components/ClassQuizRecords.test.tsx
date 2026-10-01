import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ClassQuizRecords } from './ClassQuizRecords'
import { listTuitionQuizOverviews } from '../api/gradesService'
vi.mock('../api/gradesService', () => ({ listTuitionQuizOverviews: vi.fn(), listTuitionQuizRoster: vi.fn().mockResolvedValue([{ student_id: 'a', student_name: '学生甲', school_class: '高一', phone: null }]), listTuitionQuizScores: vi.fn().mockResolvedValue([{ student_id: 'a', score: 0 }]) }))
it('shows a scoped quiz and its real zero score in-place without loading another class', async () => {
  vi.mocked(listTuitionQuizOverviews).mockImplementation(async classId => classId === 'a' ? [{ id: 'quiz-a', class_id: 'a', name: '会计小测', quiz_date: '2025-08-01', max_score: 100, recorded: 1, total: 1, status: 'complete' }] as never : [])
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/classes/a?panel=grades']}><ClassQuizRecords classId="a" active /></MemoryRouter></QueryClientProvider>)
  await userEvent.setup().click(await screen.findByRole('button', { name: /会计小测/ }))
  expect(await screen.findByText('0 / 100')).toBeVisible()
  expect(screen.getByRole('link', { name: /学生甲/ })).toHaveAttribute('href', '/students/a')
  expect(screen.getByRole('link', { name: '录入成绩与奖励管理' })).toHaveAttribute('href', '/grades/quizzes/quiz-a')
  await userEvent.setup().click(screen.getByRole('button', { name: '← 返回小测列表' }))
  expect(screen.getByRole('button', { name: /会计小测/ })).toBeVisible()
})
