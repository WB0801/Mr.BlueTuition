export type UpdatePhase = 'idle' | 'checking' | 'latest' | 'preparing' | 'ready' | 'applying' | 'error' | 'offline' | 'unsupported'
export interface UpdateState { phase: UpdatePhase; message: string; needRefresh: boolean; isOfflineReady: boolean }
interface Options {
  baseUrl: string
  buildId: string
  container?: ServiceWorkerContainer
  fetchVersion: (signal: AbortSignal) => Promise<string>
  online: () => boolean
  blocked: () => string
  reload: () => void
  saveConfirmation: (value: { from: string; to: string }) => void
  timeoutMs?: number
}
export const UPDATE_ATTEMPT_KEY = 'mr-blue-update-attempt'
export function consumeUpdateConfirmation(buildId: string) {
  try {
    // Discard the old pre-activation flag: it is not evidence of a changed build.
    sessionStorage.removeItem('lan-laoshi-pwa-update-completed')
    const raw = sessionStorage.getItem(UPDATE_ATTEMPT_KEY)
    sessionStorage.removeItem(UPDATE_ATTEMPT_KEY)
    if (!raw) return ''
    const attempt = JSON.parse(raw)
    return attempt.from !== buildId && attempt.to === buildId ? 'App 已更新。' : '更新尚未确认，请再检查一次。'
  } catch { return '' }
}

