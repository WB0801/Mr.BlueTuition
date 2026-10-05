import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { PwaProvider } from './PwaProvider'
import { usePwa } from './pwaContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { runningBuild } from './buildVersion'
import { StrictMode } from 'react'

const update = vi.fn().mockResolvedValue(undefined)
function Probe() {
  const pwa = usePwa()
  return <><button onClick={() => void pwa.checkForUpdate()}>检查</button><p role="status">{pwa.statusMessage}</p><span>{pwa.phase}</span></>
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const registration = Object.assign(new EventTarget(), { scope: location.origin + '/', update, active: { state: 'activated', addEventListener: vi.fn(), removeEventListener: vi.fn() } })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration) }) })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))
  sessionStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
function Wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={new QueryClient()}><PwaProvider>{children}</PwaProvider></QueryClientProvider> }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('does not report a completed check without determining the installed version', async () => {
  render(<Wrapper><Probe /></Wrapper>)
  await act(async () => screen.getByRole('button', { name: '检查' }).click())
  expect(screen.getByRole('status')).not.toHaveTextContent('已检查更新；有新版本时会显示重新载入提示。')
})
it('does not claim success from a pre-reload marker without a changed build', () => {
  sessionStorage.setItem('lan-laoshi-pwa-update-completed', '1')
  render(<Wrapper><Probe /></Wrapper>)
  expect(screen.getByRole('status')).not.toHaveTextContent('App 已更新至最新版本。')
})
it('checks after registration and rechecks visible/online recovery, but not hidden/offline interval work', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => runningBuild }))
  render(<Wrapper><Probe /></Wrapper>)
  await waitFor(() => expect(screen.getByText('latest')).toBeInTheDocument())
  expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
  // Trigger after the documented 10-second automatic deduplication window; manual check bypasses it.
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11000)
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(fetch).toHaveBeenCalledTimes(2)
  await act(async () => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')) })
  expect(fetch).toHaveBeenCalledTimes(2)
  await act(async () => screen.getByRole('button', { name: '检查' }).click()); expect(fetch).toHaveBeenCalledTimes(3)
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11000)
  await act(async () => window.dispatchEvent(new Event('online'))); expect(fetch).toHaveBeenCalledTimes(4)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await act(async () => document.dispatchEvent(new Event('visibilitychange'))); expect(fetch).toHaveBeenCalledTimes(4)
})
it('survives StrictMode effect replay and detaches on final unmount', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => runningBuild }))
  const remove = vi.spyOn(navigator.serviceWorker, 'removeEventListener')
  const { unmount } = render(<StrictMode><Wrapper><Probe /></Wrapper></StrictMode>)
  await waitFor(() => expect(screen.getByText('latest')).toBeInTheDocument())
  unmount(); await waitFor(() => expect(remove).toHaveBeenCalledWith('controllerchange', expect.any(Function)))
})
