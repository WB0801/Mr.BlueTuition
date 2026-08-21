import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { TemporaryPaymentRow } from './TemporaryPaymentRow'

vi.mock('../api/temporaryClassesService', () => ({
  markTemporaryClassPaymentPaid: vi.fn(),
  undoTemporaryClassPayment: vi.fn(),
}))

describe('TemporaryPaymentRow', () => {
  it('shows student identity, amount, payment and receipt status together', () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TemporaryPaymentRow
            allowActions={false}
            enrollment={{
              id: 'enrollment-1', owner_id: 'owner', temporary_class_id: 'temp-1', student_id: 'student-1',
              joined_at: '', status: 'active', created_at: '',
              student: { id: 'student-1', name: '陈小明', school_class: '高一', phone: '012' },
              payment: {
                id: 'payment-1', owner_id: 'owner', temporary_class_enrollment_id: 'enrollment-1', amount: 50,
                payment_status: 'paid', paid_at: '2026-08-21T01:00:00Z', receipt_status: 'pending',
                receipt_completed_at: null, created_at: '', updated_at: '',
              },
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('link', { name: /陈小明/ })).toHaveAttribute('href', '/students/student-1')
    expect(screen.getByText('RM50')).toBeInTheDocument()
    expect(screen.getByText('已缴')).toBeInTheDocument()
    expect(screen.getByText('收据待处理')).toBeInTheDocument()
  })
})
