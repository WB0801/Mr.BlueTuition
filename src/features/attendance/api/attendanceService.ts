import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  AttendanceCorrection,
  AttendanceRecord,
  CrossClassCandidate,
  MakeupLink,
  MakeupSourceSession,
  SessionRosterEntry,
} from '../../../types/domain'

export async function getSessionRoster(sessionId: string): Promise<SessionRosterEntry[]> {
  const { data, error } = await requireSupabase().rpc('get_session_attendance_roster', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return (data ?? []) as SessionRosterEntry[]
}

export async function searchCrossClassCandidates(
  sessionId: string,
  search: string,
): Promise<CrossClassCandidate[]> {
  const { data, error } = await requireSupabase().rpc('list_cross_class_candidates', {
    p_target_session_id: sessionId,
    p_search: search.trim(),
  })
  if (error) throw error
  return (data ?? []) as CrossClassCandidate[]
}

export async function listMakeupSourceSessions(
  sessionId: string,
  enrollmentId: string,
): Promise<MakeupSourceSession[]> {
  const { data, error } = await requireSupabase().rpc('list_makeup_source_sessions', {
    p_target_session_id: sessionId,
    p_source_enrollment_id: enrollmentId,
  })
  if (error) throw error
  return (data ?? []) as MakeupSourceSession[]
}

export async function addSessionGuest(
  sessionId: string,
  enrollmentId: string,
  linkType: 'makeup' | 'extra',
  sourceSessionId: string | null,
): Promise<MakeupLink> {
  const { data, error } = await requireSupabase().rpc('add_session_guest', {
    p_target_session_id: sessionId,
    p_source_enrollment_id: enrollmentId,
    p_link_type: linkType,
    p_source_session_id: sourceSessionId,
  })
  if (error) throw error
  return data as MakeupLink
}

export function buildSignaturePath(
  ownerId: string,
  sessionId: string,
  studentId: string,
  clientRequestId: string,
) {
  return `${ownerId}/${sessionId}/${studentId}/${clientRequestId}.png`
}

export async function uploadSignature(path: string, signature: Blob): Promise<void> {
  const { error } = await requireSupabase().storage.from('signatures').upload(path, signature, {
    cacheControl: '31536000',
    contentType: 'image/png',
    upsert: false,
  })

  if (error && !isAlreadyUploadedError(error)) throw error
}

export async function recordAttendance(
  sessionId: string,
  studentId: string,
  signaturePath: string,
  clientRequestId: string,
  capturedAt: string,
  useDeviceCapturedAt: boolean,
): Promise<AttendanceRecord> {
  const { data, error } = await requireSupabase().rpc('record_attendance', {
    p_session_id: sessionId,
    p_student_id: studentId,
    p_signature_path: signaturePath,
    p_client_request_id: clientRequestId,
    p_captured_at: capturedAt,
    p_use_device_captured_at: useDeviceCapturedAt,
  })
  if (error) throw error
  return data as AttendanceRecord
}

export async function getAttendanceRecord(recordId: string): Promise<AttendanceRecord> {
  const { data, error } = await requireSupabase()
    .from('attendance_records')
    .select('*')
    .eq('id', recordId)
    .single()
  if (error) throw error
  return data as AttendanceRecord
}

export async function listAttendanceCorrections(recordId: string): Promise<AttendanceCorrection[]> {
  const { data, error } = await requireSupabase()
    .from('attendance_corrections')
    .select('*')
    .eq('attendance_record_id', recordId)
    .order('corrected_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as AttendanceCorrection[]
}

export async function createSignatureViewUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from('signatures').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function voidAttendance(recordId: string): Promise<AttendanceRecord> {
  const { data, error } = await requireSupabase().rpc('void_attendance_record', {
    p_attendance_record_id: recordId,
  })
  if (error) throw error
  return data as AttendanceRecord
}

function isAlreadyUploadedError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { statusCode?: string | number; message?: string }
  return candidate.statusCode === 409
    || candidate.statusCode === '409'
    || candidate.message?.toLowerCase().includes('already exists') === true
}
