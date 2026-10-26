import { cancelTemporaryClassEnrollment, listTemporaryClasses } from './temporaryClassesService'
import { getTemporarySignatureEnrollmentId } from '../../attendance/api/attendanceService'
import type { TemporaryClassEnrollment } from '../../../types/domain'
const api=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),filters:[] as unknown[],query:{}}))
vi.mock('../../../lib/requireSupabase',()=>({requireSupabase:()=>api}))
const enrollment={id:'e',owner_id:'o',temporary_class_id:'t',student_id:'s',status:'active',payment:{id:'p',amount:30.25,payment_status:'paid'}} as TemporaryClassEnrollment
beforeEach(()=>{vi.clearAllMocks();api.filters=[]})
it('sends immutable IDs and expected snapshot only, never a client-calculated refund; reads authoritative returned refund facts',async()=>{
  api.rpc.mockResolvedValue({data:{...enrollment,status:'cancelled',payment:{...enrollment.payment,refunded_amount:'30.25',refunded_at:'2026-10-26T00:00:00Z'}},error:null})
  expect(await cancelTemporaryClassEnrollment(enrollment,true,'request')).toMatchObject({status:'cancelled',payment:{id:'p',refunded_amount:30.25}})
  expect(api.rpc.mock.calls).toEqual([['cancel_temporary_class_enrollment',{p_enrollment_id:'e',p_payment_id:'p',p_expected_status:'paid',p_expected_amount:30.25,p_refund_confirmed:true,p_client_request_id:'request'}]])
  expect(api.from).not.toHaveBeenCalled()
})
it('missing migration or failed cancellation has no direct-write fallback',async()=>{
  api.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Function missing'}})
  await expect(cancelTemporaryClassEnrollment(enrollment,true,'request')).rejects.toMatchObject({code:'PGRST202'})
  expect(api.from).not.toHaveBeenCalled()
})
it('class counts exclude cancelled only, not legitimate ended registrations',async()=>{
  const result={data:[{id:'t',fee_amount:'40',registrations:[{id:'a',status:'active',payment:{payment_status:'unpaid'}},{id:'e',status:'ended',payment:[{payment_status:'paid'}]},{id:'c',status:'cancelled',payment:{payment_status:'paid'}}]}],error:null}
  const q={select:()=>q,eq:()=>q,order:async()=>result};api.from.mockReturnValue(q)
  expect((await listTemporaryClasses('active'))[0]).toMatchObject({enrollment_count:2,paid_count:1,unpaid_count:1})
  expect(api.rpc).not.toHaveBeenCalled()
})
it('new ink uses one exact non-cancelled enrollment lookup without attendance generation or writes',async()=>{
  const q={select:()=>q,eq:(...args:unknown[])=>{api.filters.push(['eq',...args]);return q},neq:(...args:unknown[])=>{api.filters.push(['neq',...args]);return q},single:async()=>({data:{id:'exact-new'},error:null})};api.from.mockReturnValue(q)
  expect(await getTemporarySignatureEnrollmentId('temp','student')).toBe('exact-new')
  expect(api.from).toHaveBeenCalledWith('temporary_class_enrollments')
  expect(api.filters).toEqual([['eq','temporary_class_id','temp'],['eq','student_id','student'],['neq','status','cancelled']])
  expect(api.rpc).not.toHaveBeenCalled()
})
