import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppHeader } from './AppHeader'

it('closes More on Escape and restores focus without signing out or navigating', async () => {
  const signOut = vi.fn()
  render(<MemoryRouter initialEntries={['/attendance']}><AppHeader isSigningOut={false} onSignOut={signOut} /></MemoryRouter>)
  const user = userEvent.setup()
  const more = screen.getByText('更多', { exact: false }).closest('summary')!
  await user.click(more)
  expect(more.parentElement).toHaveAttribute('open')
  screen.getByRole('link', { name: /^学生$/ }).focus()
  await user.keyboard('{Escape}')
  expect(more.parentElement).not.toHaveAttribute('open')
  expect(more).toHaveFocus()
  expect(signOut).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: '点名' })).toHaveAttribute('aria-current', 'page')
})
