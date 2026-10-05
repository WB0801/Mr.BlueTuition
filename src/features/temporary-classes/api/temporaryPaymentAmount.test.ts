import { updateTemporaryClassPaymentAmount } from './temporaryClassesService'
const api = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => api }))
beforeEach(() => vi.resetAllMocks())
it('addresses the existing payment UUID within its class and normalizes the saved amount', async () => {
  api.rpc.mockResolvedValue({ data: { id: 'pay-a', amount: '30.25', temporary_class_enrollment_id: 'en-a', payment_status: 'unpaid' }, error: null })
  expect(await updateTemporaryClassPaymentAmount('pay-a', 'temp-a', 30.25)).toMatchObject({ id: 'pay-a', amount: 30.25, temporary_class_enrollment_id: 'en-a', payment_status: 'unpaid' })
  expect(api.rpc.mock.calls).toEqual([['update_temporary_class_payment_amount', { p_payment_id: 'pay-a', p_temporary_class_id: 'temp-a', p_amount: 30.25 }]])
  expect(api.from).not.toHaveBeenCalled()
})
it.each([NaN, Infinity, -Infinity, -1, 0.001, 100000000])('rejects invalid numeric amount %s before requesting an RPC', async value => {
  await expect(updateTemporaryClassPaymentAmount('pay-a', 'temp-a', value)).rejects.toThrow()
  expect(api.rpc).not.toHaveBeenCalled()
})
it('fails safely when the required migration is not installed, without a direct-write fallback', async () => {
  api.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Function not found' } })
  await expect(updateTemporaryClassPaymentAmount('pay-a', 'temp-a', 30)).rejects.toMatchObject({ code: 'PGRST202' })
  expect(api.from).not.toHaveBeenCalled()
})
