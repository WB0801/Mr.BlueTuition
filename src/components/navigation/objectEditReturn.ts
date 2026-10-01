import { readContextBack } from './contextNavigation'

/** Only an edit of the same existing object may restore its source detail URL. */
export function objectEditReturnTarget(kind: 'students' | 'classes', editedId: string | undefined, savedId: string, navigationState: unknown) {
  const fallback = { to: `/${kind}/${savedId}`, state: undefined }
  if (!editedId || editedId !== savedId) return fallback
  const source = readContextBack(navigationState)
  if (!source || source.to.split('?')[0] !== fallback.to) return fallback
  return {
    to: source.to,
    state: { ...(source.state && typeof source.state === 'object' ? source.state : {}), restoreContextScroll: true },
  }
}
