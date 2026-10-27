import { CollectionActions } from './collectionActions'
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a;reject=b }); return { promise, resolve, reject } }
it('runs three distinct identities immediately, deduplicates a pending identity, and handles reverse completion independently', async () => {
  const store = new CollectionActions(), requests = [deferred<{ id: string; payment_status: string }>(),deferred<{ id: string; payment_status: string }>(),deferred<{ id: string; payment_status: string }>()]
  const pay = requests.map(request => vi.fn(() => request.promise)), callbacks = pay.map((request,i) => ({ pay: request, verify: vi.fn(), onFact: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined), id: String(i) }))
  const runs = callbacks.map((options,i) => store.run(i===2?'temporary_class_payment:0':`monthly_fee:${i}`,options))
  await store.run('monthly_fee:0',callbacks[0]); pay.forEach(fn=>expect(fn).toHaveBeenCalledTimes(1))
  for(const i of [2,1,0]) { requests[i].resolve({ id:String(i),payment_status:'paid' }); await runs[i]; expect(callbacks[i].onFact).toHaveBeenCalledWith({id:String(i),payment_status:'paid'}) }
  expect(store.snapshot().get('monthly_fee:0')?.phase).toBe('confirmed'); expect(store.snapshot().get('temporary_class_payment:0')?.phase).toBe('confirmed')
})
it('distinguishes lost response, verified paid and refresh failure without reissuing payment', async () => {
  const store = new CollectionActions(), options = { id:'a',pay:vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),verify:vi.fn().mockResolvedValue({id:'a',payment_status:'paid'}),onFact:vi.fn(),refresh:vi.fn().mockRejectedValue(new Error('read failed')) }
  await store.run('monthly_fee:a',options)
  expect(store.snapshot().get('monthly_fee:a')).toMatchObject({phase:'verified',message:expect.stringContaining('最新记录已缴')})
  expect(options.pay).toHaveBeenCalledTimes(1); expect(options.verify).toHaveBeenCalledTimes(1)
  await store.run('monthly_fee:a',options); expect(options.pay).toHaveBeenCalledTimes(1)
})
it('keeps a definite refusal local; an uncertain unpaid result requires an explicit retry', async () => {
  const store = new CollectionActions(), options = {id:'a',pay:vi.fn().mockRejectedValueOnce({code:'P0001',message:'已取消'}).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({id:'a',payment_status:'paid'}),verify:vi.fn().mockResolvedValue({id:'a',payment_status:'unpaid'}),onFact:vi.fn(),refresh:vi.fn().mockResolvedValue(undefined)}
  await store.run('monthly_fee:a',options); expect(store.snapshot().get('monthly_fee:a')?.phase).toBe('rejected'); expect(options.verify).not.toHaveBeenCalled()
  await store.run('monthly_fee:a',options); expect(store.snapshot().get('monthly_fee:a')?.phase).toBe('retry'); expect(options.pay).toHaveBeenCalledTimes(2)
  await store.run('monthly_fee:a',options); expect(options.pay).toHaveBeenCalledTimes(3); expect(store.snapshot().get('monthly_fee:a')?.phase).toBe('confirmed')
})
it('does not turn a confirmed write into a failure when refresh fails; retry only refreshes', async () => {
  const store = new CollectionActions(), options = {id:'a',pay:vi.fn().mockResolvedValue({id:'a',payment_status:'paid'}),verify:vi.fn(),onFact:vi.fn(),refresh:vi.fn().mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValue(undefined)}
  await store.run('monthly_fee:a',options); expect(store.snapshot().get('monthly_fee:a')).toMatchObject({phase:'confirmed',refreshFailed:true})
  await store.refresh('monthly_fee:a',options); expect(options.pay).toHaveBeenCalledTimes(1); expect(store.snapshot().get('monthly_fee:a')?.refreshFailed).toBe(false)
})
it('keeps background work protected after its row unmounts and releases only ephemeral state after settling', async () => {
  const store=new CollectionActions(), request=deferred<{id:string;payment_status:string}>(), release=store.retain('monthly_fee:a')
  const run=store.run('monthly_fee:a',{id:'a',pay:()=>request.promise,verify:vi.fn(),onFact:vi.fn(),refresh:async()=>{}})
  release();expect(store.busy).toBe(true)
  request.resolve({id:'a',payment_status:'paid'});await run
  expect(store.busy).toBe(false);expect(store.snapshot().has('monthly_fee:a')).toBe(false)
})
it('times out into read-only reconciliation without automatically replaying collection', async () => {
  vi.useFakeTimers()
  const store=new CollectionActions(), pay=vi.fn(()=>new Promise<never>(()=>{})), verify=vi.fn().mockResolvedValue({id:'a',payment_status:'unpaid'})
  try {
    const run=store.run('monthly_fee:a',{id:'a',pay,verify,onFact:vi.fn(),refresh:async()=>{}})
    await vi.advanceTimersByTimeAsync(15001);await run
    expect(store.snapshot().get('monthly_fee:a')?.phase).toBe('retry');expect(pay).toHaveBeenCalledTimes(1);expect(verify).toHaveBeenCalledTimes(1)
  } finally {vi.useRealTimers()}
})
