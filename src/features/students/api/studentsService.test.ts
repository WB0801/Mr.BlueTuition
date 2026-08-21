import type { Student } from '../../../types/domain'
import { findDuplicateCandidates } from './studentsService'

const students: Student[] = [
  { id: '1', owner_id: 'owner', name: '陈 小明', school_class: '高一商仁', phone: '012-345 6789', created_at: '', updated_at: '' },
  { id: '2', owner_id: 'owner', name: '陈晓敏', school_class: '高一商仁', phone: '0190000000', created_at: '', updated_at: '' },
]

describe('duplicate student detection', () => {
  it('normalizes equivalent names and phone numbers', () => {
    const result = findDuplicateCandidates(students, { name: '陈小明', school_class: '', phone: '0123456789' })
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toEqual(['姓名相同', '电话号码相同'])
  })

  it('warns for a highly similar name and school-class combination', () => {
    const result = findDuplicateCandidates(students, { name: '陈晓明', school_class: '高一商仁班', phone: '' })
    expect(result.map((item) => item.id)).toContain('1')
    expect(result.find((item) => item.id === '1')?.reasons).toContain('姓名与学校班级高度相似')
  })

  it('does not flag unrelated students', () => {
    expect(findDuplicateCandidates(students, { name: '李美玲', school_class: '初二', phone: '0111111111' })).toEqual([])
  })
})
