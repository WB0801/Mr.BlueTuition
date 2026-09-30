import { readContextBack } from '../../components/navigation/contextNavigation'

export function signatureReturnTarget(sessionId: string, studentName: string, navigationState: unknown) {
  const path = `/attendance/session/${sessionId}`
  const source = readContextBack(navigationState)
  const isSameSession = source?.to.split('?')[0] === path
  return {
    to: isSameSession ? source.to : path,
    state: {
      ...(isSameSession && source.state && typeof source.state === 'object' ? source.state : {}),
      restoreContextScroll: true,
      signatureSaved: true,
      signedStudentName: studentName,
    },
  }
}
