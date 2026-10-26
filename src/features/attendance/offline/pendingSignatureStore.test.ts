import { createElement, forwardRef, useImperativeHandle } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignaturePage } from '../pages/SignaturePage'
const api=vi.hoisted(()=>({save:vi.fn(),upload:vi.fn(),record:vi.fn(),remove:vi.fn()}))
vi.mock('react-router-dom',async original=>({...await original<object>(),useParams:()=>({sessionId:'session',studentId:'student'}),useNavigate:()=>vi.fn(),useLocation:()=>({state:null}),useBlocker:()=>({state:'unblocked'}),useBeforeUnload:()=>{}}))
vi.mock('../../../components/shared/PageHeader',()=>({PageHeader:()=>null}))
vi.mock('../../auth/authContext',()=>({useAuth:()=>({user:{id:'owner'}})}))
vi.mock('../../schedule/api/scheduleService',()=>({getSession:async()=>({session_type:'regular',status:'scheduled',current_start_at:'2026-10-01T00:00:00Z',current_end_at:'2026-10-01T01:00:00Z',class:{name:'虚构常态班'}})}))
vi.mock('../api/attendanceService',()=>({getSessionRoster:async()=>[{student_id:'student',student_name:'虚构学生',attendance_record_id:null}],buildSignaturePath:()=> 'private.png',uploadSignature:api.upload,recordAttendance:api.record}))
vi.mock('./pendingSignatureStore',()=>({findPendingSignature:async()=>null,savePendingSignature:api.save,removePendingSignature:api.remove}))
vi.mock('../components/SignatureCanvas',()=>({SignatureCanvas:forwardRef(function Canvas({onInkChange}:{onInkChange:(ink:boolean)=>void},ref){useImperativeHandle(ref,()=>({clear:()=>onInkChange(false),load:async()=>{},toPngBlob:async()=>new Blob(['fictional png'])}));return createElement('button',{onClick:()=>onInkChange(true)},'模拟墨迹')})}))
beforeEach(()=>{vi.resetAllMocks();api.save.mockResolvedValue(undefined);api.upload.mockResolvedValue(undefined);api.record.mockResolvedValue({id:'record'})})
afterEach(cleanup)
async function draw(){render(createElement(QueryClientProvider,{client:new QueryClient()},createElement(SignaturePage)));fireEvent.click(await screen.findByRole('button',{name:'模拟墨迹'}));fireEvent.click(screen.getByRole('button',{name:/确认(签到|补签)/}))}
it('persists the PNG and device capture timestamp before starting upload',async()=>{
  let saved!:()=>void
  api.save.mockImplementationOnce(()=>new Promise<void>(done=>{saved=done}))
  await draw();await waitFor(()=>expect(api.save).toHaveBeenCalled())
  expect(api.upload).not.toHaveBeenCalled()
  const item=api.save.mock.calls[0][0]
  expect(item.signature).toBeInstanceOf(Blob);expect(Number.isFinite(Date.parse(item.capturedAt))).toBe(true)
  saved();await waitFor(()=>expect(api.record).toHaveBeenCalled())
  expect(api.record.mock.calls[0]).toEqual(['session','student','private.png',item.id,item.capturedAt,false,undefined])
})
it.each(['upload','record'] as const)('keeps the original PNG and capture identity after %s failure and retries without deleting it',async phase=>{
  api[phase].mockRejectedValueOnce(new Error('isolated failure'))
  await draw();await screen.findByRole('button',{name:'重新上传'})
  expect(api.remove).not.toHaveBeenCalled()
  const original=api.save.mock.calls[0][0],retained=api.save.mock.calls.at(-1)![0]
  expect(retained).toMatchObject({id:original.id,capturedAt:original.capturedAt,signaturePath:original.signaturePath,wasOffline:true})
  expect(retained.signature).toBe(original.signature)
  fireEvent.click(screen.getByRole('button',{name:'重新上传'}))
  await waitFor(()=>expect(api.remove).toHaveBeenCalledWith(original.id))
  expect(api.record.mock.calls.at(-1)).toEqual(['session','student','private.png',original.id,original.capturedAt,true,undefined])
})
