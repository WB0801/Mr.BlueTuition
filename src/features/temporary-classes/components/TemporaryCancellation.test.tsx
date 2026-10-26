import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { TemporaryPaymentRow } from './TemporaryPaymentRow'
import { updateProtection } from '../../settings/pwa/updateProtection'

const api = vi.hoisted(() => ({ cancel: vi.fn() }))
vi.mock('../api/temporaryClassesService', () => ({
  cancelTemporaryClassEnrollment: (...args: unknown[]) => api.cancel(...args),
  markTemporaryClassPaymentPaid: vi.fn(), undoTemporaryClassPayment: vi.fn(), updateTemporaryClassPaymentAmount: vi.fn(),
}))
const enrollment: TemporaryClassEnrollment = {
  id: 'e-old', owner_id: 'owner', temporary_class_id: 'temp', student_id: 's', status: 'active', joined_at: '', created_at: '',
  student: { id: 's', name: '虚构小明', school_class: null, phone: null },
  payment: { id: 'p-old', owner_id: 'owner', temporary_class_enrollment_id: 'e-old', amount: 30.25, payment_status: 'paid', paid_at: '2026-10-01T03:00:00Z', receipt_status: 'completed', receipt_completed_at: '2026-10-01T04:00:00Z', created_at: '', updated_at: '' },
}
function mount(row = enrollment) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const props = { enrollment: row, allowActions: true, allowAmountEdit: true, classNameForCancellation: '虚构数学临时班' }
  return render(<QueryClientProvider client={client}><MemoryRouter><TemporaryPaymentRow {...props} /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)
it('requires external full refund acknowledgement, retains confirmation on failure and reuses request ID on retry', async () => {
  api.cancel.mockRejectedValueOnce(new Error('Payment changed')).mockResolvedValue({ ...enrollment, status: 'cancelled' })
  mount()
  const trigger = screen.getByRole('button', { name: '退费并取消报名' })
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog')).toHaveTextContent('虚构小明')
  expect(screen.getByRole('dialog')).toHaveTextContent('RM30.25')
  const submit = screen.getByRole('button', { name: '已退费并取消报名' })
  expect(submit).toBeDisabled()
  expect(updateProtection.reason()).not.toBe('')
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(submit)
  await screen.findByRole('alert')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeChecked()
  fireEvent.click(submit)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.cancel).toHaveBeenCalledTimes(2)
  expect(api.cancel.mock.calls[0]).toEqual(api.cancel.mock.calls[1])
  expect(api.cancel.mock.calls[0][0]).toMatchObject({ id: 'e-old', payment: { id: 'p-old', amount: 30.25 } })
  expect(updateProtection.reason()).toBe('')
})
it('cancel/escape does not write, and a pending request cannot be submitted or closed twice', async () => {
  let resolve!: (value: unknown) => void
  api.cancel.mockImplementation(() => new Promise(done => { resolve = done }))
  mount({ ...enrollment, payment: { ...enrollment.payment!, payment_status: 'unpaid', paid_at: null, receipt_status: 'not_applicable', receipt_completed_at: null } })
  fireEvent.click(screen.getByRole('button', { name: '取消报名' }))
  fireEvent.click(screen.getByRole('button', { name: '暂不取消' }))
  expect(api.cancel).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消报名' }))
  fireEvent.click(screen.getByRole('button', { name: '确认取消报名' }))
  expect(await screen.findByRole('button', { name: '处理中…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '暂不取消' })).toBeDisabled()
  await waitFor(() => expect(api.cancel).toHaveBeenCalledTimes(1))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  resolve(enrollment)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})
it('cancelled paid history displays original fee and refund without exposing pay/undo/edit/cancel', () => {
  mount({ ...enrollment, status: 'cancelled', cancelled_at: '2026-10-02T00:00:00Z', payment: { ...enrollment.payment!, refunded_amount: 30.25, refunded_at: '2026-10-02T00:00:00Z' } })
  expect(screen.getByText('已退费')).toBeInTheDocument()
  expect(screen.getByText(/原缴费时间/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /撤销缴费|修改金额|取消报名|确认已缴/ })).toBeNull()
})
it('the historical pending receipt on a refunded payment is clearly distinguished from an actionable queue item',()=>{
  mount({...enrollment,status:'cancelled',payment:{...enrollment.payment!,receipt_status:'pending',refunded_at:'2026-10-02T00:00:00Z',refunded_amount:30.25}})
  expect(screen.getByText('原收据待处理（已移出队列）')).toBeInTheDocument()
})
it('a lost response preserves the confirmation and warns not to repeat the external refund',async()=>{
  api.cancel.mockRejectedValue(new TypeError('Failed to fetch'))
  mount();fireEvent.click(screen.getByRole('button',{name:'退费并取消报名'}));fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'已退费并取消报名'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('请勿重复退费')
  expect(screen.getByRole('checkbox')).toBeChecked()
  expect(screen.getByRole('button',{name:'已退费并取消报名'})).toBeEnabled()
})
