const dateFormatter = new Intl.DateTimeFormat('zh-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('en-MY', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
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
  const date = new Date(2026, 0, 1, Number(hours), Number(minutes))
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
