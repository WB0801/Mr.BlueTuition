import type { Student } from '../../../types/domain'
import { filterEligibleStudents } from '../studentPicker'

const students = [
  { id: '1', name: '陈小明', school_class: '高一商仁', phone: '012-111' },
  { id: '2', name: '陈小明', school_class: '高一商义', phone: '012-222' },
  { id: '3', name: '李小华', school_class: null, phone: null },
] as Student[]

describe('add-student candidate list', () => {
  it('shows every eligible student before a search is entered', () => {
    expect(filterEligibleStudents(students, ['3'], '').map((student) => student.id)).toEqual(['1', '2'])
  })

  it('filters the full eligible list by identity details', () => {
    expect(filterEligibleStudents(students, [], '商义').map((student) => student.id)).toEqual(['2'])
    expect(filterEligibleStudents(students, [], '012-111').map((student) => student.id)).toEqual(['1'])
  })

  it('never returns an already enrolled student', () => {
    expect(filterEligibleStudents(students, ['1'], '陈小明').map((student) => student.id)).toEqual(['2'])
  })
})
