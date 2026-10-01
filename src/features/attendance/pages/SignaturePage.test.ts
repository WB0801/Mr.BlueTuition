import { signatureReturnTarget } from '../signatureFlow'

describe('signature return to teacher-controlled roster', () => {
  it('returns to the exact embedded object roster with panel/filter/detail parameters intact', () => {
    const to = '/students/student-a?panel=attendance&attendance.record=session-a&attendance.roster=unsigned&fees.status=paid'
    expect(signatureReturnTarget('session-a', '蓝炜滨', { contextBack: { to, label: '学生', state: { source: 'retained' } } }).to).toBe(to)
    const wrong = '/students/student-a?panel=attendance&attendance.record=other'
    expect(signatureReturnTarget('session-a', '学生', { contextBack: { to: wrong, label: '学生' } }).to).toBe('/attendance/session/session-a')
  })
  it('returns to the same session and restores its filter, upstream context and scroll', () => {
    const previous = { contextBack: { to: '/attendance?view=week&classId=class-a', label: '点名' } }
    expect(signatureReturnTarget('session-a', '蓝炜滨', { contextBack: { to: '/attendance/session/session-a?roster=unsigned', label: '课程', state: previous } })).toEqual({
      to: '/attendance/session/session-a?roster=unsigned',
      state: { ...previous, signatureSaved: true, signedSessionId: 'session-a', signedStudentName: '蓝炜滨', restoreContextScroll: true },
    })
  })
  it('does not navigate to another student, session or external return path', () => {
    for (const to of ['/attendance/session/other', '/students/student-a', 'https://outside.example']) {
      expect(signatureReturnTarget('session-a', '学生', { contextBack: { to, label: '来源' } }).to).toBe('/attendance/session/session-a')
    }
    expect(signatureReturnTarget('session-a', '学生', null).to).toBe('/attendance/session/session-a')
  })
})
