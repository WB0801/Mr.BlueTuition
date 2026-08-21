import { requireSupabase } from '../../../lib/requireSupabase'
import type { Student, StudentInput } from '../../../types/domain'

export async function listStudents(search = ''): Promise<Student[]> {
  const client = requireSupabase()
  let query = client.from('students').select('*').order('name').order('school_class')

  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Student[]
}

export async function getStudent(studentId: string): Promise<Student> {
  const { data, error } = await requireSupabase()
    .from('students')
    .select('*')
    .eq('id', studentId)
    .single()

  if (error) throw error
  return data as Student
}

export async function createStudent(ownerId: string, input: StudentInput): Promise<Student> {
  const { data, error } = await requireSupabase()
    .from('students')
    .insert({ owner_id: ownerId, ...trimStudentInput(input) })
    .select('*')
    .single()

  if (error) throw error
  return data as Student
}

export async function updateStudent(studentId: string, input: StudentInput): Promise<Student> {
  const { data, error } = await requireSupabase()
    .from('students')
    .update(trimStudentInput(input))
    .eq('id', studentId)
    .select('*')
    .single()

  if (error) throw error
  return data as Student
}

export interface DuplicateStudentWarning extends Student {
  reasons: string[]
}

export async function findPotentialDuplicateStudents(input: StudentInput): Promise<DuplicateStudentWarning[]> {
  if (!input.name.trim() && !input.phone.trim()) return []
  const { data, error } = await requireSupabase()
    .from('students')
    .select('*')
    .order('name')
  if (error) throw error
  return findDuplicateCandidates((data ?? []) as Student[], input)
}

export function findDuplicateCandidates(students: Student[], input: StudentInput): DuplicateStudentWarning[] {
  const targetName = normalizeIdentityText(input.name)
  const targetSchoolClass = normalizeIdentityText(input.school_class)
  const targetPhone = normalizePhone(input.phone)

  return students.flatMap((student) => {
    const reasons: string[] = []
    const studentName = normalizeIdentityText(student.name)
    const studentSchoolClass = normalizeIdentityText(student.school_class ?? '')
    const studentPhone = normalizePhone(student.phone ?? '')
    if (targetName && studentName === targetName) reasons.push('姓名相同')
    if (targetPhone && studentPhone && studentPhone === targetPhone) reasons.push('电话号码相同')
    if (
      targetName && targetSchoolClass && studentName && studentSchoolClass
      && similarity(targetName, studentName) >= 0.66
      && similarity(targetSchoolClass, studentSchoolClass) >= 0.78
      && !reasons.includes('姓名相同')
    ) reasons.push('姓名与学校班级高度相似')
    return reasons.length > 0 ? [{ ...student, reasons }] : []
  })
}

function trimStudentInput(input: StudentInput) {
  return {
    name: input.name.trim(),
    school_class: input.school_class.trim() || null,
    phone: input.phone.trim() || null,
  }
}

function normalizeIdentityText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function normalizePhone(value: string) {
  return value.normalize('NFKC').replace(/\D/g, '')
}

function similarity(left: string, right: string) {
  const longest = Math.max(left.length, right.length)
  if (longest === 0) return 1
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return 1 - previous[right.length] / longest
}
