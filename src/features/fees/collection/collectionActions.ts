import type { QueryClient } from '@tanstack/react-query'
import { isCancelledError } from '@tanstack/react-query'
import { getErrorMessage } from '../../../utils/errors'

export interface CollectionFact { id: string; payment_status?: string; receipt_status?: string; cancelled_at?: string | null; updated_at?: string }
/** Compare server versions, including Postgres sub-millisecond precision. */
export function newerCollectionFact(left?: CollectionFact, right?: CollectionFact) {
  const a = Date.parse(left?.updated_at ?? ''), b = Date.parse(right?.updated_at ?? '')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return a > b || (a === b && (left?.updated_at?.match(/\.(\d+)/)?.[1].slice(3).padEnd(6, '0') ?? '000000') > (right?.updated_at?.match(/\.(\d+)/)?.[1].slice(3).padEnd(6, '0') ?? '000000'))
}
export interface CollectionState {
  phase: 'pending' | 'checking' | 'confirmed' | 'rejected' | 'uncertain' | 'retry' | 'verified'
  startedAt: number
  message: string
  fact?: CollectionFact
  refreshFailed?: boolean
  refreshing?: boolean
  visualDone?: boolean
  operation?: number
}
export interface CollectionRequest<T extends CollectionFact = CollectionFact> {
  id: string
  pay: () => Promise<T>
  verify: () => Promise<T>
  onFact: (fact: T) => void
  refresh: () => Promise<unknown>
}
function definiteRejection(error: unknown) {
  const code = (error as { code?: string })?.code ?? ''
  const status = (error as { status?: number })?.status
  return /^(P0001|22[A-Z0-9]{3}|23[A-Z0-9]{3}|42501)$/.test(code) || [400,401,403,404,409,422].includes(status ?? 0)
}
function bounded<T>(request: Promise<T>, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([request, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('request timeout')), ms) })]).finally(() => clearTimeout(timer))
}

