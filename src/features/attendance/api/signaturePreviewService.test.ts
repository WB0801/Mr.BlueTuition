import type { AttendanceRecord, ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { hasSignaturePreview, loadSignaturePreview } from './signaturePreviewService'
const mocks = vi.hoisted(() => ({ record: vi.fn(), roster: vi.fn(), session: vi.fn(), url: vi.fn(), select: vi.fn(), filters: [] as [string, string][], links: [] as object[] }))
vi.mock('./attendanceService', () => ({ getAttendanceRecord: mocks.record, getSessionRoster: mocks.roster, createSignatureViewUrl: mocks.url }))
vi.mock('../../schedule/api/scheduleService', () => ({ getSession: mocks.session }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({ from: (name: string) => {
  expect(name).toBe('makeup_links')
  const query = { select: mocks.select, eq: (key: string, value: string) => { mocks.filters.push([key, value]); return query }, then: (resolve: (value: object) => void) => resolve({ data: mocks.links, error: null }) }
  mocks.select.mockReturnValue(query)
  return query
} }) }))
const session = { id: 'course', owner_id: 'owner', status: 'scheduled' } as ClassSessionWithClass
const entry = { student_id: 'student', participation_type: 'regular', makeup_link_id: null, attendance_record_id: 'record' } as SessionRosterEntry
const record = { id: 'record', owner_id: 'owner', student_id: 'student', session_id: 'course', makeup_link_id: null, client_request_id: 'request', participation_type: 'regular', signing_type: 'checkin', status: 'valid', signature_mime_type: 'image/png', signature_path: 'owner/course/student/request.png' } as AttendanceRecord
beforeEach(() => {
  vi.clearAllMocks(); mocks.filters.length = 0; mocks.links = []
  mocks.record.mockResolvedValue(record); mocks.url.mockResolvedValue('https://isolated.invalid/private-short-lived')
})
it.each(['checkin', 'backfill'])('reads the exact valid %s record, with no roster/relationship request for ordinary signatures', async signing_type => {
  mocks.record.mockResolvedValue({ ...record, signing_type })
  const result = await loadSignaturePreview({ ownerId: 'owner', session, entry })
  expect(result.record.signing_type).toBe(signing_type)
  expect(mocks.record).toHaveBeenCalledWith('record')
  expect(mocks.url).toHaveBeenCalledWith(record.signature_path)
  expect(mocks.roster).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled()
})
it.each([
  { owner_id: 'other' }, { student_id: 'other' }, { session_id: 'other' }, { id: 'other' }, { status: 'voided' },
  { signature_path: '' }, { signature_path: 'owner/course/other/request.png' }, { signature_mime_type: 'image/jpeg' }, { makeup_link_id: 'unexpected' },
])('fails closed before signing a URL for mismatched/voided/missing records: %j', async difference => {
  mocks.record.mockResolvedValue({ ...record, ...difference })
  await expect(loadSignaturePreview({ ownerId: 'owner', session, entry })).rejects.toThrow()
  expect(mocks.url).not.toHaveBeenCalled()
})
it('does not expose shortcuts for stopped, pending or absent-without-target courses', () => {
  expect(hasSignaturePreview({ ...session, status: 'cancelled' }, entry)).toBe(false)
  expect(hasSignaturePreview(session, null)).toBe(false)
  expect(hasSignaturePreview(session, { ...entry, attendance_record_id: null })).toBe(false)
})
it('rejects missing authentication or a different object owner without any read', async () => {
  for (const ownerId of ['', 'other']) await expect(loadSignaturePreview({ ownerId, session, entry })).rejects.toThrow()
  expect(mocks.record).not.toHaveBeenCalled()
})
function setupMakeup() {
  mocks.session.mockResolvedValue({ ...session, id: 'target' })
  mocks.roster.mockResolvedValue([{ ...entry, participation_type: 'makeup', attendance_record_id: 'target-record', makeup_link_id: 'link', source_session_id: 'course' }])
  mocks.links = [{ id: 'link' }]
  mocks.record.mockResolvedValue({ ...record, id: 'target-record', session_id: 'target', makeup_link_id: 'link', participation_type: 'makeup', signature_path: 'owner/target/student/request.png' })
  return { ...entry, attendance_record_id: null, made_up_session_id: 'target', made_up_at: '2026-10-01T06:00:00Z' }
}
it('verifies both ends of a makeup relation and keeps the original absence separate', async () => {
  const result = await loadSignaturePreview({ ownerId: 'owner', session, entry: setupMakeup() })
  expect(result.originalSession).toBe(session); expect(result.session.id).toBe('target')
  expect(mocks.record).toHaveBeenCalledWith('target-record')
  expect(mocks.filters).toEqual([['owner_id', 'owner'], ['student_id', 'student'], ['source_session_id', 'course'], ['target_session_id', 'target'], ['link_type', 'makeup']])
})
it.each(['missing', 'duplicate', 'wrong-student', 'wrong-source', 'wrong-link', 'target-stopped', 'target-owner'])('does not guess a makeup signature: %s', async mode => {
  const makeup = setupMakeup()
  if (mode === 'missing') mocks.links = []
  if (mode === 'duplicate') mocks.links.push({ id: 'another' })
  if (mode.startsWith('wrong-')) mocks.roster.mockResolvedValue([{ ...entry, attendance_record_id: 'target-record', participation_type: 'makeup', makeup_link_id: mode === 'wrong-link' ? 'other' : 'link', student_id: mode === 'wrong-student' ? 'other' : 'student', source_session_id: mode === 'wrong-source' ? 'other' : 'course' }])
  if (mode.startsWith('target-')) mocks.session.mockResolvedValue({ ...session, id: 'target', status: mode === 'target-stopped' ? 'cancelled' : 'scheduled', owner_id: mode === 'target-owner' ? 'other' : 'owner' })
  await expect(loadSignaturePreview({ ownerId: 'owner', session, entry: makeup })).rejects.toThrow()
  expect(mocks.url).not.toHaveBeenCalled()
})
it('propagates read/storage failures instead of pretending there is no signature', async () => {
  mocks.record.mockRejectedValue(new Error('network'))
  await expect(loadSignaturePreview({ ownerId: 'owner', session, entry })).rejects.toThrow('network')
  mocks.record.mockResolvedValue(record); mocks.url.mockRejectedValue(new Error('storage'))
  await expect(loadSignaturePreview({ ownerId: 'owner', session, entry })).rejects.toThrow('storage')
})
