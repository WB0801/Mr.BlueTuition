import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TuitionQuizDetailPage } from './TuitionQuizDetailPage'
import { getTuitionQuiz, listTuitionQuizRoster, listTuitionQuizScores, previewTuitionQuizTopThree, saveTuitionQuizScores } from '../api/gradesService'

vi.mock('../api/gradesService', () => ({
  getTuitionQuiz: vi.fn().mockResolvedValue({ id: 'quiz', class_id: 'class', name: '百分比小考', quiz_date: '2026-10-01', max_score: 20 }),
  listTuitionQuizRoster: vi.fn().mockResolvedValue([{ student_id: 'student', enrollment_id: 'enrollment', student_name: '虚构学生', phone: null, school_class: null }]),
  listTuitionQuizScores: vi.fn().mockResolvedValue([{ student_id: 'student', score: 14 }]),
  saveTuitionQuizScores: vi.fn().mockResolvedValue(undefined),
  previewTuitionQuizTopThree: vi.fn(),
}))

it('enables live percentages on the real quiz page without additional reads or percentage fields', async () => {
  const router = createMemoryRouter([{ path: '/grades/quizzes/:quizId', element: <TuitionQuizDetailPage /> }], { initialEntries: ['/grades/quizzes/quiz'] })
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
  expect(await screen.findByText('/ 20 · 70%')).toBeVisible()
  expect(getTuitionQuiz).toHaveBeenCalledExactlyOnceWith('quiz')
  expect(listTuitionQuizRoster).toHaveBeenCalledExactlyOnceWith('quiz')
  expect(listTuitionQuizScores).toHaveBeenCalledExactlyOnceWith('quiz')
  expect(previewTuitionQuizTopThree).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '18' } })
  expect(screen.getByText('/ 20 · 90%')).toBeVisible()
  expect(screen.getByText('尚未保存')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '保存成绩' }))
  expect(await screen.findByText('成绩已保存。')).toBeVisible()
  expect(saveTuitionQuizScores).toHaveBeenCalledExactlyOnceWith('quiz', [{ student_id: 'student', enrollment_id: 'enrollment', score: 18 }])
})
