import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { TemporaryClassesPage } from './TemporaryClassesPage'
import { listTemporaryClasses } from '../api/temporaryClassesService'

vi.mock('../api/temporaryClassesService', () => ({ listTemporaryClasses: vi.fn() }))

const mockList = vi.mocked(listTemporaryClasses)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><TemporaryClassesPage /></MemoryRouter></QueryClientProvider>)
}

describe('TemporaryClassesPage', () => {
  it('prioritises name, date, people and payment status in a compact list', async () => {
    mockList.mockImplementation(async (status) => status === 'active' ? [{
      id: 'temp-1', owner_id: 'owner-1', subject_id: 'subject-1', name: '商业学冲刺班',
      start_at: '2099-08-22T06:00:00.000Z', end_at: '2099-08-22T08:00:00.000Z', fee_amount: 40,
      status: 'active', created_at: '', updated_at: '', subject: { id: 'subject-1', name: '商业学' },
      enrollment_count: 3, paid_count: 2, unpaid_count: 1,
    }] : [])

    renderPage()

    expect(await screen.findByText('商业学冲刺班')).toBeInTheDocument()
    expect(screen.getByText(/商业学 · 3 人 · RM40/)).toBeInTheDocument()
    expect(screen.getByText('收费 2/3 已缴')).toBeInTheDocument()
    expect(screen.getByText('即将开始')).toBeInTheDocument()
  })
})
