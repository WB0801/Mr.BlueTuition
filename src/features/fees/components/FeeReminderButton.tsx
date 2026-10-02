import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useContextDataLocked } from '../../../components/contextual/contextDataState'
import { formatFeeMonth, formatMoney } from '../../../utils/format'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { loadFeeReminder, type FeeReminderSnapshot } from '../api/feeReminderService'
import { buildReminderMessage, buildWhatsAppUrl, summarizeUnpaidMonth } from '../reminderRules'

export function FeeReminderButton({ fee, disabled = false }: { fee: MonthlyFeeDetails; disabled?: boolean }) {
  return <ReminderTrigger key={`${fee.student_id}:${fee.fee_month}`} fee={fee} disabled={disabled} />
}

function ReminderTrigger({ fee, disabled }: { fee: MonthlyFeeDetails; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const locked = useContextDataLocked()
  if (fee.payment_status !== 'unpaid' || fee.actual_amount <= 0) return null
  return <>
    <button ref={trigger} type="button" className="button button-secondary button-small fee-reminder-trigger" aria-label={`WhatsApp 提醒：${fee.student?.name?.trim() || '学生'} · ${formatFeeMonth(fee.fee_month)}`} disabled={disabled || locked} onClick={() => setOpen(true)}>WhatsApp 提醒</button>
    {open && <FeeReminderDialog studentId={fee.student_id} initialMonth={fee.fee_month} onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }} />}
  </>
}

function FeeReminderDialog({ studentId, initialMonth, onClose }: { studentId: string; initialMonth: string; onClose: () => void }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [month, setMonth] = useState(initialMonth)
  const snapshot = useQuery({
    queryKey: ['fee-reminder-preview', id, studentId, month],
    queryFn: ({ signal }) => loadFeeReminder(studentId, signal),
    placeholderData: keepPreviousData,
    retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useEffect(() => {
    const element = dialog.current!
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { if (element.open) element.close(); document.body.style.overflow = previousOverflow }
  }, [])
  let summary: ReturnType<typeof summarizeUnpaidMonth> | undefined
  let invalid = false
  if (snapshot.data) {
    try { summary = summarizeUnpaidMonth(snapshot.data.fees, studentId, month) } catch { invalid = true }
  }
  const close = () => { dialog.current?.close(); onClose() }
  const ready = snapshot.isSuccess && !snapshot.isFetching && !snapshot.isPlaceholderData && !invalid && snapshot.data.student.id === studentId
  return createPortal(<dialog ref={dialog} className="fee-reminder-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); close() }}>
    <header className="section-heading-row"><h2 id={`${id}-title`}>WhatsApp 提醒</h2><button className="button button-text" type="button" onClick={close} aria-label="关闭预览" autoFocus>关闭</button></header>
    <div className="fee-reminder-body">
      {snapshot.isFetching && <p role="status">正在核对未缴学费…</p>}
      {(snapshot.isError || invalid || (snapshot.isSuccess && snapshot.data.student.id !== studentId)) && <div role="alert"><p className="form-error">未缴资料读取失败，请重试。</p><button className="button button-secondary" type="button" onClick={() => void snapshot.refetch()}>重试</button></div>}
      {summary && !snapshot.isError && !invalid && <label className="field"><span>欠费月份</span><select value={month} onChange={event => setMonth(event.target.value)}>
        {!summary.months.includes(month) && <option value={month}>{formatFeeMonth(month)}</option>}
        {summary.months.map(value => <option key={value} value={value}>{formatFeeMonth(value)}</option>)}
      </select></label>}
      {ready && summary && (summary.records.length ? <ReminderEditor key={`${month}:${snapshot.dataUpdatedAt}`} snapshot={snapshot.data} records={summary.records} total={summary.total} month={month} /> : <p role="status">状态已更新：这个月份已没有需要追缴的学费。</p>)}
    </div>
  </dialog>, document.body)
}

function ReminderEditor({ snapshot, records, total, month }: { snapshot: FeeReminderSnapshot; records: MonthlyFeeDetails[]; total: number; month: string }) {
  const template = buildReminderMessage(snapshot.student.name, month)
  const [phone, setPhone] = useState(snapshot.student.phone ?? '')
  const [message, setMessage] = useState(template ?? '')
  const [copyStatus, setCopyStatus] = useState('')
  const [copying, setCopying] = useState(false)
  const body = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const revision = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const url = template ? buildWhatsAppUrl(phone, message) : null
  async function copy() {
    const current = revision.current
    setCopying(true); setCopyStatus('')
    try {
      await navigator.clipboard.writeText(message)
      if (alive.current && current === revision.current) setCopyStatus('已复制')
    } catch {
      if (alive.current && current === revision.current) { setCopyStatus('复制失败，请选择正文手动复制。'); body.current?.focus({ preventScroll: true }); body.current?.select() }
    } finally { if (alive.current && current === revision.current) setCopying(false) }
  }
  return <>
    <p className="fee-reminder-name"><strong>{snapshot.student.name?.trim() || '学生姓名缺失'}</strong></p>
    {!template && <p className="form-error" role="alert">请先核对学生姓名与收费月份。</p>}
    <label className="field"><span>收件电话号码</span><input type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="off" /></label>
    {!phone.trim() ? <p className="field-hint">缺少号码，请到学生资料补充；仍可复制文案。</p> : !buildWhatsAppUrl(phone, '核对') && <p className="form-error">号码格式无法确认，请核对马来西亚号码。</p>}
    <ul className="fee-reminder-records">{records.map(fee => <li key={fee.id}><span>{fee.enrollment?.class?.name ?? '课程资料不可用'}</span><strong>{formatMoney(fee.actual_amount)}</strong></li>)}</ul>
    <div className="fee-reminder-total"><span>合计</span><strong>{formatMoney(total)}</strong></div>
    <label className="field"><span>消息正文</span><textarea className="ui-input" ref={body} rows={4} value={message} disabled={!template} onChange={event => { revision.current++; setMessage(event.target.value); setCopyStatus(''); setCopying(false) }} /></label>
    <div className="fee-reminder-actions">
      {url ? <a className="button button-primary" href={url} target="_blank" rel="noopener noreferrer">打开 WhatsApp</a> : <button className="button button-primary" type="button" disabled>打开 WhatsApp</button>}
      <button className="button button-secondary" type="button" disabled={!template || !message.trim() || copying} onClick={() => void copy()}>{copying ? '复制中…' : '复制文案'}</button>
    </div>
    {copyStatus && <p role="status" className="field-hint">{copyStatus}</p>}
  </>
}
