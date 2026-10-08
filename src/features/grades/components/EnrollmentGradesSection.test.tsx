import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EnrollmentGradesSection } from './EnrollmentGradesSection'
import { listEnrollmentTuitionQuizScores, listStudentSchoolExamScores } from '../api/gradesService'

vi.mock('../api/gradesService', () => ({ listEnrollmentTuitionQuizScores: vi.fn(), listStudentSchoolExamScores: vi.fn() }))

it('uses the enrolled quiz maximum with the original enrollment-scoped single read', async () => {
  vi.mocked(listStudentSchoolExamScores).mockResolvedValue([])
  vi.mocked(listEnrollmentTuitionQuizScores).mockResolvedValue([{ id: 'score', score: 18, quiz: { id: 'quiz', name: '报读小考', quiz_date: '2026-10-01', max_score: 30 } }] as never)
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><EnrollmentGradesSection enrollment={{ id: 'enrollment-a', student_id: 'student-a', class: { subject_id: 'subject-a' } } as never} /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('18 / 30 · 60%')).toBeVisible()
  expect(listEnrollmentTuitionQuizScores).toHaveBeenCalledExactlyOnceWith('enrollment-a')
  expect(listStudentSchoolExamScores).toHaveBeenCalledExactlyOnceWith('student-a', 'subject-a')
})
