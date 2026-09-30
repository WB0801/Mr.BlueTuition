import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { MonthlyFeeDetails, TuitionClass } from '../../../types/domain'
import { listClasses } from '../../classes/api/classesService'
import { ensureMonthlyFees, listMonthlyFees, markMonthlyFeePaid } from '../api/feesService'
import { MonthlyFeesPage } from './MonthlyFeesPage'

vi.mock('../../classes/api/classesService', () => ({ listClasses: vi.fn() }))
vi.mock('../api/feesService', () => ({
  ensureMonthlyFees: vi.fn(),
  listMonthlyFees: vi.fn(),
  markMonthlyFeePaid: vi.fn(),
  undoMonthlyFeePayment: vi.fn(),
  updateMonthlyFeeAmount: vi.fn(),
  waiveMonthlyFee: vi.fn(),
}))

const classes = [
  { id: 'class-a', name: '会计 A', status: 'active' },
  { id: 'class-b', name: '数学 B', status: 'active' },
] as TuitionClass[]

function fee(id: string, name: string, classId: string, payment: 'unpaid' | 'paid', receipt: 'not_applicable' | 'pending' | 'completed', paidAt: string | null): MonthlyFeeDetails {
  return {
    id, owner_id: 'owner', student_id: `student-${id}`, enrollment_id: `enrollment-${id}`,
    fee_month: '2026-08-01', normal_amount: 70, actual_amount: 70, payment_status: payment,
    paid_at: paidAt, receipt_status: receipt, receipt_completed_at: receipt === 'completed' ? paidAt : null,
    created_at: id, updated_at: id,
    student: { id: `student-${id}`, name, school_class: null, phone: null },
    enrollment: { id: `enrollment-${id}`, class_id: classId, join_date: '2026-01-01', end_date: null, status: 'active', class: { id: classId, name: classes.find((item) => item.id === classId)!.name, status: 'active' } },
  }
}

const baseFeeRows = [
  fee('1', '陈小明', 'class-a', 'unpaid', 'not_applicable', null),
  fee('2', '王小芳', 'class-b', 'unpaid', 'not_applicable', null),
  fee('3', '待收据较早', 'class-a', 'paid', 'pending', '2026-08-02T00:00:00Z'),
  fee('4', '待收据较晚', 'class-a', 'paid', 'pending', '2026-08-03T00:00:00Z'),
  fee('5', '已处理', 'class-a', 'paid', 'completed', '2026-08-04T00:00:00Z'),
]
let feeRows = baseFeeRows.map((item) => ({ ...item }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function renderPage(initialEntry = '/fees') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MonthlyFeesPage view="current" />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MonthlyFeesPage workflow', () => {
  beforeEach(() => {
    feeRows = baseFeeRows.map((item) => ({ ...item }))
    vi.mocked(ensureMonthlyFees).mockResolvedValue({ created_count: 0 })
    vi.mocked(listClasses).mockResolvedValue(classes)
    vi.mocked(listMonthlyFees).mockImplementation(async (filters) => feeRows.filter((item) => (!filters?.classId || item.enrollment?.class_id === filters.classId) && (!filters?.studentId || item.student_id === filters.studentId)))
    vi.mocked(markMonthlyFeePaid).mockImplementation(async (feeId) => {
      const target = feeRows.find((item) => item.id === feeId)!
      const updated = { ...target, payment_status: 'paid' as const, receipt_status: 'pending' as const, paid_at: '2026-08-05T00:00:00Z' }
      feeRows = feeRows.map((item) => item.id === feeId ? updated : item)
      return updated
    })
  })

  it('defaults to current month, all classes, and unpaid only', async () => {
    renderPage('/fees?month=2026-08')
    expect(await screen.findByText('陈小明')).toBeInTheDocument()
    expect(screen.getByText('王小芳')).toBeInTheDocument()
    expect(screen.queryByText('待收据较早')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /未缴 2/ })).toHaveClass('active')
    expect(screen.getByRole('combobox', { name: '班级' })).toHaveValue('')
  })

  it('locates the exact receipt payment and can return to the ordinary filtered list', async () => {
    renderPage('/fees?month=2026-08&status=paid&feeId=3')
    expect(await screen.findByText('待收据较早')).toBeInTheDocument()
    expect(screen.queryByText('待收据较晚')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '显示此范围全部缴费记录' }))
    expect(await screen.findByText('待收据较晚')).toBeInTheDocument()
  })

  it('keeps class and status filters in the URL and shows paid receipt groups in order', async () => {
    const user = userEvent.setup()
    renderPage('/fees?month=2026-08')
    await screen.findByText('陈小明')
    await user.selectOptions(screen.getByRole('combobox', { name: '班级' }), 'class-a')
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('classId=class-a'))
    await user.click(within(screen.getByLabelText('缴费状态')).getByRole('button', { name: /已缴/ }))
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('status=paid'))
    const pending = screen.getByRole('heading', { name: /待开收据/ }).parentElement!
    expect(within(pending).getByRole('link', { name: /^待收据较早/ })).toBeInTheDocument()
    expect(within(pending).getByRole('link', { name: /^待收据较晚/ })).toBeInTheDocument()
    expect(pending.textContent?.indexOf('待收据较早')).toBeLessThan(pending.textContent?.indexOf('待收据较晚') ?? 0)
    expect(screen.getByRole('heading', { name: /收据已处理/ })).toBeInTheDocument()
  })

  it('removes a successful payment from the unpaid list without switching tabs', async () => {
    const user = userEvent.setup()
    renderPage('/fees?month=2026-08')
    const student = await screen.findByText('陈小明')
    const card = student.closest('article')!
    await user.click(within(card).getByRole('button', { name: '确认已缴' }))
    await waitFor(() => expect(screen.queryByText('陈小明')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /未缴/ })).toHaveClass('active')
  })

  it('opens all months for a home-selected student and pays the identified original fee', async () => {
    const user = userEvent.setup()
    const september = fee('new', '蓝炜滨', 'class-a', 'unpaid', 'not_applicable', null)
    const august = { ...fee('old', '蓝炜滨', 'class-b', 'paid', 'pending', '2026-08-05T00:00:00Z'), student_id: september.student_id, fee_month: '2026-07-01' }
    feeRows = [september, august]
    renderPage('/fees?studentId=student-new&month=all&status=all')
    await screen.findByText('蓝炜滨的缴费记录')
    expect(listMonthlyFees).toHaveBeenCalledWith({ feeMonth: undefined, classId: undefined, studentId: 'student-new' })
    expect(screen.getAllByText('蓝炜滨')).toHaveLength(2)
    const unpaidCard = screen.getByRole('button', { name: '确认已缴' }).closest('article')!
    expect(unpaidCard).toHaveTextContent('2026年8月')
    expect(unpaidCard).toHaveTextContent('会计 A')
    await user.click(within(unpaidCard).getByRole('button', { name: '确认已缴' }))
    expect(markMonthlyFeePaid).toHaveBeenCalledWith('new')
  })
})
