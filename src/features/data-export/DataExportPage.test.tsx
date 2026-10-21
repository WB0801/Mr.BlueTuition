import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { DataExportPage } from './DataExportPage'
import { listExportClasses, prepareDataExport } from './api/dataExportService'
import { createExportWorkbook, downloadExportWorkbook } from './exportWorkbook'
import { updateProtection } from '../settings/pwa/updateProtection'
import { ExportPreparationError } from './exportRules'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const owner='owner-fixture'
vi.mock('../auth/authContext',()=>({useAuth:()=>({user:{id:owner}})}))
vi.mock('./api/dataExportService',()=>({listExportClasses:vi.fn(),prepareDataExport:vi.fn()}))
vi.mock('./exportWorkbook',()=>({createExportWorkbook:vi.fn(),downloadExportWorkbook:vi.fn()}))
const output={sheets:[{name:'学生名单',headers:[],rows:[]}],fileName:'test.xlsx'}
function renderPage(url='/settings/export',state?:unknown) {
  const router=createMemoryRouter([{path:'/settings/export',element:<DataExportPage/>},{path:'/classes/:id',element:<h1>班级原资料</h1>},{path:'/settings',element:<h1>设置原位置</h1>}],{initialEntries:[{pathname:url.split('?')[0],search:url.includes('?')?'?'+url.split('?')[1]:'',state}]})
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RouterProvider router={router}/></QueryClientProvider>);return router
}
beforeEach(()=>{
  vi.clearAllMocks()
  vi.mocked(listExportClasses).mockImplementation(async(_owner,kind)=>kind==='regular'?[{key:'regular:c1',id:'c1',kind,name:'同名班',status:'active'},{key:'regular:c2',id:'c2',kind,name:'同名班',status:'ended'}]:[{key:'temporary:c1',id:'c1',kind,name:'同名班',status:'active'}])
  vi.mocked(prepareDataExport).mockResolvedValue(output as never)
  vi.mocked(createExportWorkbook).mockResolvedValue(new Uint8Array([1]))
})
it('defaults to all regular classes, four-column roster only and no temporary read',async()=>{
  renderPage();await screen.findByLabelText('常态班：同名班（已结束）')
  await userEvent.click(screen.getByRole('button',{name:'准备并下载'}))
  await waitFor(()=>expect(downloadExportWorkbook).toHaveBeenCalledTimes(1))
  expect(prepareDataExport).toHaveBeenCalledWith(owner,{classKeys:['regular:c1','regular:c2'],history:false,details:[],start:'',end:''},expect.any(Function),expect.any(AbortSignal))
  expect(listExportClasses).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('已准备并交给浏览器下载')
})
it('class entry selects just that UUID and returns to original URL with panel and state',async()=>{
  const router=renderPage('/settings/export?classId=c2',{contextBack:{to:'/classes/c2?panel=fees&feesMonth=2026-10',label:'班级',state:{retained:'yes'}}})
  await screen.findByLabelText('常态班：同名班（已结束）')
  expect(screen.getByLabelText('常态班：同名班（已结束）')).toBeChecked();expect(screen.getByLabelText('常态班：同名班')).not.toBeChecked()
  await userEvent.click(screen.getByRole('link',{name:'返回班级'}))
  expect(router.state.location.pathname+router.state.location.search).toBe('/classes/c2?panel=fees&feesMonth=2026-10')
})
it('cancels pending reads, blocks PWA while preparing, and ignores late success before retry',async()=>{
  let resolve!:(v:unknown)=>void
  vi.mocked(prepareDataExport).mockImplementationOnce(()=>new Promise(r=>{resolve=r}) as never)
  renderPage();await screen.findByLabelText('常态班：同名班')
  await userEvent.click(screen.getByRole('button',{name:'准备并下载'}))
  expect(updateProtection.reason()).toContain('导出')
  const signal=vi.mocked(prepareDataExport).mock.calls[0][3]!
  await userEvent.click(screen.getByRole('button',{name:'取消准备'}));expect(signal.aborted).toBe(true)
  expect(screen.getByRole('button',{name:'准备并下载'})).toHaveFocus()
  await act(async()=>resolve(output))
  expect(downloadExportWorkbook).not.toHaveBeenCalled();expect(updateProtection.reason()).toBe('')
  await userEvent.click(screen.getByRole('button',{name:'准备并下载'}));await waitFor(()=>expect(downloadExportWorkbook).toHaveBeenCalledTimes(1))
})
it('read failure retains choices and retries without downloading a partial workbook',async()=>{
  vi.mocked(prepareDataExport).mockRejectedValueOnce(new ExportPreparationError('读取学费失败，请重试。'))
  renderPage();await screen.findByLabelText('常态班：同名班');await userEvent.click(screen.getByLabelText('学费记录'))
  await userEvent.click(screen.getByRole('button',{name:'准备并下载'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('读取学费失败')
  expect(screen.getByLabelText('学费记录')).toBeChecked();expect(downloadExportWorkbook).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button',{name:'重试导出'}));await waitFor(()=>expect(downloadExportWorkbook).toHaveBeenCalledTimes(1))
})
it('specified dates require both endpoints instead of silently exporting all history',async()=>{
  renderPage();await screen.findByLabelText('常态班：同名班');await userEvent.click(screen.getByLabelText('学费记录'))
  await userEvent.click(screen.getByLabelText('指定日期'))
  await userEvent.click(screen.getByRole('button',{name:'准备并下载'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('开始和结束日期')
  expect(prepareDataExport).not.toHaveBeenCalled()
})
it('a hidden partial date range cannot block the four-column roster after all details are unchecked',async()=>{
  renderPage();await screen.findByLabelText('常态班：同名班');await userEvent.click(screen.getByLabelText('学费记录'))
  await userEvent.click(screen.getByLabelText('指定日期'));await userEvent.type(screen.getByLabelText('开始日期'),'2026-10-01')
  await userEvent.click(screen.getByLabelText('学费记录'));expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button',{name:'准备并下载'}));await waitFor(()=>expect(downloadExportWorkbook).toHaveBeenCalledTimes(1))
  expect(vi.mocked(prepareDataExport).mock.calls[0][1]).toMatchObject({details:[],start:'',end:''})
})
