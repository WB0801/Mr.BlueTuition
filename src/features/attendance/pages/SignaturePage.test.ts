import { findNextUnsignedStudentId } from '../signatureFlow'

describe('continuous attendance signing', () => {
  it('continues to another unsigned student and stops when everyone is signed', () => {
    const roster = [
      { student_id: 'one', attendance_record_id: null },
      { student_id: 'two', attendance_record_id: 'record-two' },
      { student_id: 'three', attendance_record_id: null },
    ]
    expect(findNextUnsignedStudentId(roster, 'one')).toBe('three')
    expect(findNextUnsignedStudentId(roster, 'three')).toBe('one')
    expect(findNextUnsignedStudentId([{ student_id: 'one', attendance_record_id: null }], 'one')).toBeNull()
  })
})
