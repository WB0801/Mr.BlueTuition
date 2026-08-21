import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { TemporaryClassDetailPage } from './TemporaryClassDetailPage'
import {
  getTemporaryClass,
  getTemporaryClassSession,
  listTemporaryClassEnrollments,
} from '../api/temporaryClassesService'
import { getSessionRoster } from '../../attendance/api/attendanceService'

vi.mock('../api/temporaryClassesService', () => ({
  endTemporaryClass: vi.fn(),
  getTemporaryClass: vi.fn(),
  getTemporaryClassSession: vi.fn(),
  listTemporaryClassEnrollments: vi.fn(),
}))
vi.mock('../../attendance/api/attendanceService', () => ({ getSessionRoster: vi.fn() }))
vi.mock('../components/TemporaryClassRegistrationPanel', () => ({
  TemporaryClassRegistrationPanel: () => <div>加入学生面板</div>,
}))
vi.mock('../components/TemporaryPaymentRow', () => ({
  TemporaryPaymentRow: ({ enrollment }: { enrollment: { student_id: string } }) => <div>学生 {enrollment.student_id}</div>,
}))

describe('TemporaryClassDetailPage', () => {
  it('shows core information and roster before attendance, with management actions later', async () => {
    vi.mocked(getTemporaryClass).mockResolvedValue({
      id: 'temp-1', owner_id: 'owner', subject_id: 'subject-1', name: '考前冲刺班',
      start_at: '2026-09-10T06:00:00Z', end_at: '2026-09-10T08:00:00Z', fee_amount: 50,
      status: 'active', created_at: '', updated_at: '', subject: { id: 'subject-1', name: '商业学' },
    })
    vi.mocked(getTemporaryClassSession).mockResolvedValue({
      id: 'session-1', status: 'scheduled', current_start_at: '2026-09-10T06:00:00Z', current_end_at: '2026-09-10T08:00:00Z',
    } as never)
    vi.mocked(listTemporaryClassEnrollments).mockResolvedValue([
      { id: 'enrollment-1', student_id: 'student-1', payment: { payment_status: 'paid' } },
      { id: 'enrollment-2', student_id: 'student-2', payment: { payment_status: 'unpaid' } },
    ] as never)
    vi.mocked(getSessionRoster).mockResolvedValue([{ attendance_record_id: 'attendance-1' }, { attendance_record_id: null }] as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/temporary-classes/temp-1']}>
          <Routes><Route path="/temporary-classes/:temporaryClassId" element={<TemporaryClassDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: '考前冲刺班' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2 已缴')).toBeInTheDocument()
    const rosterHeading = screen.getByRole('heading', { name: '学生名单 2 人' })
    const attendanceHeading = screen.getByRole('heading', { name: '点名' })
    expect(rosterHeading.compareDocumentPosition(attendanceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('加入学生面板')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '编辑临时班' })).toHaveAttribute('href', '/temporary-classes/temp-1/edit')
    expect(screen.getByRole('button', { name: '结束此班' })).toHaveClass('button-danger')
  })
})
