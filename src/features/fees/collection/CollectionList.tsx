import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useCollectionRecords } from './collectionHooks'
import { CollectionPointer } from './collectionPointer'

export function CollectionList<T>({ records, recordKey, renderRecord, retireConfirmed, className = '', empty }: {
  records: T[]; recordKey: (record: T) => string; renderRecord: (record: T) => ReactNode; retireConfirmed?: boolean; className?: string; empty?: ReactNode
}) {
  const { merged, store, states } = useCollectionRecords(records, recordKey)
  const [pointer] = useState(() => new CollectionPointer())
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => root.current ? pointer.attach(root.current) : undefined, [pointer])
  const current = new Set(records.map(recordKey))
  return <div ref={root} className={`collection-list ${className}`}>
    {merged.map(record => {
      const key = recordKey(record), state = states.get(key)
      const remove = state?.phase === 'confirmed' && !state.refreshFailed && !state.refreshing && (retireConfirmed || !current.has(key))
      if (remove && state.visualDone) return null
      return <CollectionSlot key={key} identity={key} pointer={pointer} remove={Boolean(remove)} startedAt={state?.startedAt ?? 0} onDone={() => store.visualDone(key)}>{renderRecord(record)}</CollectionSlot>
    })}
    {merged.every(record => { const state = states.get(recordKey(record)); return state?.phase === 'confirmed' && state.visualDone && !state.refreshFailed && !state.refreshing && (retireConfirmed || !current.has(recordKey(record))) }) && empty}
  </div>
}

function CollectionSlot({ children, identity, pointer, remove, startedAt, onDone }: { children: ReactNode; identity: string; pointer: CollectionPointer; remove: boolean; startedAt: number; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null), done = useRef(onDone)
  const content = useRef<HTMLDivElement>(null), layoutAnimation = useRef<Animation | null>(null), retiring = useRef(remove)
  useLayoutEffect(() => { done.current = onDone }, [onDone])
  useLayoutEffect(() => { retiring.current = remove }, [remove])
  useLayoutEffect(() => {
    const node = root.current, inner = content.current
    if (!node || !inner || !window.ResizeObserver) return
    let previous = inner.getBoundingClientRect().height, frame = 0, unregister: (() => void) | undefined
    const observer = new ResizeObserver(() => {
      const next = inner.getBoundingClientRect().height
      if (retiring.current || Math.abs(next - previous) < .5) return
      const from = layoutAnimation.current ? node.getBoundingClientRect().height : previous
      previous = next
      node.style.height = `${from}px`
      layoutAnimation.current?.cancel(); unregister?.(); cancelAnimationFrame(frame)
      const reduced = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced || !node.animate) {
        const settle = () => { if (pointer.pressed) frame = requestAnimationFrame(settle); else node.style.height = '' }
        settle(); return
      }
      const animation = node.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: 800, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })
      layoutAnimation.current = animation; unregister = pointer.register(animation)
      animation.finished.then(() => {
        if (layoutAnimation.current !== animation || retiring.current) return
        node.style.height = ''; animation.cancel(); layoutAnimation.current = null; unregister?.()
      }, () => undefined)
    })
    observer.observe(inner)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); unregister?.(); layoutAnimation.current?.cancel() }
  }, [pointer])
  useLayoutEffect(() => {
    if (!root.current) return
    if (!remove) {
      const node = root.current
      if (!node.style.height) return
      const height = node.getBoundingClientRect().height, target = content.current?.getBoundingClientRect().height ?? height
      if (!node.animate || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let frame = 0
        const settle = () => { if (pointer.pressed) frame = requestAnimationFrame(settle); else node.style.height = '' }
        settle(); return () => cancelAnimationFrame(frame)
      }
      const animation = node.animate([{ height: `${height}px` }, { height: `${target}px` }], { duration: 800, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })
      layoutAnimation.current = animation
      const unregister = pointer.register(animation)
      animation.finished.then(() => { if (layoutAnimation.current === animation) { node.style.height = ''; animation.cancel(); layoutAnimation.current = null }; unregister() }, () => undefined)
      return () => { unregister(); animation.cancel() }
    }
    let animation: Animation | undefined, unregister: (() => void) | undefined, frame = 0, disposed = false
    const node = root.current
    const finish = () => { if (!disposed) done.current() }
    const reduced = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const begin = () => {
      if (disposed) return
      if (reduced || !node.animate) {
        if (pointer.pressed) { frame = requestAnimationFrame(begin); return }
        finish(); return
      }
      const height = node.getBoundingClientRect().height
      node.style.height = `${height}px`; layoutAnimation.current?.cancel()
      animation = node.animate([{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })
      unregister = pointer.register(animation)
      animation.finished.then(finish, () => undefined)
    }
    const timer = setTimeout(begin, Math.max(0, 500 - (Date.now() - startedAt)))
    return () => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); unregister?.(); if (animation) { const height = node.getBoundingClientRect().height; animation.cancel(); node.style.height = `${height}px` } }
  }, [remove, startedAt, pointer])
  return <div ref={root} data-collection-key={identity} className={`collection-slot${remove ? ' collection-retiring' : ''}`}><div ref={content} className="collection-content">{children}</div></div>
}
