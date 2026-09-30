import { signatureReturnTarget } from '../signatureFlow'

describe('signature return to teacher-controlled roster', () => {
  it('returns to the same session and restores its filter, upstream context and scroll', () => {
    const previous = { contextBack: { to: '/attendance?view=week&classId=class-a', label: '点名' } }
    expect(signatureReturnTarget('session-a', '蓝炜滨', { contextBack: { to: '/attendance/session/session-a?roster=unsigned', label: '课程', state: previous } })).toEqual({
      to: '/attendance/session/session-a?roster=unsigned',
      state: { ...previous, signatureSaved: true, signedStudentName: '蓝炜滨', restoreContextScroll: true },
    })
  })
  it('does not navigate to another student, session or external return path', () => {
    for (const to of ['/attendance/session/other', '/students/student-a', 'https://outside.example']) {
      expect(signatureReturnTarget('session-a', '学生', { contextBack: { to, label: '来源' } }).to).toBe('/attendance/session/session-a')
    }
    expect(signatureReturnTarget('session-a', '学生', null).to).toBe('/attendance/session/session-a')
  })
})
