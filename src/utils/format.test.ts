import {
  addCalendarDays,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTime,
  malaysiaDateTime,
  startOfWeekInMalaysia,
  toMalaysiaDateInput,
  toMalaysiaTimeInput,
  weekdayLabels,
} from './format'

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

  it('does calendar arithmetic without shifting Malaysia dates', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addCalendarDays('2026-09-01', -30)).toBe('2026-08-02')
    expect(startOfWeekInMalaysia('2026-08-13')).toBe('2026-08-10')
  })

  it('builds and reads real Malaysia session timestamps', () => {
    const value = malaysiaDateTime('2026-08-15', '14:00')
    expect(value).toBe('2026-08-15T14:00:00+08:00')
    expect(toMalaysiaDateInput(value)).toBe('2026-08-15')
    expect(toMalaysiaTimeInput(value)).toBe('14:00')
    expect(formatDateTime(value)).toContain('2026')
  })
})
