import { requireSupabase } from '../../../lib/requireSupabase'
import { getErrorMessage } from '../../../utils/errors'
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

export interface SessionGuestRequest {
  enrollmentId: string
  studentId: string
  studentName: string
  linkType: 'makeup' | 'extra'
  sourceSessionId: string | null
  verifyBeforeRetry?: boolean
}

export type SessionGuestResult = SessionGuestRequest & { success: boolean; uncertain?: boolean; error?: string }

// Each existing RPC is atomic. Report every result; never retry successful students.
export async function addSessionGuests(sessionId: string, requests: SessionGuestRequest[]): Promise<SessionGuestResult[]> {
  const results: SessionGuestResult[] = []
  const seen = new Set<string>()
  for (const request of requests) {
    if (seen.has(request.studentId) || (request.linkType === 'makeup' && !request.sourceSessionId)) {
      results.push({ ...request, success: false, error: '学生重复或尚未选择原缺席课程。' })
      continue
    }
    seen.add(request.studentId)
    if (request.verifyBeforeRetry) {
      try {
        const entry = (await getSessionRoster(sessionId)).find((row) => row.student_id === request.studentId)
        if (entry) {
          const matches = entry.participation_type === request.linkType && (request.linkType === 'extra' || entry.source_session_id === request.sourceSessionId)
          results.push(matches ? { ...request, success: true } : { ...request, success: false, error: '此学生已在目标课程名单，关联与本次选择不同，请先核对名单。' })
          continue
        }
      } catch {
        results.push({ ...request, success: false, uncertain: true, error: '仍无法确认上次是否已加入；未重复提交，请刷新点名名单核对。' })
        continue
      }
    }
    try {
      const { data, error } = await requireSupabase().from('enrollments').select('student_id').eq('id', request.enrollmentId).single()
      if (error) throw error
      if (data?.student_id !== request.studentId) throw new Error('原报读与所选学生不一致，请重新选择。')
      if (request.linkType === 'makeup') {
        const sources = await listMakeupSourceSessions(sessionId, request.enrollmentId)
        if (!sources.some((source) => source.session_id === request.sourceSessionId)) throw new Error('原缺席课程已不符合条件，请逐人重新选择。')
      }
    } catch (error) {
      results.push({ ...request, success: false, error: getErrorMessage(error, '核验原报读与原缺席课程失败，未提交此学生。') })
      continue
    }
    try {
      await addSessionGuest(sessionId, request.enrollmentId, request.linkType, request.sourceSessionId)
      results.push({ ...request, success: true })
    } catch (error) {
      // A lost response can follow a committed RPC. Verify before offering a retry.
      try {
        const roster = await getSessionRoster(sessionId)
        const added = roster.some((entry) => entry.student_id === request.studentId
          && entry.participation_type === request.linkType
          && (request.linkType === 'extra' || entry.source_session_id === request.sourceSessionId))
        results.push(added ? { ...request, success: true } : { ...request, success: false, error: getErrorMessage(error, '加入失败，请检查资格或原缺席课程后重试。') })
      } catch {
        results.push({ ...request, success: false, uncertain: true, error: '无法确认是否已加入。请刷新点名名单核对后再重试。' })
      }
    }
  }
  return results
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
