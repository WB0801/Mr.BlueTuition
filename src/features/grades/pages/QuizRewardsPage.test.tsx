import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { listClasses } from '../../classes/api/classesService'
import { countPendingQuizRewards, listQuizRewardOverview, markQuizRewardAwarded, reverseQuizReward } from '../api/gradesService'
import { QuizRewardsPage } from './QuizRewardsPage'

vi.mock('../../classes/api/classesService', () => ({ listClasses: vi.fn() }))
vi.mock('../api/gradesService', () => ({
  countPendingQuizRewards: vi.fn(),
  listQuizRewardOverview: vi.fn(),
  markQuizRewardAwarded: vi.fn(),
  reverseQuizReward: vi.fn(),
}))

const records = [1, 3, 5, 7].map((day, index) => ({
  record_id: `record-${index + 1}`,
  quiz_id: `quiz-${index + 1}`,
  quiz_name: `小测${index + 1}`,
  quiz_date: `2026-08-${String(day).padStart(2, '0')}`,
  rank: index + 1,
  score: 100 - index,
  confirmed_at: `2026-08-${String(day).padStart(2, '0')}T10:00:00Z`,
}))

function renderPage(entry = '/grades/rewards') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><QuizRewardsPage /></MemoryRouter></QueryClientProvider>)
}

describe('QuizRewardsPage', () => {
  beforeEach(() => {
    vi.mocked(listClasses).mockResolvedValue([])
    vi.mocked(countPendingQuizRewards).mockResolvedValue(1)
    vi.mocked(listQuizRewardOverview).mockResolvedValue({
      pending_count: 1,
      pending: [{ student_id: 'student', student_name: '学生甲', class_id: 'class', class_name: '数学班', unredeemed_count: 4, reward_count: 1, records }],
      progress: [],
      history: [],
    })
    vi.mocked(markQuizRewardAwarded).mockResolvedValue({ claim_id: 'claim', remaining_count: 1, idempotent: false })
    vi.mocked(reverseQuizReward).mockResolvedValue({ claim_id: 'claim', released_count: 3, idempotent: false })
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' })
  })

  it('shows one pending reward, the oldest three sources, and the remaining 1/3 before awarding', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('4 笔尚未兑换')).toBeInTheDocument()
    expect(screen.getByText('可领取 1 份')).toBeInTheDocument()
    expect(screen.getByText('小测1')).toBeInTheDocument()
    expect(screen.getByText('小测2')).toBeInTheDocument()
    expect(screen.getByText('小测3')).toBeInTheDocument()
    expect(screen.queryByText('小测4')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '标记已奖励' }))
    expect(screen.getByText(/发放后剩余 1\/3/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认已发奖励' }))
    expect(markQuizRewardAwarded).toHaveBeenCalledWith('student', 'class', '11111111-1111-4111-8111-111111111111')
  })

  it('keeps reversal behind a secondary tab and explicit second confirmation', async () => {
    vi.mocked(listQuizRewardOverview).mockResolvedValue({
      pending_count: 0,
      pending: [],
      progress: [],
      history: [{ claim_id: 'claim', student_id: 'student', student_name: '学生甲', class_id: 'class', class_name: '数学班', rewarded_at: '2026-08-24T10:00:00Z', status: 'awarded', reversed_at: null, records: records.slice(0, 3) }],
    })
    const user = userEvent.setup()
    renderPage('/grades/rewards?rewardTab=history')
    await screen.findByText('已发奖励')
    await user.click(screen.getByRole('button', { name: '撤销已发奖励' }))
    expect(screen.getByRole('button', { name: '确认撤销' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /确认要撤销/ }))
    await user.click(screen.getByRole('button', { name: '确认撤销' }))
    expect(reverseQuizReward).toHaveBeenCalledWith('claim')
  })
})
