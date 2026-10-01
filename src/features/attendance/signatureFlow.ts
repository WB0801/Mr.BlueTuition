import { readContextBack } from '../../components/navigation/contextNavigation'

export function signatureReturnTarget(sessionId: string, studentName: string, navigationState: unknown) {
  const path = `/attendance/session/${sessionId}`
  const source = readContextBack(navigationState)
  const isSameSession = source?.to.split('?')[0] === path
  const [pathname, query = ''] = source?.to.split('?') ?? []
  const params = new URLSearchParams(query)
  const panel = params.get('panel')
  const isEmbeddedSession = /^\/(students|classes)\/[A-Za-z0-9_-]+$/.test(pathname ?? '')
    && (panel === 'attendance' || panel === 'courses') && params.get(`${panel}.record`) === sessionId
  const validSource = isSameSession || isEmbeddedSession
  return {
    to: validSource ? source!.to : path,
    state: {
      ...(validSource && source?.state && typeof source.state === 'object' ? source.state : {}),
      restoreContextScroll: true,
      signatureSaved: true,
      signedSessionId: sessionId,
      signedStudentName: studentName,
    },
  }
}
