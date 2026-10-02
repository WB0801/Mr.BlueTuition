import type { MonthlyFeeDetails } from '../../types/domain'

export function buildReminderMessage(name: string | null | undefined, feeMonth: string, now = new Date()): string | null {
  const characters = Array.from(name?.trim() ?? '')
  if (!characters.length || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(feeMonth)) return null
  const currentYear = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' }).format(now)
  const [year, month] = feeMonth.split('-')
  const label = `${year === currentYear ? '' : `${year}年`}${Number(month)}月`
  return `${characters.slice(-2).join('')}，提醒一下，${label}的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你`
}

export function normalizeMalaysiaPhone(phone: string | null | undefined): string | null {
  const input = phone?.trim() ?? ''
  if (!input || !/^\+?[\d\s()-]+$/.test(input)) return null
  // Remove formatting only; unmatched/nested brackets and multiple numbers are uncertain.
  let depth = 0
  for (const character of input) {
    if (character === '(' && ++depth > 1) return null
    if (character === ')' && --depth < 0) return null
  }
  if (depth !== 0) return null
  const digits = input.replace(/[\s()+-]/g, '')
  if (input.startsWith('+') && !digits.startsWith('60')) return null
  const national = digits.startsWith('60') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : ''
  // Recognized MY mobile/landline shapes only. This does not verify ownership or WhatsApp registration.
  const mobile = /^(?:1[02-46-8]\d{7}|11\d{8}|19\d{7,8}|15[49]\d{7}|153\d{6})$/.test(national)
  const fixed = /^(?:3\d{8}|[4-9]\d{7})$/.test(national)
  return mobile || fixed ? `60${national}` : null
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeMalaysiaPhone(phone)
  if (!normalized || !message.trim()) return null
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

export function summarizeUnpaidMonth(fees: MonthlyFeeDetails[], studentId: string, feeMonth: string) {
  const candidates = fees.filter(fee => fee.student_id === studentId && fee.payment_status === 'unpaid')
  if (candidates.some(fee => !Number.isFinite(fee.actual_amount) || fee.actual_amount < 0 || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(fee.fee_month))) throw new Error('未缴资料无法核对，请重试。')
  const unpaid = candidates.filter(fee => fee.actual_amount > 0)
  const records = unpaid.filter(fee => fee.fee_month === feeMonth)
  return {
    records,
    total: records.reduce((sum, fee) => sum + Math.round(fee.actual_amount * 100), 0) / 100,
    months: [...new Set(unpaid.map(fee => fee.fee_month))].sort().reverse(),
  }
}
