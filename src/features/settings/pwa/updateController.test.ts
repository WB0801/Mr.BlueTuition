import { vi } from 'vitest'
import { UpdateController, consumeUpdateConfirmation } from './updateController'

class Worker extends EventTarget {
  state: ServiceWorkerState = 'activated'
  scriptURL = 'https://example.test/Mr.BlueTuition/sw.js'
  postMessage = vi.fn()
  change(state: ServiceWorkerState) { this.state = state; this.dispatchEvent(new Event('statechange')) }
}
function fixture() {
  const container = Object.assign(new EventTarget(), { controller: new Worker(), register: vi.fn() })
  const registration = Object.assign(new EventTarget(), { scope: 'https://example.test/Mr.BlueTuition/', active: new Worker(), installing: null as Worker | null, waiting: null as Worker | null, update: vi.fn().mockResolvedValue(undefined) })
  container.register.mockResolvedValue(registration)
  let version = 'A', online = true, blocked = ''
  const fetchVersion = vi.fn(async () => version)
  const reload = vi.fn(), storage = new Map<string, string>()
  const controller = new UpdateController({ baseUrl: registration.scope, buildId: 'A', container: container as unknown as ServiceWorkerContainer, fetchVersion, online: () => online, blocked: () => blocked, reload, saveConfirmation: value => storage.set('confirmation', JSON.stringify(value)), timeoutMs: 1000 })
  return { controller, container, registration, fetchVersion, reload, storage, version: (value: string) => { version = value }, online: (value: boolean) => { online = value }, blocked: (value: string) => { blocked = value } }
}
afterEach(() => { vi.useRealTimers() })
it('confirms latest only with fresh matching metadata and a settled active worker', async () => {
  const f = fixture(); await f.controller.check(); expect(f.controller.state.phase).toBe('latest')
  expect(f.container.register).toHaveBeenCalledWith('https://example.test/Mr.BlueTuition/sw.js', { scope: 'https://example.test/Mr.BlueTuition/', updateViaCache: 'none' })
  f.controller.dispose()
})
it('recognizes an existing waiting worker without waiting for updatefound', async () => {
  const f = fixture(); f.registration.waiting = new Worker(); f.version('B'); await f.controller.check()
  expect(f.controller.state.needRefresh).toBe(true); expect(f.controller.state.phase).toBe('ready'); f.controller.dispose()
})
it('waits for installing to become waiting, including consecutive external updates', async () => {
  const f = fixture(); f.version('B'); const worker = new Worker(); worker.state = 'installing'; f.registration.installing = worker
  const check = f.controller.check(); await vi.waitFor(() => expect(f.controller.state.phase).toBe('preparing'))
  f.registration.waiting = worker; f.registration.installing = null; worker.change('installed'); await check
  expect(f.controller.state.phase).toBe('ready'); f.controller.dispose()
})
it('coalesces repeated clicks and times out without a false latest result; retry works', async () => {
  vi.useFakeTimers(); const f = fixture(); f.version('B')
  const first = f.controller.check(), second = f.controller.check(); expect(second).toBe(first)
  await vi.advanceTimersByTimeAsync(1100); await first; expect(f.controller.state.phase).toBe('error')
  f.version('A'); await f.controller.check(); expect(f.controller.state.phase).toBe('latest'); f.controller.dispose()
})
it('handles offline, registration failure and failed network reads without pretending success', async () => {
  const f = fixture(); f.online(false); await f.controller.check(); expect(f.controller.state.phase).toBe('offline'); expect(f.fetchVersion).not.toHaveBeenCalled()
  f.online(true); f.container.register.mockRejectedValueOnce(new Error('registration failed')); await f.controller.check(); expect(f.controller.state.phase).toBe('error')
  f.fetchVersion.mockRejectedValueOnce(new Error('network failed')); await f.controller.check(); expect(f.controller.state.phase).toBe('error'); f.controller.dispose()
})
it('handles unsupported SW and rejects a registration from another app scope', async () => {
  const f = fixture(); const unsupported = new UpdateController({ baseUrl: f.registration.scope, buildId: 'A', online: () => true, fetchVersion: f.fetchVersion, blocked: () => '', reload: f.reload, saveConfirmation: () => {} })
  await unsupported.check(); expect(unsupported.state.phase).toBe('unsupported')
  f.registration.scope = 'https://example.test/other/'; await f.controller.check(); expect(f.controller.state.phase).toBe('error'); f.controller.dispose()
})
it('does not write success or reload when update fails to take control', async () => {
  vi.useFakeTimers(); const f = fixture(); f.registration.waiting = new Worker(); f.version('B'); await f.controller.check()
  const apply = f.controller.apply(); await vi.advanceTimersByTimeAsync(1100); await apply
  expect(f.controller.state.phase).toBe('error'); expect(f.storage.size).toBe(0); expect(f.reload).not.toHaveBeenCalled(); f.controller.dispose()
})
it('blocks dirty/signature/batch work before skipWaiting and after multi-tab takeover', async () => {
  const f = fixture(); f.registration.waiting = new Worker(); f.version('B'); await f.controller.check(); f.blocked('请先完成签名')
  await f.controller.apply(); expect(f.registration.waiting.postMessage).not.toHaveBeenCalled(); expect(f.controller.state.needRefresh).toBe(true)
  f.container.controller = new Worker(); f.container.dispatchEvent(new Event('controllerchange')); expect(f.reload).not.toHaveBeenCalled()
  await f.controller.apply(); expect(f.reload).not.toHaveBeenCalled(); f.blocked(''); await f.controller.apply(); expect(f.reload).toHaveBeenCalledTimes(1); f.controller.dispose()
})
it('rechecks safety when a new edit starts while an update is applying', async () => {
  const f = fixture(); f.registration.waiting = new Worker(); f.version('B'); await f.controller.check()
  const apply = f.controller.apply(); f.blocked('操作正在提交'); f.container.controller = new Worker(); f.container.dispatchEvent(new Event('controllerchange')); await apply
  expect(f.reload).not.toHaveBeenCalled(); expect(f.storage.size).toBe(0); expect(f.controller.state.needRefresh).toBe(true); f.controller.dispose()
})
it('reloads once after real takeover and invalidates a late check response', async () => {
  const f = fixture(); f.registration.waiting = new Worker(); f.version('B'); await f.controller.check()
  const apply = f.controller.apply(); f.container.controller = new Worker(); f.container.dispatchEvent(new Event('controllerchange')); await apply
  f.container.dispatchEvent(new Event('controllerchange')); await f.controller.apply(); expect(f.reload).toHaveBeenCalledTimes(1); expect(JSON.parse(f.storage.get('confirmation')!)).toEqual({ from: 'A', to: 'B' }); f.controller.dispose()
})
it('ignores a late network response after timeout and after a newer takeover', async () => {
  vi.useFakeTimers(); const f = fixture(); let resolve!: (version: string) => void
  f.fetchVersion.mockImplementationOnce(() => new Promise<string>(done => { resolve = done }))
  const check = f.controller.check(); await vi.advanceTimersByTimeAsync(1100); await check; expect(f.controller.state.phase).toBe('error')
  f.registration.waiting = new Worker(); f.registration.dispatchEvent(new Event('updatefound')); expect(f.controller.state.phase).toBe('ready')
  resolve('A'); await Promise.resolve(); expect(f.controller.state.phase).toBe('ready'); f.controller.dispose()
})
it('first installation is not mistaken for an updated running page', async () => {
  const f = fixture(); f.container.controller = null as unknown as Worker
  // Controller created before first activation: it must not force a reload.
  const initial = new UpdateController({ baseUrl: f.registration.scope, buildId: 'A', container: f.container as unknown as ServiceWorkerContainer, fetchVersion: f.fetchVersion, online: () => true, blocked: () => '', reload: f.reload, saveConfirmation: () => {} })
  await initial.check(); f.container.controller = new Worker(); f.container.dispatchEvent(new Event('controllerchange'))
  expect(initial.state.needRefresh).toBe(false); expect(f.reload).not.toHaveBeenCalled(); initial.dispose(); f.controller.dispose()
})
it('uses fresh identity after another tab installs a version newer than the last latest check', async () => {
  const f = fixture(); await f.controller.check(); expect(f.controller.state.phase).toBe('latest')
  f.version('B'); f.registration.waiting = new Worker(); f.registration.dispatchEvent(new Event('updatefound'))
  const applying = f.controller.apply(); await vi.waitFor(() => expect(f.registration.waiting?.postMessage).toHaveBeenCalled())
  f.container.controller = new Worker(); f.container.dispatchEvent(new Event('controllerchange')); await applying
  expect(JSON.parse(f.storage.get('confirmation')!)).toEqual({ from: 'A', to: 'B' }); f.controller.dispose()
})
it('applies an existing waiting worker even when the starting page has no controller', async () => {
  const f = fixture(); f.container.controller = null as unknown as Worker; const waiting = new Worker(); f.registration.waiting = waiting; f.version('B')
  const uncontrolled = new UpdateController({ baseUrl: f.registration.scope, buildId: 'A', container: f.container as unknown as ServiceWorkerContainer, fetchVersion: f.fetchVersion, online: () => true, blocked: () => '', reload: f.reload, saveConfirmation: () => {}, timeoutMs: 500 })
  await uncontrolled.check(); const applying = uncontrolled.apply(); await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalled())
  f.container.controller = waiting; f.registration.waiting = null; f.container.dispatchEvent(new Event('controllerchange')); await applying
  expect(f.reload).toHaveBeenCalledTimes(1); uncontrolled.dispose(); f.controller.dispose()
})
it('retries a hung registration after offline startup and ignores its late result', async () => {
  vi.useFakeTimers(); const f = fixture(); f.online(false); await f.controller.initialize()
  let late!: (value: unknown) => void
  f.container.register.mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
  f.online(true); const first = f.controller.check(); await vi.advanceTimersByTimeAsync(1100); await first
  expect(f.controller.state.phase).toBe('error')
  await f.controller.check(); expect(f.container.register).toHaveBeenCalledTimes(2); expect(f.controller.state.phase).toBe('latest')
  const obsolete = Object.assign(new EventTarget(), { scope: f.registration.scope, waiting: new Worker() })
  late(obsolete); await vi.advanceTimersByTimeAsync(1); expect(f.controller.state.phase).toBe('latest'); f.controller.dispose()
})
it('confirms a changed matching running build once, never the old marker or unchanged build', () => {
  sessionStorage.clear(); sessionStorage.setItem('lan-laoshi-pwa-update-completed', '1'); expect(consumeUpdateConfirmation('A')).toBe('')
  sessionStorage.setItem('mr-blue-update-attempt', JSON.stringify({ from: 'A', to: 'B' })); expect(consumeUpdateConfirmation('A')).not.toContain('已更新')
  sessionStorage.setItem('mr-blue-update-attempt', JSON.stringify({ from: 'A', to: 'B' })); expect(consumeUpdateConfirmation('B')).toBe('App 已更新。'); expect(consumeUpdateConfirmation('B')).toBe('')
})
