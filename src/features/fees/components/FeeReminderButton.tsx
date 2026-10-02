import { useRef, useState } from 'react'
import { useContextDataLocked } from '../../../components/contextual/contextDataState'
import { formatFeeMonth } from '../../../utils/format'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { FeeReminderModal } from './FeeReminderModal'
import { FeeReminderPreview } from './FeeReminderPreview'

export function FeeReminderButton({ fee, disabled = false }: { fee: MonthlyFeeDetails; disabled?: boolean }) {
  return <ReminderTrigger key={`${fee.student_id}:${fee.fee_month}`} fee={fee} disabled={disabled} />
}

function ReminderTrigger({ fee, disabled }: { fee: MonthlyFeeDetails; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(fee.fee_month)
  const trigger = useRef<HTMLButtonElement>(null)
  const locked = useContextDataLocked()
  if (fee.payment_status !== 'unpaid' || fee.actual_amount <= 0) return null
  return <>
    <button ref={trigger} type="button" className="button button-secondary button-small fee-reminder-trigger" aria-label={`WhatsApp 提醒：${fee.student?.name?.trim() || '学生'} · ${formatFeeMonth(fee.fee_month)}`} disabled={disabled || locked} onClick={() => { setMonth(fee.fee_month); setOpen(true) }}>WhatsApp 提醒</button>
    {open && <FeeReminderModal title="WhatsApp 提醒" onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }}>
      <FeeReminderPreview studentId={fee.student_id} month={month} onMonthChange={setMonth} />
    </FeeReminderModal>}
  </>
}
