import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { MonthlyFeeCard } from './MonthlyFeeCard'

vi.mock('../api/feesService', () => ({
  markMonthlyFeePaid: vi.fn(),
  undoMonthlyFeePayment: vi.fn(),
  updateMonthlyFeeAmount: vi.fn(),
  waiveMonthlyFee: vi.fn(),
}))

const fee: MonthlyFeeDetails = {
  id: 'fee-1',
  owner_id: 'owner-1',
  student_id: 'student-1',
  enrollment_id: 'enrollment-1',
  fee_month: '2026-08-01',
  normal_amount: 100,
  actual_amount: 50,
  payment_status: 'unpaid',
  paid_at: null,
  receipt_status: 'not_applicable',
  receipt_completed_at: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  student: { id: 'student-1', name: '陈小明', school_class: '高一商仁', phone: '0123456789' },
  enrollment: {
    id: 'enrollment-1',
    class_id: 'class-1',
    join_date: '2026-08-20',
    end_date: null,
    status: 'active',
    class: { id: 'class-1', name: '高一会计学（1）', status: 'active' },
  },
}

function renderFee(value: MonthlyFeeDetails) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MonthlyFeeCard fee={value} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MonthlyFeeCard', () => {
  it('shows a join-month override without changing the normal amount', () => {
    renderFee(fee)
    expect(screen.getByText('RM50')).toBeInTheDocument()
    expect(screen.getByText('正常月费 RM100')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认已缴' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改本月金额' })).toBeInTheDocument()
  })

  it('clearly distinguishes a completed receipt and offers payment undo', () => {
    renderFee({
      ...fee,
      payment_status: 'paid',
      paid_at: '2026-09-05T02:00:00Z',
      receipt_status: 'completed',
      receipt_completed_at: '2026-09-06T02:00:00Z',
    })
    expect(screen.getByText('已缴 · 收据已处理')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销缴费' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认已缴' })).not.toBeInTheDocument()
  })
})
