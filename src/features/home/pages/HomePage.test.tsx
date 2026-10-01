import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { HomePage } from './HomePage'
import { listStudents, listStudentsByIds } from '../../students/api/studentsService'
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }))
vi.mock('../../fees/api/feesService', () => ({ countPendingReceipts: vi.fn().mockResolvedValue(7) }))
vi.mock('../../grades/api/gradesService', () => ({ countPendingQuizRewards: vi.fn().mockResolvedValue(0) }))
vi.mock('../../students/api/studentsService', () => ({ listStudents: vi.fn(), listStudentsByIds: vi.fn() }))

function renderHome() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><HomePage /></MemoryRouter></QueryClientProvider>)
}
describe('daily home workflows', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(listStudentsByIds).mockResolvedValue([])
    vi.mocked(listStudents).mockImplementation(async (search) => [{ id: 'student-a', name: '蓝炜滨', school_class: '高一甲', phone: '012345', owner_id: 'owner', created_at: '', updated_at: '' }].filter((item) => item.name.includes(search ?? '')))
  })
  it('labels defaults, prioritizes recent UUIDs in viewing order, and searches beyond recents', async () => {
    localStorage.setItem('recent-students-v1:owner', JSON.stringify(['student-b', 'student-a']))
    vi.mocked(listStudentsByIds).mockResolvedValue([
      { id: 'student-a', name: '蓝炜滨', school_class: '高一甲', phone: null, owner_id: 'owner', created_at: '', updated_at: '' },
      { id: 'student-b', name: '蓝欣怡', school_class: '高一乙', phone: null, owner_id: 'owner', created_at: '', updated_at: '' },
    ])
    renderHome()
    expect(await screen.findByText('最近查看')).toBeInTheDocument()
    await screen.findByText('蓝欣怡')
    const identities = screen.getAllByRole('link', { name: /蓝.*高一/ })
    expect(identities[0]).toHaveAttribute('href', '/students/student-b')
    expect(listStudents).not.toHaveBeenCalled()
    await userEvent.setup().type(screen.getByRole('searchbox'), '炜滨')
    await screen.findByText('搜索结果')
    expect(listStudents).toHaveBeenCalledWith('炜滨', 40)
  })
  it('falls back to a labeled default if recent students no longer exist', async () => {
    localStorage.setItem('recent-students-v1:owner', JSON.stringify(['deleted-student']))
    renderHome()
    expect(await screen.findByText('默认学生')).toBeInTheDocument()
    expect(await screen.findByText('蓝炜滨')).toBeInTheDocument()
  })
  it('starts attendance and opens the actual receipt queue with the service count', async () => {
    renderHome()
    expect(screen.getByRole('link', { name: '开始点名' })).toHaveAttribute('href', '/attendance')
    expect(await screen.findByRole('link', { name: '待处理收据 7 张' })).toHaveAttribute('href', '/fees/receipts')
    expect(screen.queryByRole('link', { name: /^返回/ })).not.toBeInTheDocument()
  })
  it('shows default identities and carries a partial-name result only into student records', async () => {
    const user = userEvent.setup()
    renderHome()
    expect(await screen.findByText('蓝炜滨')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: '搜索学生' }), '炜滨')
    expect(await screen.findByText('蓝炜滨')).toBeInTheDocument()
    expect(listStudents).toHaveBeenCalledWith('炜滨', 40)
    expect(screen.getByRole('link', { name: /蓝炜滨.*高一甲/ })).toHaveAttribute('href', '/students/student-a')
    expect(screen.queryByRole('link', { name: '缴费记录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '全部缴费记录' })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '待奖励 0 份' })).toHaveAttribute('href', '/grades/rewards')
    expect(screen.queryByRole('button', { name: '确认已缴' })).not.toBeInTheDocument()
  })
})
