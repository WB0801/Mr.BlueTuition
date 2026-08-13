import { formatDate, formatMoney, formatTime, weekdayLabels } from './format'

describe('format helpers', () => {
  it('formats class schedule fields for the requested UI', () => {
    expect(weekdayLabels[6]).toBe('星期六')
    expect(formatTime('14:00:00')).toBe('2:00 pm')
    expect(formatMoney(100)).toBe('RM100')
    expect(formatMoney(50.5)).toBe('RM50.50')
  })

  it('keeps an absent end date visibly distinct', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('2026-08-15')).toContain('2026')
  })
})
