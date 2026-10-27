import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, Link, useLocation, useParams } from 'react-router-dom'
import { ObjectSavedNotice } from './ObjectSavedNotice'

function Detail({ kind }: { kind: 'students' | 'classes' }) {
  const { id = '' } = useParams(), location = useLocation()
  return <><ObjectSavedNotice key={id} kind={kind} id={id} /><div data-testid="state">{JSON.stringify(location.state)}</div><Link to={`/${kind}/b`}>另一对象</Link><Link to="/list">离开</Link></>
}
it.each(['students','classes'] as const)('consumes %s feedback once without losing source/scroll, never leaking it to another object or re-entry', async kind => {
  render(<MemoryRouter initialEntries={[{ pathname: `/${kind}/a`, state: { objectSaved: { kind, id: 'a' }, restoreContextScroll: true, contextBack: { to: '/list', label: '列表' } } }]}><Routes>
    <Route path={`/${kind}/:id`} element={<Detail kind={kind} />} />
    <Route path="/list" element={<Link to={`/${kind}/a`}>再次进入</Link>} />
  </Routes></MemoryRouter>)
  expect(await screen.findByRole('status')).toHaveTextContent(kind === 'students' ? '学生资料已保存' : '班级资料已保存')
  await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('objectSaved'))
  expect(screen.getByTestId('state')).toHaveTextContent('restoreContextScroll')
  const user = userEvent.setup(); await user.click(screen.getByRole('link', { name: '另一对象' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '离开' })); await user.click(screen.getByRole('link', { name: '再次进入' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
it.each([{ kind: 'classes', id: 'a' }, { kind: 'students', id: 'b' }])('rejects mismatched feedback %j', async objectSaved => {
  render(<MemoryRouter initialEntries={[{ pathname: '/students/a', state: { objectSaved } }]}><Routes><Route path="/students/:id" element={<Detail kind="students" />} /></Routes></MemoryRouter>)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('objectSaved'))
})
