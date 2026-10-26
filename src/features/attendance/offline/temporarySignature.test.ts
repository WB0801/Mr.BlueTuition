import { syncPendingAttendance } from './temporarySignature'
import type { PendingSignature } from './pendingSignatureStore'
import { recordAttendance, uploadSignature } from '../api/attendanceService'
vi.mock('../api/attendanceService', () => ({ recordAttendance: vi.fn(), uploadSignature: vi.fn() }))
const pending: PendingSignature = { id:'request',ownerId:'owner',sessionId:'session',studentId:'student',signaturePath:'private.png',signature:new Blob(['fictional']),capturedAt:'2026-10-01T00:00:00Z',wasOffline:true }
beforeEach(() => vi.clearAllMocks())
it('unbound legacy temporary pending only attempts a safe idempotent lookup, never uploads or guesses a new enrollment', async () => {
  vi.mocked(recordAttendance).mockRejectedValue(new Error('Temporary signature requires its original enrollment ID'))
  await expect(syncPendingAttendance(pending,true)).rejects.toThrow(/原报名|暂存/)
  expect(uploadSignature).not.toHaveBeenCalled()
  expect(pending).not.toHaveProperty('temporaryEnrollmentId')
})
it('already committed legacy idempotent retry can finish without reuploading a signature', async () => {
  vi.mocked(recordAttendance).mockResolvedValue({ id:'existing' } as never)
  await syncPendingAttendance(pending,true)
  expect(uploadSignature).not.toHaveBeenCalled()
})
it('new temporary pending retains its exact binding; normal pending retains the original call contract', async () => {
  await syncPendingAttendance({...pending,temporaryEnrollmentId:'old-enrollment'},true)
  expect(recordAttendance).toHaveBeenLastCalledWith('session','student','private.png','request','2026-10-01T00:00:00Z',true,'old-enrollment')
  await syncPendingAttendance(pending,false)
  expect(recordAttendance).toHaveBeenLastCalledWith('session','student','private.png','request','2026-10-01T00:00:00Z',true,undefined)
})
