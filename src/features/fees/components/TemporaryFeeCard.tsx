import { useCallback, useEffect, useRef } from 'react'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { formatDateTime } from '../../../utils/format'
import { TemporaryPaymentRow } from '../../temporary-classes/components/TemporaryPaymentRow'
import type { TemporaryFeeRecord } from '../api/temporaryFeesService'

export function TemporaryFeeCard({ record, onBusyChange, verificationFailed = false, onRetryVerification }: { record: TemporaryFeeRecord; onBusyChange: (id: string, busy: boolean, record: TemporaryFeeRecord) => void; verificationFailed?: boolean; onRetryVerification?: () => void }) {
  const recordRef = useRef(record)
  useEffect(() => { recordRef.current = record }, [record])
  const reportBusy = useCallback((id: string, busy: boolean) => onBusyChange(id, busy, recordRef.current), [onBusyChange])
  return <article className="fee-card unified-temporary-fee" data-fee-key={`temporary_class_payment:${record.payment.id}`}>
    <header className="unified-fee-heading"><span className="unified-fee-source">临时班</span>
      <ContextLink backLabel="学费" className="record-meta fee-entity-link" to={`/temporary-classes/${record.class.id}?paymentId=${encodeURIComponent(record.payment.id)}`}>{record.class.name}</ContextLink>
      <span className="record-meta">上课：{formatDateTime(record.class.start_at)}</span><span>单次</span>
    </header>
    <TemporaryPaymentRow enrollment={{ ...record.enrollment, payment: record.payment }} allowActions={!verificationFailed} allowAmountEdit={record.class.status === 'active'} backLabel="学费" onBusyChange={reportBusy} />
    {verificationFailed && <><p className="form-error" role="alert">当前费用核对失败，草稿已保留，请重试。</p><button type="button" className="button button-secondary button-small" onClick={onRetryVerification}>重试当前费用</button></>}
  </article>
}
