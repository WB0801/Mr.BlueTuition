import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { useAuth } from '../../auth/authContext'
import { getSession } from '../../schedule/api/scheduleService'
import { getErrorMessage } from '../../../utils/errors'
import { formatSessionTimeRange, toMalaysiaDateInput, todayInMalaysia } from '../../../utils/format'
import {
  buildSignaturePath,
  getSessionRoster,
  recordAttendance,
  uploadSignature,
} from '../api/attendanceService'
import { SignatureCanvas, type SignatureCanvasHandle } from '../components/SignatureCanvas'
import {
  findPendingSignature,
  removePendingSignature,
  savePendingSignature,
  type PendingSignature,
} from '../offline/pendingSignatureStore'

const leaveMessage = '此签名尚未保存，确定离开？'

export function SignaturePage() {
  const { sessionId = '', studentId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canvasRef = useRef<SignatureCanvasHandle>(null)
  const submissionRef = useRef(false)
  const allowNavigationRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [pending, setPending] = useState<PendingSignature | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState('')
  const [recovered, setRecovered] = useState(false)

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
  })
  const roster = useQuery({
    queryKey: ['attendance', sessionId, 'roster'],
    queryFn: () => getSessionRoster(sessionId),
  })
  const entry = roster.data?.find((item) => item.student_id === studentId)
  const shouldWarn = hasInk

  const blocker = useBlocker(useCallback(() => shouldWarn && !allowNavigationRef.current, [shouldWarn]))
  useBeforeUnload(useCallback((event) => {
    if (!shouldWarn) return
    event.preventDefault()
    event.returnValue = leaveMessage
  }, [shouldWarn]))

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(leaveMessage)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  useEffect(() => {
    if (!user || !sessionId || !studentId || recovered) return
    let active = true
    void findPendingSignature(user.id, sessionId, studentId)
      .then(async (stored) => {
        if (!active) return
        setRecovered(true)
        if (!stored) return
        const recoveredItem = { ...stored, wasOffline: true }
        setPending(recoveredItem)
        void savePendingSignature(recoveredItem)
        setError('这份签名尚未同步，签名图片已从此设备恢复。请点击重新上传。')
      })
      .catch((caughtError) => {
        if (!active) return
        setRecovered(true)
        setError(getErrorMessage(caughtError, '无法读取此设备的待同步签名。'))
      })
    return () => { active = false }
  }, [recovered, sessionId, studentId, user])

  useEffect(() => {
    if (!recovered || !pending || !canvasRef.current) return
    void canvasRef.current.load(pending.signature).catch((caughtError) => {
      setError(getErrorMessage(caughtError, '无法恢复尚未同步的签名图片。'))
    })
  }, [pending, recovered])

  async function syncSignature(item: PendingSignature) {
    setError('')
    try {
      await uploadSignature(item.signaturePath, item.signature)
      await recordAttendance(
        item.sessionId,
        item.studentId,
        item.signaturePath,
        item.id,
        item.capturedAt,
        item.wasOffline,
      )
      await removePendingSignature(item.id)
      setPending(null)
      setHasInk(false)
      await queryClient.invalidateQueries({ queryKey: ['attendance', sessionId, 'roster'] })
      await queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      allowNavigationRef.current = true
      navigate(`/attendance/session/${sessionId}`, { replace: true })
    } catch (caughtError) {
      const retainedItem = { ...item, wasOffline: true }
      setPending(retainedItem)
      try { await savePendingSignature(retainedItem) } catch { /* original pending copy remains */ }
      setError(`${getErrorMessage(caughtError, '上传失败。')} 签名仍保存在此设备，尚未同步。`)
    }
  }

  async function handleConfirm() {
    if (!user || !canvasRef.current || !hasInk || submissionRef.current) return
    submissionRef.current = true
    setIsSyncing(true)
    try {
      const signature = pending?.signature ?? await canvasRef.current.toPngBlob()
      const clientRequestId = pending?.id ?? crypto.randomUUID()
      const item: PendingSignature = pending ?? {
        id: clientRequestId,
        ownerId: user.id,
        sessionId,
        studentId,
        signaturePath: buildSignaturePath(user.id, sessionId, studentId, clientRequestId),
        signature,
        capturedAt: new Date().toISOString(),
        wasOffline: false,
      }

      // Persist before any upload so a failed request cannot clear the drawing.
      await savePendingSignature(item)
      setPending(item)
      await syncSignature(item)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '签名无法安全暂存，因此没有上传。请重试。'))
    } finally {
      submissionRef.current = false
      setIsSyncing(false)
    }
  }

  if (session.isLoading || roster.isLoading || !recovered) return <LoadingBlock />
  if (session.isError || !session.data) return <ErrorBlock message="找不到这堂课程。" />
  if (roster.isError) return <ErrorBlock message="点名名单载入失败。" />
  if (session.data.status === 'cancelled') return <ErrorBlock message="这堂课程已经停课，不能签到。" />
  if (!entry) return <ErrorBlock message="这位学生不在本堂课程名单中。" />
  if (entry.attendance_record_id) return <ErrorBlock message="这位学生已经签到，请返回课程查看签名。" />

  const isBackfill = toMalaysiaDateInput(session.data.current_start_at) < todayInMalaysia()

  return (
    <section className="signature-page">
      <PageHeader
        title={entry.student_name}
        backTo={`/attendance/session/${sessionId}`}
        backLabel="课程点名"
      />
      <div className="signature-context">
        <strong>{session.data.class?.name}</strong>
        <span>{formatSessionTimeRange(session.data.current_start_at, session.data.current_end_at)}</span>
        {isBackfill && <span className="attendance-label attendance-backfill">补签：保存实际签名时间</span>}
      </div>
      <div className="signature-card">
        <p className="signature-instruction">请在下方签名</p>
        <SignatureCanvas ref={canvasRef} onInkChange={setHasInk} />
        {pending && <p className="sync-warning" role="status">尚未同步 · 签名已安全保存在此设备</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="signature-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={isSyncing || Boolean(pending)}
            onClick={() => canvasRef.current?.clear()}
          >
            清除
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!hasInk || isSyncing}
            onClick={handleConfirm}
          >
            {isSyncing ? '同步中…' : pending ? '重新上传' : isBackfill ? '确认补签' : '确认签到'}
          </button>
        </div>
      </div>
    </section>
  )
}
