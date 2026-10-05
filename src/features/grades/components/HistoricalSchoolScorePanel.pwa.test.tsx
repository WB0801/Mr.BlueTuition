import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoricalSchoolScorePanel } from './HistoricalSchoolScorePanel'
import { listSchoolExamHistoricalCandidates, saveSchoolExamScores } from '../api/gradesService'
import { createFormProtection, updateProtection } from '../../settings/pwa/updateProtection'
vi.mock('../api/gradesService', () => ({ listSchoolExamHistoricalCandidates: vi.fn(), saveSchoolExamScores: vi.fn() }))
afterEach(cleanup)
it('protects actual history-score submission, clears a successful retained editor, and keeps a failed edit protected', async () => {
  vi.mocked(listSchoolExamHistoricalCandidates).mockResolvedValue([{ student_id: 'a', student_name: '隔离学生', school_class: null, phone: null }] as never)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HistoricalSchoolScorePanel examId="exam" maxScore={100} existingScores={{ a: 60 }} /></QueryClientProvider>)
  const protection = createFormProtection(document)
  fireEvent.change(screen.getByPlaceholderText('输入学生姓名'), { target: { value: '隔离' } })
  fireEvent.click(await screen.findByRole('button', { name: /隔离学生/ }))
  await act(async () => {})
  const score = screen.getByRole('spinbutton')
  fireEvent.change(score, { target: { value: '80' } }); expect(updateProtection.reason()).toContain('未保存')
  let finish!: () => void
  vi.mocked(saveSchoolExamScores).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }) as never)
  fireEvent.submit(score.closest('form')!); expect(updateProtection.reason()).toContain('保存')
  await act(async () => finish()); await waitFor(() => expect(screen.getByText('历史成绩已保存。')).toBeInTheDocument())
  expect(updateProtection.reason()).toBe('')
  fireEvent.change(score, { target: { value: '90' } }); vi.mocked(saveSchoolExamScores).mockRejectedValueOnce(new Error('隔离失败'))
  fireEvent.submit(score.closest('form')!); await screen.findByText('历史成绩保存失败，请重试。'); expect(updateProtection.reason()).toContain('未保存')
  protection.dispose()
})
