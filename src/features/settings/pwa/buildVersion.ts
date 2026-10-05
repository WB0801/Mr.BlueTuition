export const runningBuild = __APP_BUILD__
export async function fetchPublishedVersion(signal: AbortSignal) {
  const response = await fetch(new URL('version.json', new URL(import.meta.env.BASE_URL, location.origin)), { cache: 'no-store', signal, credentials: 'omit' })
  if (!response.ok) throw new Error('version unavailable')
  const version: unknown = await response.json()
  if (!version || typeof version !== 'object' || !('id' in version) || typeof version.id !== 'string' || !/^[a-f0-9]{20}$/.test(version.id)) throw new Error('invalid version')
  return version.id
}