/** Ephemeral UI outcomes, keyed by source + original payment UUID. No business persistence. */
export class CollectionActions {
  private states = new Map<string, CollectionState>()
  private listeners = new Set<() => void>()
  private users = new Map<string, number>()
  private abandoned = new Set<string>()
  private observed = new Map<string, CollectionFact>()
  private nextOperation = 0
  get busy() { return [...this.states.values()].some(state => state.phase === 'pending' || state.phase === 'checking') }
  snapshot = () => this.states
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(key: string, value: CollectionState) { this.states = new Map(this.states).set(key, value); this.listeners.forEach(fn => fn()) }
  retain(key: string) { this.abandoned.delete(key); this.users.set(key, (this.users.get(key) ?? 0) + 1); return () => {
    const count = (this.users.get(key) ?? 1) - 1
    if (count) this.users.set(key, count)
    else { this.users.delete(key); if (!['pending','checking'].includes(this.states.get(key)?.phase ?? '')) { this.clear(key); this.observed.delete(key) } else this.abandoned.add(key) }
  } }
  clear(key: string) { if (!this.states.has(key)) return; this.states = new Map(this.states); this.states.delete(key); this.listeners.forEach(fn => fn()) }
  resolveFact<T extends CollectionFact>(key: string, incoming?: T) {
    const observed = this.observed.get(key), fact = this.states.get(key)?.fact
    let latest: CollectionFact | undefined = newerCollectionFact(observed, incoming) ? observed : incoming
    if (fact && (!latest || !newerCollectionFact(latest, fact))) latest = fact
    return latest as T | undefined
  }
  observe(key: string, incoming: CollectionFact) {
    const previous = this.observed.get(key)
    if (!previous || newerCollectionFact(incoming, previous)) this.observed.set(key, incoming)
    const latest = this.observed.get(key), state = this.states.get(key)
    if (!state?.fact || !newerCollectionFact(latest, state.fact) || ['pending','checking'].includes(state.phase)) return
    if (state.phase === 'confirmed' && latest?.payment_status === 'paid' && !latest.cancelled_at) this.set(key, { ...state, fact: latest })
    else this.clear(key) // A newer undo/cancellation must also release the old action lock.
  }
  private acceptFact<T extends CollectionFact>(key: string, incoming: T): T {
    const observed = this.observed.get(key)
    if (newerCollectionFact(observed, incoming)) return observed as T
    this.observed.set(key, incoming)
    return incoming
  }
  visualDone(key: string) { const state = this.states.get(key); if (state) this.set(key, { ...state, visualDone: true }) }
  markConfirmed(key: string, startedAt: number) { this.set(key, { phase: 'confirmed', startedAt, message: '' }) }
  async run<T extends CollectionFact>(key: string, options: CollectionRequest<T>) {
    if (['pending','checking','uncertain','verified','confirmed'].includes(this.states.get(key)?.phase ?? '')) return
    const startedAt = Date.now()
    const operation = ++this.nextOperation
    this.set(key, { phase: 'pending', startedAt, message: '处理中…', operation })
    try {
      const response = await bounded(options.pay())
      if (response.id !== options.id || response.payment_status !== 'paid') throw new Error('unconfirmed payment result')
      const fact = this.acceptFact(key, response)
      if (fact.payment_status !== 'paid' || fact.cancelled_at) { this.clear(key); await options.refresh().catch(() => undefined); return }
      this.set(key, { phase: 'confirmed', startedAt, message: '', fact, refreshing: true, operation })
      options.onFact(fact)
      await this.refresh(key, options)
    } catch (error) {
      // A failed read after a confirmed write must never be reported as a failed collection.
      if (this.states.get(key)?.phase === 'confirmed') return
      if (definiteRejection(error)) this.set(key, { phase: 'rejected', startedAt, message: getErrorMessage(error, '收款被拒绝，请核对当前记录后重试。') })
      else {
        this.set(key, { phase: 'uncertain', startedAt, message: '收款结果未确认，正在核对原付款记录…' })
        await this.verify(key, options)
      }
    } finally { if (this.abandoned.has(key)) { this.abandoned.delete(key); this.clear(key); this.observed.delete(key) } }
  }
  async verify<T extends CollectionFact>(key: string, options: CollectionRequest<T>) {
    const previous = this.states.get(key)
    if (previous?.phase === 'checking') return
    const startedAt = previous?.startedAt ?? Date.now()
    this.set(key, { ...previous, phase: 'checking', startedAt, message: '收款结果未确认，正在核对原付款记录…' })
    try {
      const response = await bounded(options.verify())
      if (response.id !== options.id) throw new Error('wrong payment identity')
      const fact = this.acceptFact(key, response)
      const canRetry = fact.payment_status === 'unpaid' && !fact.cancelled_at
      this.set(key, { phase: canRetry ? 'retry' : 'verified', startedAt, fact, message: fact.payment_status === 'paid' ? '收款结果未确认；最新记录已缴。' : canRetry ? '收款结果未确认；最新记录仍未缴，可明确重试。' : '最新状态已变化，不能继续收款，请核对。' })
      options.onFact(fact)
      // Refresh is read-only and cannot replay the original operation.
      await options.refresh().catch(() => undefined)
    } catch { this.set(key, { phase: 'uncertain', startedAt, message: '收款结果未确认，原付款核对失败，请重试核对。' }) }
    finally { if (this.abandoned.has(key)) { this.abandoned.delete(key); this.clear(key); this.observed.delete(key) } }
  }
  async refresh<T extends CollectionFact>(key: string, options: CollectionRequest<T>) {
    const operation = this.states.get(key)?.operation
    try {
      await options.refresh()
      const state = this.states.get(key)
      if (state?.phase === 'confirmed' && state.operation === operation) this.set(key, { ...state, refreshing: false, refreshFailed: false, message: '' })
    } catch {
      const state = this.states.get(key)
      if (state?.phase === 'confirmed' && state.operation === operation) this.set(key, { ...state, refreshing: false, refreshFailed: true, message: '已确认缴费；列表刷新失败，请重试刷新。' })
    }
  }
}
const stores = new WeakMap<QueryClient, CollectionActions>()
export function collectionActions(client: QueryClient) { let store = stores.get(client); if (!store) { store = new CollectionActions(); stores.set(client, store) } return store }
const readBatches = new WeakMap<QueryClient, { revision: number; completed: number; keys: Map<string, readonly unknown[]>; running?: Promise<void> }>()
export function refreshCollectionReads(client: QueryClient, keys: readonly (readonly unknown[])[]): Promise<void> {
  let batch = readBatches.get(client)
  if (!batch) { batch = { revision: 0, completed: 0, keys: new Map() }; readBatches.set(client, batch) }
  batch.revision++
  keys.forEach(key => batch!.keys.set(JSON.stringify(key), key))
  if (batch.running) { const requested = batch.revision, current = batch; return current.running!.then(() => { if (current.completed < requested) return refreshCollectionReads(client, keys) }) }
  const active = batch
  // Coalesce reads only. Every payment RPC starts independently before this step.
  active.running = (async () => {
    for (;;) {
      const revision = active.revision
      const results = await Promise.allSettled([...active.keys.values()].map(queryKey => client.invalidateQueries({ queryKey, predicate: query => !query.queryKey.some(part => typeof part === 'string' && (part === 'ensure' || part.includes('generation'))) }, { throwOnError: true, cancelRefetch: false })))
      if (revision !== active.revision) continue // A later write needs a newer read snapshot.
      const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      if (failures.some(item => isCancelledError(item.reason))) continue
      if (failures.length) throw failures[0].reason
      active.completed = revision
      return
    }
  })().finally(() => { active.running = undefined; active.keys.clear() })
  return active.running
}
