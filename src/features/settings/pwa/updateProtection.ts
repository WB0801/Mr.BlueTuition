import { useId, useLayoutEffect } from 'react'
const reasons = new Map<string, string>()
const formChecks = new Set<() => string>()
export const updateProtection = { reason: () => reasons.values().next().value || [...formChecks].map(check => check()).find(Boolean) || '' }
export function usePwaUpdateGuard(blocked: boolean, reason = '操作正在进行，请完成后再更新。') {
  const id = useId()
  useLayoutEffect(() => {
    if (blocked) reasons.set(id, reason)
    else reasons.delete(id)
    return () => { reasons.delete(id) }
  }, [blocked, id, reason])
}
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
function isField(target: EventTarget | null): target is Field {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}
function value(field: Field) { return field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type) ? String(field.checked) : field.value }
export function acceptPwaFormChanges(form: HTMLFormElement, saved = new Map([...form.elements].filter(isField).map(field => [field, value(field)]))) {
  form.dispatchEvent(new CustomEvent('pwa:form-saved', { bubbles: true, detail: saved }))
}
export function preparePwaFormSave(form: HTMLFormElement) {
  const saved = new Map([...form.elements].filter(isField).map(field => [field, value(field)]))
  // Only explicit post-save resets may replace submitted values. Never read the
  // whole current form here: edits made while saving must remain protected.
  return (resets?: ReadonlyMap<Field, string>) => acceptPwaFormChanges(form,
    new Map([...saved].map(([field, submitted]) => [field, resets?.get(field) ?? submitted])),
  )
}
export function createFormProtection(doc: Document) {
  const originals = new Map<Field, string>(), edited = new Set<Field>()
  function remember(field: Field) { if (field.form && !originals.has(field)) originals.set(field, value(field)) }
  function beforeEdit(event: Event) {
    if (!isField(event.target) || !event.target.form) return
    for (const field of event.target.form.elements) if (isField(field)) remember(field)
  }
  function afterEdit(event: Event) {
    if (isField(event.target) && event.target.form) edited.add(event.target)
  }
  function saved(event: Event) {
    const snapshot = (event as CustomEvent<Map<Field, string>>).detail
    if (!(event.target instanceof HTMLFormElement) || !(snapshot instanceof Map)) return
    for (const [field, original] of snapshot) {
      if (!field.isConnected || field.form !== event.target) continue
      originals.set(field, original)
      if (value(field) === original) edited.delete(field)
      else edited.add(field) // An edit made during submission is not the saved value.
    }
  }
  doc.addEventListener('pwa:form-saved', saved)
  const observer = new MutationObserver(() => {
    for (const field of originals.keys()) {
      if (!field.isConnected) { originals.delete(field); edited.delete(field) }
      else if (!edited.has(field)) originals.set(field, value(field))
    }
    doc.querySelectorAll<Field>('form input, form textarea, form select').forEach(remember)
  })
  doc.querySelectorAll<Field>('form input, form textarea, form select').forEach(remember)
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'checked'] })
  for (const event of ['focusin', 'pointerdown', 'beforeinput']) doc.addEventListener(event, beforeEdit, true)
  for (const event of ['input', 'change']) doc.addEventListener(event, afterEdit, true)
  const reason = () => [...edited].some(field => field.isConnected && originals.get(field) !== value(field)) ? '有未保存内容，请先保存或取消，再更新。' : ''
  formChecks.add(reason)
  return {
    reason,
    dispose() {
      doc.removeEventListener('pwa:form-saved', saved)
      formChecks.delete(reason)
      observer.disconnect(); originals.clear(); edited.clear()
      for (const event of ['focusin', 'pointerdown', 'beforeinput']) doc.removeEventListener(event, beforeEdit, true)
      for (const event of ['input', 'change']) doc.removeEventListener(event, afterEdit, true)
    },
  }
}
