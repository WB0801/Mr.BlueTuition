import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  ClassSession,
  StudentInput,
  TemporaryClass,
  TemporaryClassEnrollment,
  TemporaryClassInput,
  TemporaryClassPayment,
  TemporaryClassStatus,
} from '../../../types/domain'

const temporaryClassSelection = '*, subject:subjects(id,name)'

export interface TemporaryClassListItem extends TemporaryClass {
  enrollment_count: number
  paid_count: number
  unpaid_count: number
}

export interface StudentTemporaryParticipation extends TemporaryClassEnrollment {
  session: Pick<ClassSession, 'id' | 'status' | 'current_start_at'> | null
  attended: boolean
}

export async function listTemporaryClasses(status: TemporaryClassStatus): Promise<TemporaryClassListItem[]> {
  const { data, error } = await requireSupabase()
    .from('temporary_classes')
    .select(`${temporaryClassSelection}, registrations:temporary_class_enrollments(id, payment:temporary_class_payments(payment_status))`)
    .eq('status', status)
    .order('start_at', { ascending: status === 'active' })
  if (error) throw error
  return (data ?? []).map((row) => {
    const registrations = Array.isArray(row.registrations) ? row.registrations : []
    const paidCount = registrations.filter((registration: Record<string, unknown>) => {
      const rawPayment = (Array.isArray(registration.payment) ? registration.payment[0] : registration.payment) as Record<string, unknown> | undefined
      return rawPayment?.payment_status === 'paid'
    }).length
    return {
      ...mapTemporaryClass(row),
      enrollment_count: registrations.length,
      paid_count: paidCount,
      unpaid_count: registrations.length - paidCount,
    }
  })
}

export async function getTemporaryClass(classId: string): Promise<TemporaryClass> {
  const { data, error } = await requireSupabase()
    .from('temporary_classes')
    .select(temporaryClassSelection)
    .eq('id', classId)
    .single()
  if (error) throw error
  return mapTemporaryClass(data)
}

export async function getTemporaryClassSession(classId: string): Promise<ClassSession> {
  const { data, error } = await requireSupabase()
    .from('class_sessions')
    .select('*')
    .eq('temporary_class_id', classId)
    .single()
  if (error) throw error
  return data as ClassSession
}

export async function listTemporaryClassEnrollments(classId: string): Promise<TemporaryClassEnrollment[]> {
  const { data, error } = await requireSupabase()
    .from('temporary_class_enrollments')
    .select('*, student:students(id,name,school_class,phone), payment:temporary_class_payments(*)')
    .eq('temporary_class_id', classId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapTemporaryClassEnrollment)
}

export async function listStudentTemporaryClasses(studentId: string): Promise<StudentTemporaryParticipation[]> {
  const { data, error } = await requireSupabase()
    .from('temporary_class_enrollments')
    .select(`*, temporary_class:temporary_classes(${temporaryClassSelection}), payment:temporary_class_payments(*)`)
    .eq('student_id', studentId)
    .order('joined_at', { ascending: false })
  if (error) throw error
  const enrollments = (data ?? []).map(mapTemporaryClassEnrollment)
  if (enrollments.length === 0) return []

  const classIds = enrollments.map((item) => item.temporary_class_id)
  const { data: sessions, error: sessionError } = await requireSupabase()
    .from('class_sessions')
    .select('id,temporary_class_id,status,current_start_at')
    .in('temporary_class_id', classIds)
  if (sessionError) throw sessionError
  const sessionIds = (sessions ?? []).map((session) => session.id)
  const { data: attendance, error: attendanceError } = sessionIds.length > 0
    ? await requireSupabase()
      .from('attendance_records')
      .select('session_id')
      .eq('student_id', studentId)
      .eq('status', 'valid')
      .in('session_id', sessionIds)
    : { data: [], error: null }
  if (attendanceError) throw attendanceError
  const attendedSessionIds = new Set((attendance ?? []).map((item) => item.session_id))

  return enrollments.map((enrollment) => {
    const session = (sessions ?? []).find((item) => item.temporary_class_id === enrollment.temporary_class_id) ?? null
    return {
      ...enrollment,
      session: session as StudentTemporaryParticipation['session'],
      attended: session ? attendedSessionIds.has(session.id) : false,
    }
  })
}

export async function createTemporaryClass(input: TemporaryClassInput): Promise<TemporaryClass> {
  const { data, error } = await requireSupabase().rpc('create_temporary_class', rpcInput(input))
  if (error) throw error
  return mapTemporaryClass(data)
}

export async function updateTemporaryClass(classId: string, input: TemporaryClassInput): Promise<TemporaryClass> {
  const { data, error } = await requireSupabase().rpc('update_temporary_class', {
    p_temporary_class_id: classId,
    ...rpcInput(input),
  })
  if (error) throw error
  return mapTemporaryClass(data)
}

export async function addStudentToTemporaryClass(classId: string, studentId: string) {
  const { data, error } = await requireSupabase().rpc('add_student_to_temporary_class', {
    p_temporary_class_id: classId,
    p_student_id: studentId,
  })
  if (error) throw error
  return data as TemporaryClassEnrollment
}

export async function createStudentForTemporaryClass(classId: string, input: StudentInput) {
  const { data, error } = await requireSupabase().rpc('create_student_for_temporary_class', {
    p_temporary_class_id: classId,
    p_name: input.name.trim(),
    p_school_class: input.school_class.trim() || null,
    p_phone: input.phone.trim() || null,
  })
  if (error) throw error
  return data as TemporaryClassEnrollment
}

export async function markTemporaryClassPaymentPaid(paymentId: string) {
  return callPaymentRpc('mark_temporary_class_payment_paid', paymentId)
}

export async function undoTemporaryClassPayment(paymentId: string) {
  return callPaymentRpc('undo_temporary_class_payment', paymentId)
}

export async function endTemporaryClass(classId: string): Promise<TemporaryClass> {
  const { data, error } = await requireSupabase().rpc('end_temporary_class', {
    p_temporary_class_id: classId,
  })
  if (error) throw error
  return mapTemporaryClass(data)
}

function rpcInput(input: TemporaryClassInput) {
  return {
    p_subject_id: input.subject_id,
    p_name: input.name.trim(),
    p_class_date: input.class_date,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
    p_fee_amount: Number(input.fee_amount),
  }
}

async function callPaymentRpc(functionName: string, paymentId: string): Promise<TemporaryClassPayment> {
  const { data, error } = await requireSupabase().rpc(functionName, { p_payment_id: paymentId })
  if (error) throw error
  return mapPayment(data)
}

function mapTemporaryClass(value: unknown): TemporaryClass {
  const row = value as Record<string, unknown>
  return { ...row, fee_amount: Number(row.fee_amount) } as TemporaryClass
}

function mapTemporaryClassEnrollment(row: Record<string, unknown>): TemporaryClassEnrollment {
  const rawPayment = Array.isArray(row.payment) ? row.payment[0] : row.payment
  return {
    ...row,
    temporary_class: row.temporary_class ? mapTemporaryClass(row.temporary_class) : undefined,
    payment: rawPayment ? mapPayment(rawPayment) : null,
  } as TemporaryClassEnrollment
}

function mapPayment(value: unknown): TemporaryClassPayment {
  const row = value as Record<string, unknown>
  return { ...row, amount: Number(row.amount) } as TemporaryClassPayment
}
