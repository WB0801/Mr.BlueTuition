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

function trimStudentInput(input: StudentInput): StudentInput {
  return {
    name: input.name.trim(),
    school_class: input.school_class.trim(),
    phone: input.phone.trim(),
  }
}
