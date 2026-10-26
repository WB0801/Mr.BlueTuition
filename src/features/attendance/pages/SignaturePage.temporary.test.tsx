import { forwardRef, useImperativeHandle } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignaturePage } from './SignaturePage'
const api = vi.hoisted(() => ({ saved: vi.fn(), remove: vi.fn(), upload: vi.fn(), record: vi.fn(), navigate: vi.fn(), pending: null as unknown, roster: [] as unknown[], binding: vi.fn() }))
vi.mock('react-router-dom', async original => ({ ...await original<object>(), useParams: () => ({ sessionId:'session',studentId:'a' }),useNavigate:()=>api.navigate,useLocation:()=>({state:null}),useBlocker:()=>({state:'unblocked'}),useBeforeUnload:()=>{} }))
vi.mock('../../../components/shared/PageHeader',()=>({PageHeader:()=>null}))
vi.mock('../../auth/authContext',()=>({useAuth:()=>({user:{id:'owner'}})}))
vi.mock('../../schedule/api/scheduleService',()=>({getSession:async()=>({session_type:'temporary',temporary_class_id:'temp',status:'scheduled',current_start_at:'2026-10-01T06:00:00Z',current_end_at:'2026-10-01T08:00:00Z',temporary_class:{name:'虚构临时班'}})}))
vi.mock('../api/attendanceService',()=>({getSessionRoster:async()=>api.roster,getTemporarySignatureEnrollmentId:()=>api.binding(),buildSignaturePath:()=> 'isolated.png',uploadSignature:api.upload,recordAttendance:api.record}))
vi.mock('../offline/pendingSignatureStore',()=>({findPendingSignature:async()=>api.pending,savePendingSignature:api.saved,removePendingSignature:api.remove}))
vi.mock('../components/SignatureCanvas',()=>({SignatureCanvas:forwardRef(function Canvas({onInkChange}:{onInkChange:(v:boolean)=>void},ref){useImperativeHandle(ref,()=>({load:async()=>{},toPngBlob:async()=>new Blob(['fictional']),clear:()=>onInkChange(false)}));return <button onClick={()=>onInkChange(true)}>模拟墨迹</button>})}))
beforeEach(()=>{notifyManager.setScheduler(queueMicrotask);vi.clearAllMocks();api.pending=null;api.roster=[{student_id:'a',student_name:'虚构甲',attendance_record_id:null}];api.binding.mockResolvedValue('enrollment-new');api.record.mockResolvedValue({id:'attendance'})})
afterEach(()=>{cleanup();notifyManager.setScheduler(callback=>setTimeout(callback,0))})
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const element=<QueryClientProvider client={client}><SignaturePage/></QueryClientProvider>;const view=render(element);return {client,rerender:()=>view.rerender(<QueryClientProvider client={client}><SignaturePage/></QueryClientProvider>)}}
it('new capture persists the exact enrollment before upload and returns to the original roster',async()=>{
  mount();fireEvent.click(await screen.findByRole('button',{name:'模拟墨迹'}))
  const confirm=await screen.findByRole('button',{name:/确认(补签|签到)/})
  await waitFor(()=>expect(confirm).not.toBeDisabled());fireEvent.click(confirm)
  await waitFor(()=>expect(api.saved).toHaveBeenCalled())
  expect(api.saved.mock.calls[0][0]).toMatchObject({temporaryEnrollmentId:'enrollment-new'})
  await waitFor(()=>expect(api.record).toHaveBeenCalled())
  expect(api.record.mock.calls[0][6]).toBe('enrollment-new')
  await waitFor(()=>expect(api.navigate).toHaveBeenCalled())
  expect(api.navigate.mock.calls[0][0]).toBe('/attendance/session/session')
})
it('unbound recovered signature on a cancelled roster is kept and never rebound or uploaded',async()=>{
  api.pending={id:'old',ownerId:'owner',sessionId:'session',studentId:'a',signaturePath:'old.png',signature:new Blob(['old']),capturedAt:'2026-10-01T00:00:00Z',wasOffline:true}
  api.roster=[];api.record.mockRejectedValue(new Error('requires original enrollment ID'))
  mount();fireEvent.click(await screen.findByRole('button',{name:'模拟墨迹'}));fireEvent.click(await screen.findByRole('button',{name:'重新上传'}))
  await screen.findByText(/无法核实原报名/)
  expect(api.upload).not.toHaveBeenCalled();expect(api.remove).not.toHaveBeenCalled();expect(api.binding).not.toHaveBeenCalled()
  expect(api.saved.mock.calls.every(([item])=>!item.temporaryEnrollmentId)).toBe(true)
})
it('an already committed legacy signature can finish idempotent recovery even when roster already shows attendance',async()=>{
  api.pending={id:'old',ownerId:'owner',sessionId:'session',studentId:'a',signaturePath:'old.png',signature:new Blob(['old']),capturedAt:'2026-10-01T00:00:00Z',wasOffline:true}
  api.roster=[{student_id:'a',student_name:'虚构甲',attendance_record_id:'existing'}]
  mount();fireEvent.click(await screen.findByRole('button',{name:'模拟墨迹'}));fireEvent.click(screen.getByRole('button',{name:'重新上传'}))
  await waitFor(()=>expect(api.remove).toHaveBeenCalledWith('old'))
  expect(api.upload).not.toHaveBeenCalled();expect(api.binding).not.toHaveBeenCalled()
  await waitFor(()=>expect(api.navigate).toHaveBeenCalled())
})
it('ink retains its original enrollment even if cache refresh sees a replacement enrollment',async()=>{
  api.binding.mockResolvedValue('enrollment-old')
  const {client,rerender}=mount();fireEvent.click(await screen.findByRole('button',{name:'模拟墨迹'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:/确认(补签|签到)/})).not.toBeDisabled())
  api.binding.mockResolvedValue('enrollment-replacement')
  await act(async()=>{await client.refetchQueries({queryKey:['attendance','session','temporary-enrollment','a']})})
  expect(client.getQueryData(['attendance','session','temporary-enrollment','a'])).toBe('enrollment-replacement')
  rerender()
  fireEvent.click(screen.getByRole('button',{name:/确认(补签|签到)/}))
  await waitFor(()=>expect(api.saved).toHaveBeenCalled())
  expect(api.saved.mock.calls[0][0].temporaryEnrollmentId).toBe('enrollment-old')
})
it('roster cancellation does not unmount existing ink; a rejected bound submission retains the original enrollment and blob',async()=>{
  api.binding.mockResolvedValue('enrollment-old')
  const {client}=mount(),canvas=await screen.findByRole('button',{name:'模拟墨迹'})
  fireEvent.click(canvas)
  await act(async()=>{client.setQueryData(['attendance','session','roster'],[])})
  expect(screen.getByRole('button',{name:'模拟墨迹'})).toBe(canvas)
  api.record.mockRejectedValue(new Error('Temporary enrollment cancelled'))
  fireEvent.click(screen.getByRole('button',{name:/确认(补签|签到)/}))
  await screen.findByRole('button',{name:'重新上传'})
  expect(api.saved.mock.calls[0][0].temporaryEnrollmentId).toBe('enrollment-old')
  expect(api.remove).not.toHaveBeenCalled()
})
