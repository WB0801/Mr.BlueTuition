const dateFormatter = new Intl.DateTimeFormat('zh-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const dateTimePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Kuala_Lumpur',
  weekday: 'short',
})

export const weekdayLabels: Record<number, string> = {
  1: '星期一',
  2: '星期二',
  3: '星期三',
  4: '星期四',
  5: '星期五',
  6: '星期六',
  7: '星期日',
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return dateFormatter.format(new Date(`${value}T00:00:00+08:00`))
}

export function formatTime(value: string) {
  const [hours = '0', minutes = '0'] = value.split(':')
  const date = new Date(`2026-01-01T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00+08:00`)
  return timeFormatter.format(date)
}

export function formatMoney(value: number) {
  return `RM${new Intl.NumberFormat('en-MY', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)}`
}

export function todayInMalaysia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function formatDateTime(value: string) {
  const parts = malaysiaDateTimeParts(value)
  return `${parts.date}${parts.weekday} ${parts.time}`
}

export function formatSessionTimeRange(startAt: string, endAt: string) {
  const start = malaysiaDateTimeParts(startAt)
  const end = malaysiaDateTimeParts(endAt)

  if (start.date === end.date) {
    return `${start.date}${start.weekday} ${start.time} – ${end.time}`
  }

  return `${start.date}${start.weekday} ${start.time} – ${end.date}${end.weekday} ${end.time}`
}

export function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function startOfWeekInMalaysia(value = todayInMalaysia()) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const isoWeekday = date.getUTCDay() || 7
  return addCalendarDays(value, 1 - isoWeekday)
}

export function malaysiaDateTime(date: string, time: string) {
  return `${date}T${time}:00+08:00`
}

export function toMalaysiaDateInput(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function toMalaysiaTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

function malaysiaDateTimeParts(value: string) {
  const date = new Date(value)
  const parts = dateTimePartsFormatter.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''

  return {
    date: `${part('year')}/${Number(part('month'))}/${Number(part('day'))}`,
    weekday: weekdayFormatter.format(date),
    time: `${part('hour')}:${part('minute')}`,
  }
}
