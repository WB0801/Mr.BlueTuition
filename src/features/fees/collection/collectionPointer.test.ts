import { fireEvent } from '@testing-library/react'
import { CollectionPointer } from './collectionPointer'
it.each(['pointercancel', 'moved'])('rejects a %s gesture while preserving the next keyboard activation', kind => {
  const root=document.createElement('div');root.innerHTML='<div data-collection-key="monthly_fee:a"><button>A</button></div>';document.body.append(root)
  const button=root.querySelector('button')!, pointer=new CollectionPointer(),detach=pointer.attach(root),handler=vi.fn()
  root.addEventListener('click',handler)
  let rect=new DOMRect(10,10,80,44);vi.spyOn(button,'getBoundingClientRect').mockImplementation(()=>rect)
  try {
    fireEvent(button,new MouseEvent('pointerdown',{bubbles:true,clientX:50,clientY:32}))
    if(kind==='moved')rect=new DOMRect(10,30,80,44)
    fireEvent(button,new MouseEvent(kind==='moved'?'pointerup':'pointercancel',{bubbles:true,clientX:50,clientY:32}))
    fireEvent.click(button,{detail:1});expect(handler).not.toHaveBeenCalled()
    fireEvent.click(button,{detail:0});expect(handler).toHaveBeenCalledTimes(1)
  } finally {detach();root.remove()}
})
it('pauses existing motion for a native pointer sequence and rejects a replaced control without blocking keyboard activation', () => {
  vi.useFakeTimers()
  const root=document.createElement('div');root.innerHTML='<div data-collection-key="monthly_fee:a"><button>A</button></div><div data-collection-key="monthly_fee:b"><button>B</button></div>';document.body.append(root)
  const pointer=new CollectionPointer(),detach=pointer.attach(root), animation={pause:vi.fn(),play:vi.fn(),cancel:vi.fn()} as unknown as Animation
  const remove=pointer.register(animation), handler=vi.fn();root.addEventListener('click',handler)
  try {
    const [a,b]=root.querySelectorAll('button');fireEvent.pointerDown(a,{pointerId:1});expect(animation.pause).toHaveBeenCalled()
    a.remove();fireEvent.pointerUp(b,{pointerId:1});fireEvent.click(b,{detail:1});expect(handler).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20);expect(animation.play).toHaveBeenCalled()
    fireEvent.click(b,{detail:0});expect(handler).toHaveBeenCalledTimes(1)
  } finally {remove();detach();root.remove();vi.useRealTimers()}
})
it('accepts a wide control whose existing pressed scale preserves its center', () => {
  const root=document.createElement('div');root.innerHTML='<div data-collection-key="monthly_fee:a"><button>A</button></div>';document.body.append(root)
  const button=root.querySelector('button')!, pointer=new CollectionPointer(), detach=pointer.attach(root), handler=vi.fn()
  root.addEventListener('click',handler)
  let rect=new DOMRect(10,10,300,44);vi.spyOn(button,'getBoundingClientRect').mockImplementation(()=>rect)
  try {
    fireEvent(button,new MouseEvent('pointerdown',{bubbles:true,clientX:160,clientY:32}))
    rect=new DOMRect(13,10.44,294,43.12)
    fireEvent(button,new MouseEvent('pointerup',{bubbles:true,clientX:160,clientY:32}));fireEvent.click(button,{detail:1})
    expect(handler).toHaveBeenCalledTimes(1)
  } finally {detach();root.remove()}
})
it('does not let a filter remount transfer a held gesture to a new record, without imposing a click cooldown', () => {
  const root=document.createElement('div');root.innerHTML='<div data-collection-key="monthly_fee:a"><button>A</button></div>';document.body.append(root)
  const first=new CollectionPointer(), detach=first.attach(root)
  fireEvent(root.querySelector('button')!,new MouseEvent('pointerdown',{bubbles:true,clientX:0,clientY:0}));detach()
  root.innerHTML='<div data-collection-key="monthly_fee:b"><button>B</button></div>'
  const second=new CollectionPointer(), stop=second.attach(root), handler=vi.fn();root.addEventListener('click',handler)
  try {
    const button=root.querySelector('button')!;fireEvent.click(button,{detail:1});expect(handler).not.toHaveBeenCalled()
    fireEvent(button,new MouseEvent('pointerdown',{bubbles:true,clientX:0,clientY:0}));fireEvent(button,new MouseEvent('pointerup',{bubbles:true,clientX:0,clientY:0}));fireEvent.click(button,{detail:1});expect(handler).toHaveBeenCalledTimes(1)
  } finally {stop();root.remove()}
})
