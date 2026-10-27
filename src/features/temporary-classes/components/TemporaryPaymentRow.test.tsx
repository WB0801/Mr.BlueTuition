import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { TemporaryPaymentRow } from './TemporaryPaymentRow'
import userEvent from '@testing-library/user-event'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { markTemporaryClassPaymentPaid } from '../api/temporaryClassesService'

vi.mock('../api/temporaryClassesService', () => ({
  markTemporaryClassPaymentPaid: vi.fn(),
  undoTemporaryClassPayment: vi.fn(),
}))

describe('TemporaryPaymentRow', () => {
  it('can explicitly collect again after a newer cross-entry undo without a stale confirmed action swallowing the click', async () => {
    vi.clearAllMocks()
    const payment = {id:'p',owner_id:'o',temporary_class_enrollment_id:'e',amount:40,payment_status:'unpaid',receipt_status:'not_applicable',paid_at:null,receipt_completed_at:null,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'} as const
    const enrollment={id:'e',owner_id:'o',temporary_class_id:'t',student_id:'s',joined_at:'',created_at:'',status:'active',student:{id:'s',name:'虚构甲',school_class:null,phone:null},payment} as TemporaryClassEnrollment
    vi.mocked(markTemporaryClassPaymentPaid).mockResolvedValue({...payment,payment_status:'paid',receipt_status:'pending',updated_at:'2026-10-27T01:00:00Z'})
    const client=new QueryClient(),content=(value:TemporaryClassEnrollment)=><QueryClientProvider client={client}><MemoryRouter><TemporaryPaymentRow enrollment={value} allowActions allowCancellation={false}/></MemoryRouter></QueryClientProvider>
    const view=render(content(enrollment)), user=userEvent.setup()
    await user.click(screen.getByRole('button',{name:'确认已缴'}));await screen.findByText('已缴')
    view.rerender(content({...enrollment,payment:{...payment,updated_at:'2026-10-27T01:01:00Z'}}))
    await user.click(await screen.findByRole('button',{name:'确认已缴'}))
    expect(markTemporaryClassPaymentPaid).toHaveBeenCalledTimes(2)
  })
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
