import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  EnrollmentDetails,
  EnrollmentWithClass,
  EnrollmentWithStudent,
} from '../../../types/domain'

const classSelection = '*, subject:subjects(id,name)'

export async function listStudentEnrollments(studentId: string): Promise<EnrollmentWithClass[]> {
  const { data, error } = await requireSupabase()
    .from('enrollments')
    .select(`*, class:classes(${classSelection})`)
    .eq('student_id', studentId)
    .order('join_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as EnrollmentWithClass[]
}

export async function listClassEnrollments(classId: string): Promise<EnrollmentWithStudent[]> {
  const { data, error } = await requireSupabase()
    .from('enrollments')
    .select('*, student:students(*)')
    .eq('class_id', classId)
    .order('status')
    .order('join_date')

  if (error) throw error
  return (data ?? []) as unknown as EnrollmentWithStudent[]
}

export async function getEnrollment(enrollmentId: string): Promise<EnrollmentDetails> {
  const { data, error } = await requireSupabase()
    .from('enrollments')
    .select(`*, student:students(*), class:classes(${classSelection})`)
    .eq('id', enrollmentId)
    .single()

  if (error) throw error
  return data as unknown as EnrollmentDetails
}

export async function createEnrollment(studentId: string, classId: string, joinDate: string) {
  const { error } = await requireSupabase().rpc('create_enrollment', {
    p_student_id: studentId,
    p_class_id: classId,
    p_join_date: joinDate,
  })
  if (error) throw error
}

export async function endEnrollment(enrollmentId: string, endDate: string) {
  const { error } = await requireSupabase().rpc('end_enrollment', {
    p_enrollment_id: enrollmentId,
    p_end_date: endDate,
  })
  if (error) throw error
}

export async function transferEnrollment(enrollmentId: string, newClassId: string, transferDate: string) {
  const { error } = await requireSupabase().rpc('transfer_enrollment', {
    p_enrollment_id: enrollmentId,
    p_new_class_id: newClassId,
    p_transfer_date: transferDate,
  })
  if (error) throw error
}
