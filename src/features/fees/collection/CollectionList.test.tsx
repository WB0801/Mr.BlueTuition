import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionList } from './CollectionList'
import { collectionActions } from './collectionActions'

it('keeps the original row position and DOM after a fast success; begins an 800ms collapse only after the 500ms minimum', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  let finish!: () => void
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
  const animate = vi.fn(() => ({ finished: new Promise<void>(resolve => { finish=resolve }), cancel: vi.fn(), pause: vi.fn(), play: vi.fn() }) as unknown as Animation)
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  const client = new QueryClient(), rows=[{id:'a'},{id:'b'},{id:'c'}], key=(row:{id:string})=>'monthly_fee:'+row.id
  const content=(records:typeof rows)=><QueryClientProvider client={client}><CollectionList records={records} recordKey={key} retireConfirmed renderRecord={row=><button>{row.id}</button>} /></QueryClientProvider>
  try {
    const view=render(content(rows)), original=screen.getByRole('button',{name:'a'})
    act(()=>collectionActions(client).markConfirmed(key(rows[0]),Date.now()))
    view.rerender(content(rows.slice(1)))
    expect(screen.getAllByRole('button').map(row=>row.textContent)).toEqual(['a','b','c'])
    expect(screen.getByRole('button',{name:'a'})).toBe(original)
    await act(async()=>vi.advanceTimersByTime(499)); expect(animate).not.toHaveBeenCalled()
    await act(async()=>vi.advanceTimersByTime(1)); expect(animate).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({duration:800}))
    await act(async()=>finish()); expect(screen.queryByRole('button',{name:'a'})).not.toBeInTheDocument()
  } finally { if (original) Object.defineProperty(Element.prototype, 'animate', original); else Reflect.deleteProperty(Element.prototype, 'animate'); vi.unstubAllGlobals(); vi.useRealTimers() }
})

it('retains an uncertain record and never collapses it as an attributed success', async () => {
  const client=new QueryClient(), store=collectionActions(client), key=(row:{id:string})=>'monthly_fee:'+row.id
  const row={id:'a'},content=(records:typeof row[])=><QueryClientProvider client={client}><CollectionList records={records} recordKey={key} retireConfirmed renderRecord={item=><button>{item.id}</button>} /></QueryClientProvider>
  const view=render(content([row]))
  await act(async()=>store.run(key(row),{id:'a',pay:async()=>{throw new Error('offline')},verify:async()=>({id:'a',payment_status:'paid'}),onFact:()=>{},refresh:async()=>{}}))
  view.rerender(content([])); expect(screen.getByRole('button',{name:'a'})).toBeVisible()
})

it('uses a static reduced-motion result but still waits for the held gesture before removing its target', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const client = new QueryClient(), key = (row: { id: string }) => `monthly_fee:${row.id}`
  const row = { id: 'a' }
  try {
    render(<QueryClientProvider client={client}><CollectionList records={[row]} recordKey={key} retireConfirmed renderRecord={() => <button>reduced target</button>} /></QueryClientProvider>)
    const button = screen.getByRole('button', { name: 'reduced target' })
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }))
    act(() => collectionActions(client).markConfirmed(key(row), Date.now()))
    await act(async () => vi.advanceTimersByTime(600))
    expect(button).toBeVisible()
    button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }))
    await act(async () => vi.advanceTimersByTime(20))
    expect(screen.queryByRole('button', { name: 'reduced target' })).not.toBeInTheDocument()
  } finally { vi.unstubAllGlobals(); vi.useRealTimers() }
})
