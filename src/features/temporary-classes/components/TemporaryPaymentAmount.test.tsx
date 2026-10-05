import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { TemporaryPaymentRow } from './TemporaryPaymentRow'
import { createFormProtection, updateProtection } from '../../settings/pwa/updateProtection'
import * as service from '../api/temporaryClassesService'

vi.mock('../api/temporaryClassesService', () => ({
  listTemporaryClassEnrollments: vi.fn(), updateTemporaryClassPaymentAmount: vi.fn(),
  markTemporaryClassPaymentPaid: vi.fn(), undoTemporaryClassPayment: vi.fn(),
}))
const row = (id: string, amount = 40): TemporaryClassEnrollment => ({
  id: `en-${id}`, owner_id: 'owner', temporary_class_id: 'temp-a', student_id: id,
  status: 'active', joined_at: '', created_at: '', student: { id, name: `隔离学生${id}`, school_class: null, phone: null },
  payment: { id: `pay-${id}`, owner_id: 'owner', temporary_class_enrollment_id: `en-${id}`, amount,
    payment_status: 'unpaid', paid_at: null, receipt_status: 'not_applicable', receipt_completed_at: null, created_at: '', updated_at: '' },
})
let records: TemporaryClassEnrollment[], protection: ReturnType<typeof createFormProtection>
beforeEach(() => {
  vi.resetAllMocks(); records = [row('a'), row('b')]
  vi.mocked(service.listTemporaryClassEnrollments).mockImplementation(async () => structuredClone(records))
  vi.mocked(service.updateTemporaryClassPaymentAmount).mockImplementation(async (id, _classId, amount) => {
    const item = records.find(r => r.payment!.id === id)!; item.payment!.amount = amount
    return { ...item.payment! }
  })
})
afterEach(() => { cleanup(); protection?.dispose() })
function setup(allowAmountEdit = true, allowActions = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['temporary-classes', 'student', 'a'], ['previous snapshot'])
  client.setQueryData(['monthly-fees-generation', '2026-10-01'], 'untouched')
  function List() {
    const query = useQuery({ queryKey: ['temporary-class', 'temp-a', 'enrollments'], queryFn: () => service.listTemporaryClassEnrollments('temp-a') })
    return query.data?.map(enrollment => <TemporaryPaymentRow key={enrollment.id} enrollment={enrollment} allowActions={allowActions} allowAmountEdit={allowAmountEdit} />)
  }
  render(<QueryClientProvider client={client}><MemoryRouter><List /></MemoryRouter></QueryClientProvider>)
  protection = createFormProtection(document)
  return client
}
async function editor() {
  const trigger = (await screen.findAllByRole('button', { name: '修改金额' }))[0]
  fireEvent.click(trigger)
  return screen.getByRole('spinbutton', { name: '应缴金额' })
}
it('updates one existing payment, refreshes the student snapshot and never invalidates fee generation', async () => {
  const client = setup(), input = await editor()
  expect(input).toHaveValue(40); fireEvent.change(input, { target: { value: '30.25' } }); fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument())
  const articles = screen.getAllByRole('article')
  expect(within(articles[0]).getByText('RM30.25')).toBeInTheDocument()
  expect(within(articles[1]).getByText('RM40')).toBeInTheDocument()
  expect(service.updateTemporaryClassPaymentAmount).toHaveBeenCalledWith('pay-a', 'temp-a', 30.25)
  expect(client.getQueryState(['temporary-classes', 'student', 'a'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['monthly-fees-generation', '2026-10-01'])?.isInvalidated).toBe(false)
  expect(updateProtection.reason()).toBe('')
})
it('cancel preserves the payment and restores focus without a write', async () => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value: '10' } })
  expect(updateProtection.reason()).not.toBe(''); fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(service.updateTemporaryClassPaymentAmount).not.toHaveBeenCalled()
  expect(screen.getAllByText('RM40')).toHaveLength(2); expect(updateProtection.reason()).toBe('')
  expect(screen.getAllByRole('button', { name: '修改金额' })[0]).toHaveFocus()
})
it.each(['', '-1', '30.001', '1e2', '100000000'])('rejects invalid input %s before a write', async value => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value } }); fireEvent.submit(input.closest('form')!)
  expect(service.updateTemporaryClassPaymentAmount).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toBeInTheDocument()
})
it('zero remains unpaid and is not silently marked paid', async () => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value: '0' } }); fireEvent.submit(input.closest('form')!)
  await screen.findByText('RM0'); expect(records[0].payment!.payment_status).toBe('unpaid')
  expect(service.markTemporaryClassPaymentPaid).not.toHaveBeenCalled()
})
it('failed saving keeps the input protected and retry can succeed', async () => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value: '30' } })
  vi.mocked(service.updateTemporaryClassPaymentAmount).mockRejectedValueOnce(new Error('network failed'))
  fireEvent.submit(input.closest('form')!); await screen.findByRole('alert')
  expect(input).toHaveValue(30); expect(updateProtection.reason()).not.toBe('')
  fireEvent.submit(input.closest('form')!); await screen.findByText('RM30')
  await waitFor(() => expect(updateProtection.reason()).toBe(''))
})
it('retains edits made during submission and acknowledges only the submitted amount', async () => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value: '30' } })
  let finish!: () => void
  vi.mocked(service.updateTemporaryClassPaymentAmount).mockImplementationOnce(() => new Promise(resolve => { finish = () => {
    records[0].payment!.amount = 30; resolve({ ...records[0].payment! })
  } }))
  fireEvent.submit(input.closest('form')!); await waitFor(() => expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled())
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled(); expect(updateProtection.reason()).not.toBe('')
  fireEvent.change(input, { target: { value: '20' } }); await act(async () => finish())
  await waitFor(() => expect(screen.getByRole('button', { name: '保存金额' })).toBeEnabled())
  expect(input).toHaveValue(20); expect(updateProtection.reason()).not.toBe('')
  fireEvent.submit(input.closest('form')!); await screen.findByText('RM20'); await waitFor(() => expect(updateProtection.reason()).toBe(''))
})
it('refreshes an externally paid record without discarding its rejected draft', async () => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value: '30' } })
  records[0].payment = { ...records[0].payment!, payment_status: 'paid', paid_at: '2026-10-06T00:00:00Z', receipt_status: 'pending' }
  vi.mocked(service.updateTemporaryClassPaymentAmount).mockRejectedValueOnce({ message: 'Only unpaid temporary class payments can be changed' })
  fireEvent.submit(input.closest('form')!); expect(await screen.findByRole('alert')).toHaveTextContent('刷新')
  await screen.findByText('已缴'); expect(input).toHaveValue(30)
  expect(screen.getByRole('button', { name: '保存金额' })).toBeDisabled(); expect(updateProtection.reason()).not.toBe('')
})
it('offers no amount edit for an ended class', async () => {
  setup(false); await screen.findByText('隔离学生a'); expect(screen.queryByRole('button', { name: '修改金额' })).not.toBeInTheDocument()
})
it('offers no amount edit for paid payments', async () => {
  records.forEach(item => { item.payment!.payment_status = 'paid' })
  setup(); await screen.findByText('隔离学生a')
  expect(screen.queryByRole('button', { name: '修改金额' })).not.toBeInTheDocument()
})
it('offers no amount edit for readonly rows', async () => {
  setup(true, false); await screen.findByText('隔离学生a')
  expect(screen.queryByRole('button', { name: '修改金额' })).not.toBeInTheDocument()
})
it('explains a missing database prerequisite without discarding the draft or trying another write', async () => {
  setup(); const input = await editor(); fireEvent.change(input, { target: { value: '30' } })
  vi.mocked(service.updateTemporaryClassPaymentAmount).mockRejectedValueOnce({ code: 'PGRST202' })
  fireEvent.submit(input.closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('先安装对应数据库更新')
  expect(input).toHaveValue(30); expect(service.markTemporaryClassPaymentPaid).not.toHaveBeenCalled()
  expect(updateProtection.reason()).not.toBe('')
})
