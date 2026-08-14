import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { formatDateTime } from '../../../utils/format'
import { getStudent } from '../../students/api/studentsService'
import {
  createSignatureViewUrl,
  getAttendanceRecord,
  listAttendanceCorrections,
  voidAttendance,
} from '../api/attendanceService'

export function AttendanceRecordPage() {
  const { sessionId = '', attendanceId = '' } = useParams()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const record = useQuery({
    queryKey: ['attendance-record', attendanceId],
    queryFn: () => getAttendanceRecord(attendanceId),
  })
  const student = useQuery({
    queryKey: ['student', record.data?.student_id],
    queryFn: () => getStudent(record.data!.student_id),
    enabled: Boolean(record.data?.student_id),
  })
  const signature = useQuery({
    queryKey: ['attendance-record', attendanceId, 'signature-url', record.data?.signature_path],
    queryFn: () => createSignatureViewUrl(record.data!.signature_path),
    enabled: Boolean(record.data?.signature_path),
    staleTime: 4 * 60 * 1000,
  })
  const corrections = useQuery({
    queryKey: ['attendance-record', attendanceId, 'corrections'],
    queryFn: () => listAttendanceCorrections(attendanceId),
  })
  const voidMutation = useMutation({
    mutationFn: () => voidAttendance(attendanceId),
    onSuccess: async () => {
      setError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-record', attendanceId] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-record', attendanceId, 'corrections'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', sessionId, 'roster'] }),
      ])
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '作废签到失败，请重试。')),
  })

  async function handleVoid() {
    if (!window.confirm('确定作废这笔签到？原签名和签名时间会永久保留，学生将恢复为未签到。')) return
    try { await voidMutation.mutateAsync() } catch { /* mutation displays the error */ }
  }

  if (record.isLoading || student.isLoading) return <LoadingBlock />
  if (record.isError || !record.data || student.isError || !student.data) {
    return <ErrorBlock message="签到记录载入失败。" />
  }

  const data = record.data
  return (
    <section>
      <PageHeader
        title={student.data.name}
        backTo={`/attendance/session/${sessionId}`}
        backLabel="课程点名"
      />
      <dl className="details-card">
        <div><dt>签到状态</dt><dd>{data.status === 'valid' ? '有效' : '已作废'}</dd></div>
        <div><dt>签名时间</dt><dd>{formatDateTime(data.captured_at)}</dd></div>
        {data.capture_source === 'device_offline' && (
          <>
            <div><dt>时间来源</dt><dd>离线签名（设备捕获时间）</dd></div>
            <div><dt>同步时间</dt><dd>{formatDateTime(data.synced_at)}</dd></div>
          </>
        )}
        <div><dt>签到类型</dt><dd>{data.signing_type === 'backfill' ? '补签' : '当日签到'}</dd></div>
        <div><dt>参加方式</dt><dd>{participationLabel(data.participation_type)}</dd></div>
        {data.voided_at && <div><dt>作废时间</dt><dd>{formatDateTime(data.voided_at)}</dd></div>}
      </dl>

      <div className="saved-signature-card">
        <strong>原签名</strong>
        {signature.isLoading && <p className="muted">正在读取私人签名…</p>}
        {signature.isError && <p className="form-error">签名图片读取失败，请重试。</p>}
        {signature.data && <img src={signature.data} alt={`${student.data.name}的签名`} />}
      </div>

      {corrections.data?.length ? (
        <div className="correction-history">
          <strong>修正记录</strong>
          {corrections.data.map((correction) => (
            <p key={correction.id}>签到已于 {formatDateTime(correction.corrected_at)} 作废</p>
          ))}
        </div>
      ) : null}

      {data.status === 'valid' && (
        <details className="danger-panel">
          <summary>签名修正</summary>
          <p className="muted">签错学生时作废此记录。图片不会删除或覆盖，正确学生需要重新签名。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-danger" type="button" onClick={handleVoid} disabled={voidMutation.isPending}>
            {voidMutation.isPending ? '处理中…' : '作废这笔签到'}
          </button>
        </details>
      )}
    </section>
  )
}

function participationLabel(type: 'regular' | 'makeup' | 'extra') {
  if (type === 'makeup') return '跨班补课'
  if (type === 'extra') return '额外参加'
  return '本班课程'
}
