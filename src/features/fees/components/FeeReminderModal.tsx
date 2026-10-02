import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function FeeReminderModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { if (element.open) element.close(); document.body.style.overflow = previousOverflow }
  }, [])
  const close = () => { dialog.current?.close(); onClose() }
  return createPortal(<dialog ref={dialog} className="fee-reminder-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); close() }}>
    <header className="section-heading-row"><h2 id={id}>{title}</h2><button className="button button-text" type="button" onClick={close} aria-label="关闭预览" autoFocus>关闭</button></header>
    {children}
  </dialog>, document.body)
}
