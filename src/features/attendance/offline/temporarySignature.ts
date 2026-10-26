import { recordAttendance, uploadSignature } from '../api/attendanceService'
import type { PendingSignature } from './pendingSignatureStore'

/** Never upgrade a recovered unbound signature to the latest enrollment. */
export async function syncPendingAttendance(item: PendingSignature, temporary: boolean) {
  const record = () => recordAttendance(item.sessionId, item.studentId, item.signaturePath, item.id, item.capturedAt, item.wasOffline, item.temporaryEnrollmentId)
  if (temporary && !item.temporaryEnrollmentId) {
    // The server permits only a previously committed idempotent retry here.
    // No upload/new record is attempted. Failure leaves the original blob intact.
    try { await record(); return } catch {
      throw new Error('这份临时班暂存签名无法核实原报名，不能提交。原图仍保留，请先核对报名及既有签到；不会自动关联重新报名。')
    }
  }
  await uploadSignature(item.signaturePath, item.signature)
  await record()
}
