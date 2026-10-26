import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { TemporaryClassDetailPage } from './TemporaryClassDetailPage'
import type { TemporaryClassEnrollment } from '../../../types/domain'
import { updateProtection } from '../../settings/pwa/updateProtection'
const api=vi.hoisted(()=>({ cancel:vi.fn(),rows:[] as TemporaryClassEnrollment[],roster:vi.fn(),failRead:false }))
vi.mock('../api/temporaryClassesService',()=>({
  getTemporaryClass:async()=>({id:'t',name:'虚构临时班',status:'active',fee_amount:40,start_at:'2026-10-01T06:00:00Z',end_at:'2026-10-01T08:00:00Z'}),
  getTemporaryClassSession:async()=>({id:'session',temporary_class_id:'t',status:'scheduled',current_start_at:'2026-10-01T06:00:00Z',current_end_at:'2026-10-01T08:00:00Z'}),
  listTemporaryClassEnrollments:async()=>{if(api.failRead)throw new Error('isolated refresh failure');return structuredClone(api.rows)},cancelTemporaryClassEnrollment:(...args:unknown[])=>api.cancel(...args),
  markTemporaryClassPaymentPaid:vi.fn(),undoTemporaryClassPayment:vi.fn(),updateTemporaryClassPaymentAmount:vi.fn(),endTemporaryClass:vi.fn(),
}))
vi.mock('../../attendance/api/attendanceService',()=>({getSessionRoster:api.roster}))
const original:TemporaryClassEnrollment={id:'e',owner_id:'o',temporary_class_id:'t',student_id:'s',status:'active',joined_at:'',created_at:'',student:{id:'s',name:'虚构学生',school_class:null,phone:null},payment:{id:'p',owner_id:'o',temporary_class_enrollment_id:'e',amount:30.25,payment_status:'unpaid',paid_at:null,receipt_status:'not_applicable',receipt_completed_at:null,created_at:'',updated_at:''}}
beforeEach(()=>{
  vi.clearAllMocks();api.rows=[structuredClone(original)];api.roster.mockResolvedValue([]);api.failRead=false
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  api.cancel.mockImplementation(async()=>{api.rows[0]={...api.rows[0],status:'cancelled',cancelled_at:'2026-10-26T00:00:00Z'};return structuredClone(api.rows[0])})
})
function mount(){
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})
  const router=createMemoryRouter([{path:'/temporary-classes/:temporaryClassId',element:<><Link to="/else">离开测试页</Link><TemporaryClassDetailPage/></>},{path:'/else',element:<p>另一页</p>}],{initialEntries:['/temporary-classes/t']})
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);return {client,router}
}
it('successful unpaid cancellation removes the active roster, retains original history above the page and does not fetch hidden attendance',async()=>{
  const {client,router}=mount()
  fireEvent.click(await screen.findByRole('button',{name:'取消报名'}))
  expect(updateProtection.reason()).not.toBe('')
  fireEvent.click(screen.getByRole('link',{name:'离开测试页'}))
  expect(router.state.location.pathname).toBe('/temporary-classes/t')
  fireEvent.click(screen.getByRole('button',{name:'确认取消报名'}))
  await screen.findByText('报名已取消，原记录可在「取消记录」查看。')
  await waitFor(()=>expect(screen.getByRole('heading',{name:'学生名单 0 人'})).toBeVisible())
  expect(screen.queryByRole('button',{name:'确认已缴'})).toBeNull()
  expect(api.roster).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'取消记录（1）'}))
  const history=screen.getByRole('region',{name:'取消记录（1）'})
  expect(within(history).getByText('RM30.25')).toBeVisible()
  expect(within(history).getByText('已取消')).toBeVisible()
  expect(within(history).queryByRole('button',{name:'确认已缴'})).toBeNull()
  expect(updateProtection.reason()).toBe('')
  expect(client.getQueryData<TemporaryClassEnrollment[]>(['temporary-class','t','enrollments'])![0].id).toBe('e')
})
it('a cross-client cancellation refresh cannot unmount an open confirmation or silently discard its conflict feedback',async()=>{
  const {client}=mount()
  fireEvent.click(await screen.findByRole('button',{name:'取消报名'}))
  api.rows[0]={...api.rows[0],status:'cancelled',cancelled_at:'2026-10-26T00:00:00Z'}
  await act(async()=>{await client.invalidateQueries({queryKey:['temporary-class','t','enrollments']})})
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  api.cancel.mockRejectedValue(new Error('Temporary enrollment already cancelled'))
  fireEvent.click(screen.getByRole('button',{name:'确认取消报名'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('此报名已取消')
  fireEvent.click(screen.getByRole('button',{name:'暂不取消'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByRole('button',{name:'取消报名'})).toBeNull()
})
it.each([false,true])('failed roster refresh retains the confirmation snapshot and protection (submitting=%s)',async(submitting)=>{
  const {client}=mount();let reject!: (e:Error)=>void
  api.cancel.mockImplementation(()=>new Promise((_,no)=>{reject=no}))
  fireEvent.click(await screen.findByRole('button',{name:'取消报名'}))
  if(submitting){fireEvent.click(screen.getByRole('button',{name:'确认取消报名'}));await waitFor(()=>expect(api.cancel).toHaveBeenCalledTimes(1))}
  api.failRead=true
  await act(async()=>{await client.invalidateQueries({queryKey:['temporary-class','t','enrollments']})})
  await waitFor(()=>expect(client.getQueryState(['temporary-class','t','enrollments'])?.status).toBe('error'))
  expect(screen.getByRole('dialog')).toBeInTheDocument();expect(updateProtection.reason()).not.toBe('')
  if(submitting){await act(async()=>reject(new Error('isolated failed cancellation')));expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeVisible()}
  fireEvent.click(screen.getByRole('button',{name:'暂不取消'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})