// Native registration states are authoritative, including updates installed by another tab.
// Workbox Window's own/external event heuristic is deliberately not used for this decision.
export class UpdateController {
  state: UpdateState = { phase: 'idle', message: '', needRefresh: false, isOfflineReady: false }
  private listeners = new Set<() => void>()
  private registration?: ServiceWorkerRegistration
  private registerPromise?: Promise<ServiceWorkerRegistration>
  private checking?: Promise<void>
  private applying?: Promise<void>
  private revision = 0
  private disposed = false
  private reloaded = false
  private takenOver = false
  private previousController?: ServiceWorker | null
  private targetVersion?: string
  private cleanups: Array<() => void> = []
  private workers = new WeakSet<ServiceWorker>()
  private listening = false
  private disposeTimer?: ReturnType<typeof setTimeout>
  constructor(private options: Options) {
    this.previousController = options.container?.controller
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  mount() { clearTimeout(this.disposeTimer) }
  unmount() { this.disposeTimer = setTimeout(() => this.dispose(), 0) }
  snapshot = () => this.state
  private set(phase: UpdatePhase, message: string, needRefresh = this.state.needRefresh) {
    if (this.disposed || this.reloaded) return
    this.state = { phase, message, needRefresh, isOfflineReady: this.registration?.active?.state === 'activated' }
    this.listeners.forEach(listener => listener())
  }
  dismiss() { this.set('idle', '') } // Hide feedback only, never lose a waiting update.
  private inspect = () => {
    const registration = this.registration
    if (!registration) return
    for (const worker of [registration.installing, registration.waiting, registration.active]) {
      if (!worker || this.workers.has(worker)) continue
      this.workers.add(worker)
      worker.addEventListener('statechange', this.inspect)
      this.cleanups.push(() => worker.removeEventListener('statechange', this.inspect))
    }
    if (this.applying) return
    if (registration.waiting || this.takenOver) this.set('ready', '发现新版，可以立即更新。', true)
    else if (registration.installing) this.set('preparing', registration.active ? '新版准备中…' : '正在准备离线使用…')
  }
  private onControllerChange = () => {
    const current = this.options.container?.controller
    // First installation is not an update to the code already running in this tab.
    if (current && current !== this.previousController && (this.previousController || this.applying)) {
      this.takenOver = true
      this.revision++
      if (!this.applying) this.set('ready', this.options.blocked() || '新版已接管，更新页面即可使用。', true)
    }
    this.previousController = current
  }
  private async register() {
    if (this.registration) return this.registration
    if (!this.options.container) throw new Error('unsupported')
    this.registerPromise ??= this.options.container.register(new URL('sw.js', this.options.baseUrl).href, { scope: this.options.baseUrl, updateViaCache: 'none' })
    const attempt = this.registerPromise
    try {
      const registration = await attempt
      if (attempt !== this.registerPromise) throw new Error('superseded registration')
      if (registration.scope !== this.options.baseUrl) throw new Error('wrong scope')
      if (this.disposed) throw new Error('disposed')
      this.registration = registration
      registration.addEventListener('updatefound', this.inspect)
      this.cleanups.push(() => registration.removeEventListener('updatefound', this.inspect))
      this.inspect()
      return registration
    } catch (error) { if (this.registerPromise === attempt) this.registerPromise = undefined; throw error }
  }
  initialize = async () => {
    if (!this.options.container) { this.set('unsupported', '此浏览器不支持 App 更新检查。'); return }
    if (!this.listening) { this.listening = true; this.options.container.addEventListener('controllerchange', this.onControllerChange) }
    try {
      if (!this.options.online()) {
        const existing = await this.options.container.getRegistration?.(this.options.baseUrl)
        if (existing?.scope === this.options.baseUrl && !this.disposed) {
          this.registration = existing
          existing.addEventListener('updatefound', this.inspect)
          this.cleanups.push(() => existing.removeEventListener('updatefound', this.inspect))
          this.inspect()
        }
        this.set('offline', '离线无法检查，请连接网络后重试。')
      } else await this.bounded(async () => { await this.register() })
    } catch { this.registerPromise = undefined; this.set('error', 'App 更新注册未完成，请重试。') }
  }
  private async bounded<T>(run: (signal: AbortSignal) => Promise<T>) {
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([run(abort.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('timeout')) }, this.options.timeoutMs ?? 20000)
      })])
    } finally { clearTimeout(timer); abort.abort() }
  }
  private waitUntil(test: () => boolean, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const finish = () => { clearInterval(timer); signal.removeEventListener('abort', cancel) }
      const poll = () => { if (this.disposed) { finish(); reject(new Error('disposed')) } else if (test()) { finish(); resolve() } }
      const cancel = () => { finish(); reject(new Error('timeout')) }
      const timer = setInterval(poll, 50)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel(); else poll()
    })
  }
  check = (): Promise<void> => {
    if (this.applying) return this.applying
    if (this.checking) return this.checking
    if (!this.options.container) { this.set('unsupported', '此浏览器不支持 App 更新检查。'); return Promise.resolve() }
    if (!this.options.online()) { this.set('offline', '离线无法检查，请连接网络后重试。'); return Promise.resolve() }
    if (this.reloaded || this.disposed) return Promise.resolve()
    if (!this.listening) { this.listening = true; this.options.container.addEventListener('controllerchange', this.onControllerChange) }
    const revision = this.revision
    this.set('checking', '检查中…')
    const run = this.bounded(async signal => {
      const registration = await this.register()
      if (signal.aborted || revision !== this.revision) return
      // Always fetch uncached deployment identity. update() resolving is NOT a verdict.
      const version = await this.options.fetchVersion(signal)
      if (signal.aborted || revision !== this.revision) return
      this.targetVersion = version
      if (registration.waiting || this.takenOver) { this.inspect(); return }
      await registration.update()
      if (signal.aborted || revision !== this.revision) return
      this.inspect()
      await this.waitUntil(() => {
        if (revision !== this.revision) return true
        if (registration.waiting || this.takenOver) { this.inspect(); return true }
        if (registration.installing) { this.inspect(); return false }
        if (version === this.options.buildId && registration.active?.state === 'activated') {
          this.set('latest', '已是最新版。', false); return true
        }
        // Metadata says the page is old, but no ready worker yet: do not guess latest.
        return false
      }, signal)
    }).catch(() => {
      if (!this.registration) this.registerPromise = undefined
      if (revision === this.revision && !this.disposed) this.set('error', '检查未完成或失败，请重试。')
    }).finally(() => { if (this.checking === run) this.checking = undefined })
    this.checking = run
    return run
  }
  apply = (): Promise<void> => {
    if (this.applying) return this.applying
    if (this.reloaded || this.disposed) return Promise.resolve()
    const blocked = this.options.blocked()
    if (blocked) { this.set('ready', blocked, true); return Promise.resolve() }
    const waiting = this.registration?.waiting
    if (!waiting && !this.takenOver) { this.set('error', '新版尚未准备好，请检查更新。'); return Promise.resolve() }
    this.revision++ // Invalidate any older check response before applying.
    this.set('applying', '正在更新…', true)
    const run = this.bounded(async signal => {
      // A waiting worker may have been installed by another tab since our last check.
      this.targetVersion = await this.options.fetchVersion(signal)
      if (signal.aborted || this.disposed) return
      if (!this.takenOver) {
        waiting?.postMessage({ type: 'SKIP_WAITING' })
        await this.waitUntil(() => this.takenOver, signal)
      }
      if (signal.aborted || this.disposed) return
      const newBlock = this.options.blocked()
      if (newBlock) { this.set('ready', newBlock, true); return }
      this.options.saveConfirmation({ from: this.options.buildId, to: this.targetVersion })
      this.reloaded = true
      try { this.options.reload() } // Same address; one controlled reload after takeover and a second safety check.
      catch (error) { this.reloaded = false; throw error }
    }).catch(() => this.set('error', '更新未完成，请重试；当前资料未清除。', true))
      .finally(() => { if (this.applying === run) this.applying = undefined })
    this.applying = run
    return run
  }
  dispose() {
    this.disposed = true; this.revision++
    this.options.container?.removeEventListener('controllerchange', this.onControllerChange)
    this.cleanups.forEach(cleanup => cleanup()); this.listeners.clear()
  }
}
