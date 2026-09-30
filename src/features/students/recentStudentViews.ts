import { useSyncExternalStore } from 'react'

const eventName = 'recent-students-changed'
const keyFor = (ownerId: string) => `recent-students-v1:${ownerId}`
function snapshot(ownerId: string) {
  try { return ownerId ? localStorage.getItem(keyFor(ownerId)) ?? '[]' : '[]' } catch { return '[]' }
}
function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[\w-]+$/.test(id)))].slice(0, 12) : []
  } catch { return [] }
}
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(eventName, listener)
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(eventName, listener) }
}
export function useRecentStudentIds(ownerId: string) {
  return parse(useSyncExternalStore(subscribe, () => snapshot(ownerId), () => '[]'))
}
// Store UUIDs only, scoped to the signed-in owner; identities are always fetched under RLS.
export function recordStudentView(ownerId: string, studentId: string) {
  if (!ownerId || !/^[\w-]+$/.test(studentId)) return
  try {
    localStorage.setItem(keyFor(ownerId), JSON.stringify([studentId, ...parse(snapshot(ownerId)).filter((id) => id !== studentId)].slice(0, 12)))
    window.dispatchEvent(new Event(eventName))
  } catch { /* A disabled or full browser store must not block student details. */ }
}
