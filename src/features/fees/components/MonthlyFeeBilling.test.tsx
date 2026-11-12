import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, QueryObserver, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { MonthlyFeeCard } from './MonthlyFeeCard'
import { FeeRecordList } from './FeeRecords'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { cancelMonthlyFee, restoreMonthlyFee } from '../api/feesService'
import { createFormProtection } from '../../settings/pwa/updateProtection'

vi.mock('../api/feesService', () => ({ cancelMonthlyFee: vi.fn(), restoreMonthlyFee: vi.fn(), markMonthlyFeePaid: vi.fn(), undoMonthlyFeePayment: vi.fn(), updateMonthlyFeeAmount: vi.fn(), waiveMonthlyFee: vi.fn(), getMonthlyFee: vi.fn(async()=>{throw new Error('isolated reconciliation unavailable')}) }))
const original = { id:'original-fee', owner_id:'owner', student_id:'s', enrollment_id:'e', fee_month:'2026-11-01',normal_amount:40,actual_amount:30.25,payment_status:'unpaid',receipt_status:'not_applicable',created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',paid_at:null,student:{id:'s',name:'虚构蓝同学',phone:null},enrollment:{id:'e',class_id:'c',join_date:'2026-09-01',end_date:null,status:'active',class:{id:'c',name:'虚构数学班',status:'active'}} } as MonthlyFeeDetails
let current: MonthlyFeeDetails
function Harness() { const query=useQuery({queryKey:['monthly-fees','list','test'],queryFn:async()=>[current],initialData:[current]}); return <MonthlyFeeCard fee={query.data[0]} showReminder /> }
function setup() { const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}}); const element=(fee?:MonthlyFeeDetails)=><QueryClientProvider client={client}><MemoryRouter>{fee?<MonthlyFeeCard fee={fee}/>:<Harness/>}</MemoryRouter></QueryClientProvider>;const view=render(element());return {...view,client,change:(fee:MonthlyFeeDetails)=>view.rerender(element(fee))} }
beforeEach(()=>{vi.clearAllMocks();current=structuredClone(original);vi.spyOn(window,'confirm').mockReturnValue(true)})
it('cancels and restores only the original row and amount after explicit confirmation',async()=>{
 vi.mocked(cancelMonthlyFee).mockImplementation(async()=>{current={...current,billing_cancelled_at:'2026-11-11T00:00:00Z',updated_at:'2026-11-11T00:00:00Z'};return current})
 vi.mocked(restoreMonthlyFee).mockImplementation(async()=>{current={...current,billing_cancelled_at:null,updated_at:'2026-11-11T00:00:01Z'};return current})
 setup();fireEvent.click(screen.getByLabelText(/更多.*学费操作/));fireEvent.click(screen.getByRole('button',{name:'取消此月收费'}))
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2026年11月'))
 expect(await screen.findByText('已取消收费')).toBeVisible();expect(screen.queryByRole('button',{name:'确认已缴'})).toBeNull();expect(screen.queryByText('WhatsApp 提醒')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'恢复收费'}));await screen.findByRole('button',{name:'确认已缴'})
 expect(cancelMonthlyFee).toHaveBeenCalledWith('original-fee');expect(restoreMonthlyFee).toHaveBeenCalledWith('original-fee');expect(current.actual_amount).toBe(30.25)
})
it('cancel confirmation dismissed or server rejection never changes the fee',async()=>{
 setup();fireEvent.click(screen.getByLabelText(/更多.*学费操作/));vi.mocked(window.confirm).mockReturnValueOnce(false);fireEvent.click(screen.getByRole('button',{name:'取消此月收费'}));expect(cancelMonthlyFee).not.toHaveBeenCalled()
 vi.mocked(cancelMonthlyFee).mockRejectedValueOnce({code:'P0001',message:'仅可取消未缴学费'});fireEvent.click(screen.getByRole('button',{name:'取消此月收费'}));expect(await screen.findByRole('alert')).toHaveTextContent('仅可取消未缴学费');expect(screen.getByRole('button',{name:'确认已缴'})).toBeVisible()
})
it('disallows restore and payment for inapplicable months; paid history stays visible',()=>{
 current={...original,billing_cancelled_at:'2026-11-10T00:00:00Z',enrollment:{...original.enrollment!,end_date:'2026-10-31',status:'ended'}};setup()
 expect(screen.queryByRole('button',{name:'恢复收费'})).toBeNull();expect(screen.queryByRole('button',{name:'确认已缴'})).toBeNull();expect(screen.getByText('报读已结束，此月不适用')).toBeVisible()
})
it('preserves the new amount draft and protection when a refresh makes the month inapplicable',async()=>{
 const protection=createFormProtection(document);const view=setup();fireEvent.click(screen.getByLabelText(/更多.*学费操作/));fireEvent.click(screen.getByRole('button',{name:'修改本月金额'}));fireEvent.focus(screen.getByRole('spinbutton'));fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'25.50'}})
 current={...original,enrollment:{...original.enrollment!,end_date:'2026-10-31',status:'ended'}}
 await view.client.cancelQueries({queryKey:['monthly-fees','list','test']})
 await act(async()=>{view.client.setQueryData(['monthly-fees','list','test'],[current])})
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存金额'})).toBeDisabled());expect(screen.getByRole('spinbutton')).toHaveValue(25.5);expect(protection.reason()).toContain('未保存');protection.dispose()
})
it('student and class record lists show the same cancellation reason and no reminder',()=>{
 current={...original,billing_cancelled_at:'2026-11-10T00:00:00Z'}
 render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FeeRecordList records={[current]} studentScoped onSelect={()=>{}}/></MemoryRouter></QueryClientProvider>)
 expect(screen.getByText('已取消收费')).toBeVisible();expect(screen.queryByText('WhatsApp 提醒')).toBeNull()
})
it('cancel and restore refresh reads without rerunning or modifying the legacy enrollment generation query',async()=>{
 const {client}=setup(),ensure=vi.fn(async()=>({created_count:0}))
 const observer=new QueryObserver(client,{queryKey:['monthly-fees','ensure','e'],queryFn:ensure,staleTime:Infinity}),stop=observer.subscribe(()=>{})
 try{
  await waitFor(()=>expect(observer.getCurrentResult().isSuccess).toBe(true))
  const generatedAt=observer.getCurrentResult().dataUpdatedAt
  vi.mocked(cancelMonthlyFee).mockImplementation(async()=>{current={...current,billing_cancelled_at:'2026-11-11T00:00:00Z',updated_at:'2026-11-11T00:00:00Z'};return current})
  vi.mocked(restoreMonthlyFee).mockImplementation(async()=>{current={...current,billing_cancelled_at:null,updated_at:'2026-11-11T00:00:01Z'};return current})
  fireEvent.click(screen.getByLabelText(/更多.*学费操作/));fireEvent.click(screen.getByRole('button',{name:'取消此月收费'}))
  fireEvent.click(await screen.findByRole('button',{name:'恢复收费'}));await screen.findByRole('button',{name:'确认已缴'})
  expect(ensure).toHaveBeenCalledTimes(1);expect(observer.getCurrentResult().dataUpdatedAt).toBe(generatedAt)
 }finally{stop()}
})
