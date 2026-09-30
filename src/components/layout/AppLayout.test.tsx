import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout'

vi.mock('../../features/auth/authContext', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../../features/settings/pwa/PwaUpdatePrompt', () => ({ PwaUpdatePrompt: () => null }))

function setup(reduce = false) {
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }))
  const listeners = new Set<() => void>()
  const preference = { matches: reduce, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }
  vi.stubGlobal('matchMedia', () => preference)
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
  render(<MemoryRouter><Routes><Route element={<AppLayout />}><Route path="*" element={<><Link to="/students">Students</Link><Link to="/?q=x">Search</Link></>} /></Route></Routes></MemoryRouter>)
  return { animate, cancel, preference, listeners }
}
afterEach(() => { vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).animate })

it('interrupts page motion on navigation without animating search changes or remounting content', async () => {
  const { animate, cancel } = setup()
  expect(animate).toHaveBeenCalledTimes(1)
  const search = screen.getByRole('link', { name: 'Search' })
  await userEvent.setup().click(search)
  expect(animate).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'Search' })).toBe(search)
  await userEvent.setup().click(screen.getByRole('link', { name: 'Students' }))
  expect(animate).toHaveBeenCalledTimes(2)
  expect(cancel).toHaveBeenCalled()
})
it('uses static content when reduced motion is requested', () => {
  const { animate } = setup(true)
  expect(animate).not.toHaveBeenCalled()
})
it('immediately cancels an in-flight transition when reduced motion is enabled', () => {
  const { cancel, preference, listeners } = setup()
  preference.matches = true
  listeners.forEach((notify) => notify())
  expect(cancel).toHaveBeenCalled()
})
