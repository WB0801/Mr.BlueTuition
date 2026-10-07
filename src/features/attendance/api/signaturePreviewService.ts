import { requireSupabase } from '../../../lib/requireSupabase'
import type { AttendanceRecord, ClassSessionWithClass, MakeupLink, SessionRosterEntry } from '../../../types/domain'
import { createSignatureViewUrl, getAttendanceRecord, getSessionRoster } from './attendanceService'
import { getSession } from '../../schedule/api/scheduleService'

export interface SignaturePreviewRequest {
  ownerId: string
  session: ClassSessionWithClass
  entry: SessionRosterEntry
}
export interface SignaturePreviewData {
  record: AttendanceRecord
  session: ClassSessionWithClass
  originalSession: ClassSessionWithClass | null
  url: string
}

export function hasSignaturePreview(session: ClassSessionWithClass, entry: SessionRosterEntry | null | undefined) {
  return session.status !== 'cancelled' && Boolean(entry && (
    entry.attendance_record_id || (entry.participation_type === 'regular' && entry.made_up_session_id && entry.made_up_at)
  ))
}

// This request is deliberately on-demand and read-only. URLs never enter a
// shared query cache, browser storage or the signature upload/recovery path.
export async function loadSignaturePreview({ ownerId, session, entry }: SignaturePreviewRequest): Promise<SignaturePreviewData> {
  if (!ownerId || session.owner_id !== ownerId || !hasSignaturePreview(session, entry)) throw new Error('无法核对这份签名。')
  let target = session
  let recordId = entry.attendance_record_id
  let expectedLink: string | null = entry.makeup_link_id
  const originalSession = recordId ? null : session
  if (!recordId) {
    const targetId = entry.made_up_session_id!
    const [targetSession, roster, relation] = await Promise.all([
      getSession(targetId), getSessionRoster(targetId),
      requireSupabase().from('makeup_links').select('*').eq('owner_id', ownerId)
        .eq('student_id', entry.student_id).eq('source_session_id', session.id)
        .eq('target_session_id', targetId).eq('link_type', 'makeup'),
    ])
    if (relation.error) throw relation.error
    const links = (relation.data ?? []) as MakeupLink[]
    const matches = roster.filter(row => row.student_id === entry.student_id && row.participation_type === 'makeup'
      && row.source_session_id === session.id && row.attendance_record_id
      && links.some(link => link.id === row.makeup_link_id))
    if (targetSession.owner_id !== ownerId || targetSession.status === 'cancelled' || links.length !== 1 || matches.length !== 1) throw new Error('无法核对补课签名，请查看完整课程记录。')
    target = targetSession
    recordId = matches[0].attendance_record_id
    expectedLink = matches[0].makeup_link_id
  }
  const record = await getAttendanceRecord(recordId!)
  if (!record || record.id !== recordId || record.owner_id !== ownerId || record.student_id !== entry.student_id
    || record.session_id !== target.id || record.status !== 'valid' || record.makeup_link_id !== expectedLink
    || (originalSession && record.participation_type !== 'makeup')) throw new Error('签到记录已变化或无法核对，请刷新课程记录。')
  const path = record.signature_path
  if (!path || path !== `${ownerId}/${target.id}/${entry.student_id}/${record.client_request_id}.png`
    || record.signature_mime_type !== 'image/png') throw new Error('签名图片不存在或无法核对。')
  const url = await createSignatureViewUrl(path)
  if (!url) throw new Error('签名图片暂时无法读取，请重试。')
  return { record, session: target, originalSession, url }
}
