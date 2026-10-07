import { useContext, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AuthContext } from '../../auth/authContext'
import { useContextDataLocked } from '../../../components/contextual/contextDataState'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { formatDateTime } from '../../../utils/format'
import { getErrorMessage } from '../../../utils/errors'
import { hasSignaturePreview, loadSignaturePreview, type SignaturePreviewData } from '../api/signaturePreviewService'

export function SignaturePreviewButton({ session, entry }: { session: ClassSessionWithClass; entry: SessionRosterEntry }) {
  const auth = useContext(AuthContext)
  const ownerId = auth?.user?.id ?? ''
  return <SignaturePreviewTrigger key={`${ownerId}:${session.id}:${entry.student_id}:${entry.attendance_record_id ?? entry.made_up_session_id}`} ownerId={ownerId} session={session} entry={entry} />
}

function SignaturePreviewTrigger({ ownerId, session, entry }: { ownerId: string; session: ClassSessionWithClass; entry: SessionRosterEntry }) {
  const locked = useContextDataLocked()
  const trigger = useRef<HTMLButtonElement>(null)
  const [opening, setOpening] = useState<{ ownerId: string; identity: string } | null>(null)
  const identity = `${session.id}:${entry.student_id}:${entry.attendance_record_id ?? entry.made_up_session_id}`
  const open = opening?.ownerId === ownerId && opening.identity === identity
  useEffect(() => {
    if (!open) return
    // Retained panels can become hidden through browser back, including nested
    // lists. A body portal must not outlive the visible source of its record.
    const observer = new MutationObserver(() => {
      if (trigger.current?.closest('[hidden]')) setOpening(null)
    })
    let ancestor = trigger.current?.parentElement
    while (ancestor) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ['hidden'] })
      ancestor = ancestor.parentElement
    }
    return () => observer.disconnect()
  }, [open])
  if (!hasSignaturePreview(session, entry)) return null
  const close = () => setOpening(null)
  const makeup = !entry.attendance_record_id
  return <>
    <button ref={trigger} type="button" className="button button-secondary button-small signature-preview-trigger" disabled={locked}
      aria-label={`${makeup ? '查看补课签名' : '查看签名'}：${entry.student_name}`} onClick={() => setOpening({ ownerId, identity })}>{makeup ? '补课签名' : '查看签名'}</button>
    {open && <SignaturePreviewDialog key={`${ownerId}:${identity}`} ownerId={ownerId} session={session} entry={entry} returnTo={trigger} onClose={close} />}
  </>
}

function SignaturePreviewDialog({ ownerId, session, entry, returnTo, onClose }: { ownerId: string; session: ClassSessionWithClass; entry: SessionRosterEntry; returnTo: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [request] = useState(() => ({ ownerId, session, entry }))
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; data?: SignaturePreviewData; error?: string } | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    const origin = returnTo.current
    const overflow = document.body.style.overflow
    const top = window.scrollY
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      if (element.open) element.close()
      document.body.style.overflow = overflow
      if (origin?.isConnected && !origin.closest('[hidden]')) {
        window.scrollTo({ top, behavior: 'instant' })
        origin.focus({ preventScroll: true })
      }
    }
  }, [returnTo])
  useEffect(() => {
    let timer: number | undefined
    const recheck = () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return
      window.clearTimeout(timer)
      // Coalesce focus/visibility/online events from a single return to the app.
      timer = window.setTimeout(() => { setImageFailed(false); setAttempt(current => current + 1) }, 100)
    }
    window.addEventListener('focus', recheck)
    window.addEventListener('online', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', recheck)
      window.removeEventListener('online', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [])
  useEffect(() => {
    let current = true
    loadSignaturePreview(request).then(data => {
      if (current) setResult({ attempt, data })
    }).catch(error => { if (current) setResult({ attempt, error: error instanceof Error && /^(无法核对|签到记录已变化|签名图片)/.test(error.message) ? error.message : getErrorMessage(error, '签名读取失败，请重试。') }) })
    return () => { current = false }
  }, [request, attempt])
  const value = result?.attempt === attempt ? result : null
  const data = value?.data
  const retry = () => { setImageFailed(false); setAttempt(current => current + 1) }
  return createPortal(<dialog ref={dialog} className="signature-preview-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
    const first = buttons[0], last = buttons.at(-1)
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus()
    }
  }}>
    <header className="section-heading-row"><h2 id={titleId}>签名预览</h2><button type="button" className="button button-text" onClick={onClose} autoFocus>关闭</button></header>
    <strong className="signature-preview-name">{entry.student_name}</strong>
    {!value && <p role="status">正在读取签名…</p>}
    {(value?.error || imageFailed) && <div role="alert" className="signature-preview-error"><p>{value?.error ?? '图片无法载入或链接已过期。'}</p><button type="button" className="button button-secondary" onClick={retry}>重试</button></div>}
    {data && <>
      <dl className="signature-preview-details">
        {data.originalSession && <div><dt>原课</dt><dd>{data.originalSession.class?.name ?? data.originalSession.temporary_class?.name}<br />{formatDateTime(data.originalSession.current_start_at)}</dd></div>}
        <div><dt>{data.originalSession ? '补课' : '课程'}</dt><dd>{data.session.class?.name ?? data.session.temporary_class?.name}<br />{formatDateTime(data.session.current_start_at)}</dd></div>
        <div><dt>{data.record.signing_type === 'backfill' ? '补签时间' : '签名时间'}</dt><dd>{formatDateTime(data.record.captured_at)}</dd></div>
        {data.record.capture_source === 'device_offline' && <div><dt>离线签名</dt><dd>同步于 {formatDateTime(data.record.synced_at)}</dd></div>}
      </dl>
      {!imageFailed && <div className="signature-preview-image"><img src={data.url} alt={`${entry.student_name}的签名`} onError={() => setImageFailed(true)} /></div>}
    </>}
  </dialog>, document.body)
}
