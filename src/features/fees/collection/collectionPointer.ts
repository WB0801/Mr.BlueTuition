/** Native pointer identity and geometry guard. Never executes a business action. */
const orphanedPointers = new Set<number>()
export class CollectionPointer {
  private held = new Map<number, { control: Element | null; record: Element | null; rect?: DOMRect }>()
  private animations = new Set<Animation>()
  private validClick = true
  private resumeFrame = 0
  get pressed() { return this.held.size > 0 }
  register(animation: Animation) { this.animations.add(animation); if (this.pressed) animation.pause(); return () => { this.animations.delete(animation) } }
  attach(root: HTMLElement) {
    const control = (target: EventTarget | null) => target instanceof Element ? target.closest('button,a,input,select,textarea,summary,label') : null
    const down = (event: PointerEvent) => {
      cancelAnimationFrame(this.resumeFrame)
      const target = control(event.target)
      orphanedPointers.delete(event.pointerId)
      this.held.set(event.pointerId, { control: target, record: target?.closest('[data-collection-key]') ?? null, rect: target?.getBoundingClientRect() })
      this.validClick = true
      this.animations.forEach(animation => animation.pause())
    }
    const release = (event: PointerEvent) => {
      const start = this.held.get(event.pointerId)
      if (!start) return
      const end = control(event.target), rect = start.control?.getBoundingClientRect()
      this.validClick = event.type !== 'pointercancel' && Boolean(start.control?.isConnected && start.control === end && start.record === end?.closest('[data-collection-key]') && rect && start.rect
        && Math.abs(rect.x + rect.width / 2 - start.rect.x - start.rect.width / 2) < 2
        && Math.abs(rect.y + rect.height / 2 - start.rect.y - start.rect.height / 2) < 2
        && event.clientX >= rect.left - 2 && event.clientX <= rect.right + 2 && event.clientY >= rect.top - 2 && event.clientY <= rect.bottom + 2)
      this.held.delete(event.pointerId)
      this.resumeFrame = requestAnimationFrame(() => { if (!this.pressed) this.animations.forEach(animation => animation.play()) })
    }
    const click = (event: MouseEvent) => {
      // Keyboard Enter/Space activate with detail=0 and are not pointer gestures.
      const pointerId = (event as PointerEvent).pointerId
      const orphaned = typeof pointerId === 'number' ? orphanedPointers.has(pointerId) : orphanedPointers.size > 0
      if (event.detail > 0 && (!this.validClick || orphaned)) { event.preventDefault(); event.stopImmediatePropagation() }
      if (event.detail > 0) { if (typeof pointerId === 'number') orphanedPointers.delete(pointerId); else orphanedPointers.clear() }
      this.validClick = true
    }
    root.addEventListener('pointerdown', down, true)
    root.addEventListener('click', click, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    return () => {
      root.removeEventListener('pointerdown', down, true); root.removeEventListener('click', click, true)
      window.removeEventListener('pointerup', release, true); window.removeEventListener('pointercancel', release, true)
      this.held.forEach((_, id) => orphanedPointers.add(id))
      cancelAnimationFrame(this.resumeFrame); this.held.clear(); this.animations.forEach(animation => animation.cancel()); this.animations.clear()
    }
  }
}
