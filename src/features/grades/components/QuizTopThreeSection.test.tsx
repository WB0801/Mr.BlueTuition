import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { QuizTopThreePreview, TuitionQuiz } from '../../../types/domain'
import { confirmTuitionQuizTopThree, previewTuitionQuizTopThree } from '../api/gradesService'
import { QuizTopThreeSection } from './QuizTopThreeSection'

vi.mock('../api/gradesService', () => ({
  previewTuitionQuizTopThree: vi.fn(),
  confirmTuitionQuizTopThree: vi.fn(),
}))

const quiz = {
  id: 'quiz-1', owner_id: 'owner', class_id: 'class-1', name: '小测一', quiz_date: '2026-08-01', max_score: 100,
  created_at: '', updated_at: '', class: { id: 'class-1', owner_id: 'owner', subject_id: 'subject', name: '中一数学', weekday: 1, start_time: '10:00', end_time: '11:00', monthly_fee: 70, start_date: '2026-01-01', end_date: null, status: 'active', created_at: '', updated_at: '' },
} satisfies TuitionQuiz

const roster = [
  { student_id: 'student-1', student_name: '学生一', school_class: null, phone: null, enrollment_id: 'enrollment-1' },
  { student_id: 'student-2', student_name: '学生二', school_class: null, phone: null, enrollment_id: 'enrollment-2' },
  { student_id: 'student-3', student_name: '学生三', school_class: null, phone: null, enrollment_id: 'enrollment-3' },
  { student_id: 'student-4', student_name: '学生四', school_class: null, phone: null, enrollment_id: 'enrollment-4' },
]
const scores = [100, 90, 80].map((score, index) => ({
  id: `score-${index}`, owner_id: 'owner', quiz_id: 'quiz-1', student_id: `student-${index + 1}`,
  enrollment_id: `enrollment-${index + 1}`, score, created_at: '', updated_at: '',
}))

const preview = (overrides: Partial<QuizTopThreePreview> = {}): QuizTopThreePreview => ({
  quiz_id: 'quiz-1', class_id: 'class-1', confirmed: false, confirmed_at: null, needs_reconfirmation: false,
  roster_count: 4, score_count: 3,
  missing_students: [{ student_id: 'student-4', student_name: '学生四' }],
  candidates: scores.map((score, index) => ({ student_id: score.student_id, student_name: `学生${index + 1}`, enrollment_id: score.enrollment_id, rank: index + 1, score: score.score, unredeemed_after: index + 1 })),
  recorded: [], differences: { added: [], removed: [], changed: [] }, awarded_history_impact: 0,
  ...overrides,
})

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><QuizTopThreeSection quiz={quiz} roster={roster} scores={scores} /></MemoryRouter></QueryClientProvider>)
}

describe('QuizTopThreeSection', () => {
  it('adds percentages only to current candidates, not historical ranking differences', async () => {
    vi.mocked(previewTuitionQuizTopThree).mockResolvedValue(preview({
      needs_reconfirmation: true,
      differences: { added: [], removed: [{ student_id: 'old', student_name: '旧学生', rank: 3, score: 70 }], changed: [] },
    }))
    renderSection()
    expect(await screen.findByText('100 / 100 · 100%')).toBeVisible()
    expect(screen.getByText('90 / 100 · 90%')).toBeVisible()
    expect(await screen.findByText('移除：旧学生（原第3名，70分）')).toBeVisible()
    expect(confirmTuitionQuizTopThree).not.toHaveBeenCalled()
    expect(previewTuitionQuizTopThree).toHaveBeenCalledExactlyOnceWith('quiz-1')
  })
  beforeEach(() => {
    vi.mocked(previewTuitionQuizTopThree).mockResolvedValue(preview())
    vi.mocked(confirmTuitionQuizTopThree).mockResolvedValue(preview({ confirmed: true, missing_students: [] }))
  })

  it('shows blank-score warnings and requires a second explicit confirmation', async () => {
    const user = userEvent.setup()
    renderSection()
    expect(await screen.findByText(/仍有 1 位学生未输入成绩/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认本次前三名' }))
    const finalButton = screen.getByRole('button', { name: '确认写入排行榜' })
    expect(finalButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /仍然确认当前排名/ }))
    await user.click(finalButton)
    expect(confirmTuitionQuizTopThree).toHaveBeenCalledWith('quiz-1', { allowIncomplete: true, allowAwardedHistoryImpact: false })
  })

  it('warns after score changes and protects awarded history behind extra confirmation', async () => {
    vi.mocked(previewTuitionQuizTopThree).mockResolvedValue(preview({
      confirmed: true,
      needs_reconfirmation: true,
      missing_students: [],
      awarded_history_impact: 1,
      differences: { added: [{ student_id: 'student-4', student_name: '学生四', rank: 3, score: 80 }], removed: [], changed: [] },
    }))
    const user = userEvent.setup()
    renderSection()
    expect(await screen.findByText('成绩已变更，排行榜需要重新确认。确认前不会静默改变累计记录。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新计算排行榜' }))
    expect(screen.getByRole('button', { name: '确认写入排行榜' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /已发奖励历史会保留/ }))
    expect(screen.getByRole('button', { name: '确认写入排行榜' })).toBeEnabled()
  })
})
