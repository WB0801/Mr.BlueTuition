import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContextDataWorkspace } from './ContextDataWorkspace'
import { useContextDataBusy } from './contextDataState'
import { useState } from 'react'
import { completedContextOperation } from './contextDataState'

beforeEach(() => { sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined) })

function Draft() { const [value, setValue] = useState(''); return <input aria-label="草稿" value={value} onChange={e => setValue(e.target.value)} /> }
function Busy() { const [busy, setBusy] = useState(false); useContextDataBusy(busy); return <button onClick={() => setBusy(!busy)}>模拟请求</button> }
function Probe() { const location = useLocation(); return <output data-testid="url">{location.pathname + location.search}</output> }
function setup(path = '/students/a') {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><ContextDataWorkspace label="学生相关资料" defaultPanel="enrollments" sections={[
    { id: 'enrollments', label: '班级与报读', render: () => <p>当前报读内容</p> },
    { id: 'fees', label: '缴费记录', render: () => <><Draft /><Busy /></> },
  ]} /><Probe /></MemoryRouter></QueryClientProvider>)
}
it('lazy-loads a section and preserves its draft when switching away and back without leaving the object', async () => {
  setup(); const user = userEvent.setup()
  expect(screen.queryByLabelText('草稿')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '缴费记录' }))
  await user.type(screen.getByLabelText('草稿'), '待保存金额')
  await user.click(screen.getByRole('button', { name: '班级与报读' }))
  expect(screen.getByTestId('url')).toHaveTextContent('/students/a')
  expect(screen.getByLabelText('草稿')).not.toBeVisible()
  await user.click(screen.getByRole('button', { name: '缴费记录' }))
  expect(screen.getByLabelText('草稿')).toHaveValue('待保存金额')
  expect(screen.getByTestId('url')).toHaveTextContent('panel=fees')
})
it('restores the URL section and blocks switching during a local batch request', async () => {
  setup('/students/a?panel=fees&fees.month=2025-08'); const user = userEvent.setup()
  expect(screen.getByLabelText('草稿')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '模拟请求' }))
  expect(screen.getByRole('button', { name: '班级与报读' })).toBeDisabled()
  expect(screen.getByTestId('url')).toHaveTextContent('fees.month=2025-08')
  await user.click(screen.getByRole('button', { name: '模拟请求' }))
  expect(screen.getByRole('button', { name: '班级与报读' })).toBeEnabled()
})
it('restores a nonzero per-column scroll position, including the existing position key', async () => {
  sessionStorage.setItem('data-panel:/students/a:fees', '375')
  setup('/students/a?panel=fees')
  const user = userEvent.setup()
  await screen.findByLabelText('草稿')
  await new Promise(resolve => requestAnimationFrame(resolve))
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 375, behavior: 'instant' })
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(650)
  await user.click(screen.getByRole('button', { name: '班级与报读' }))
  await user.click(screen.getByRole('button', { name: '缴费记录' }))
  await new Promise(resolve => requestAnimationFrame(resolve))
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 650, behavior: 'instant' })
  sessionStorage.clear()
})

it('blocks browser navigation during submission but allows the completed operation to return', async () => {
  function Operation() {
    const [busy, setBusy] = useState(false); useContextDataBusy(busy)
    const navigate = useNavigate()
    return <><button onClick={() => setBusy(true)}>提交</button><button onClick={() => navigate('/classes')}>离开</button><button onClick={() => navigate('/classes', { state: completedContextOperation() })}>提交已成功</button></>
  }
  const router = createMemoryRouter([{ path: '/classes/a', element: <ContextDataWorkspace label="资料" defaultPanel="manage" sections={[{ id: 'manage', label: '管理', render: () => <Operation /> }]} /> }, { path: '/classes', element: <p>班级列表</p> }], { initialEntries: ['/classes/a'] })
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '提交' }))
  await user.click(screen.getByRole('button', { name: '离开' }))
  expect(router.state.location.pathname).toBe('/classes/a')
  await user.click(screen.getByRole('button', { name: '提交已成功' }))
  expect(await screen.findByText('班级列表')).toBeVisible()
})

it('nested course tabs preserve the outer column and propagate local submission protection', async () => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/students/a?panel=attendance&attendance.record=course-a&fees.month=2026-08']}>
    <ContextDataWorkspace label="学生" defaultPanel="attendance" sections={[
      { id: 'attendance', label: '出席栏目', render: () => <ContextDataWorkspace label="课程" defaultPanel="roster" panelParam="attendance.course-a.section" sections={[
        { id: 'roster', label: '课程名单', render: () => <p>课程内容</p> },
        { id: 'guests', label: '补课栏目', render: () => <Busy /> },
      ]} /> },
      { id: 'fees', label: '学费栏目', render: () => <p>学费内容</p> },
    ]} /><Probe />
  </MemoryRouter></QueryClientProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '补课栏目' }))
  expect(screen.getByTestId('url')).toHaveTextContent('panel=attendance')
  expect(screen.getByTestId('url')).toHaveTextContent('attendance.course-a.section=guests')
  expect(screen.getByTestId('url')).toHaveTextContent('fees.month=2026-08')
  await user.click(screen.getByRole('button', { name: '模拟请求' }))
  expect(screen.getByRole('button', { name: '学费栏目' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '课程名单' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '模拟请求' }))
  expect(screen.getByRole('button', { name: '学费栏目' })).toBeEnabled()
})
