import { buildReminderMessage, buildWhatsAppUrl, normalizeMalaysiaPhone, summarizeUnpaidMonth } from './reminderRules'
import type { MonthlyFeeDetails } from '../../types/domain'

describe('manual fee reminder rules', () => {
  const now = new Date('2026-10-02T02:00:00Z')
  it.each([['蓝炜滨', '炜滨'], ['温晴', '温晴'], ['蓝', '蓝'], ['  蓝炜滨\n', '炜滨'], ['蓝𠮷𠮟', '𠮷𠮟']])('uses the last two Unicode characters of %s', (name, address) => {
    expect(buildReminderMessage(name, '2026-09-01', now)).toBe(`${address}，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你`)
  })
  it('matches the exact approved message without final punctuation or extra content', () => {
    expect(buildReminderMessage('蓝炜滨', '2026-09-01', now)).toBe('炜滨，提醒一下，9月的学费还没有给我哦，如果转了的话再 screenshot 给我，谢谢你')
  })
  it('includes a different year and uses the Malaysian year at the UTC boundary', () => {
    expect(buildReminderMessage('温晴', '2025-09-01', now)).toContain('2025年9月的学费')
    expect(buildReminderMessage('温晴', '2027-01-01', new Date('2026-12-31T16:01:00Z'))).toContain('1月的学费')
    expect(buildReminderMessage('温晴', '2026-12-01', new Date('2026-12-31T16:01:00Z'))).toContain('2026年12月的学费')
  })
  it('refuses missing identity and malformed fee months', () => {
    expect(buildReminderMessage('  ', '2026-09-01', now)).toBeNull()
    expect(buildReminderMessage('温晴', '2026-13-01', now)).toBeNull()
    expect(buildReminderMessage('温晴', 'not-a-month', now)).toBeNull()
  })
  it.each([
    ['012-3456789', '60123456789'], ['  +60 (12) 345-6789 ', '60123456789'], ['60123456789', '60123456789'],
    ['011-12345678', '601112345678'], ['019-12345678', '601912345678'], ['012-3000001', '60123000001'],
    ['03-23456789', '60323456789'],
  ])('normalizes only an unambiguous MY phone %s', (input, expected) => expect(normalizeMalaysiaPhone(input)).toBe(expected))
  it.each([null, '', '123456789', '+65 91234567', '0060123456789', '60 0123456789', '012345', '012-3456789 / 019-1234567', '012+3456789', '0123456789 ext 1', '(012-3456789', '012-34567890'])('rejects a missing or uncertain phone %s', input => expect(normalizeMalaysiaPhone(input)).toBeNull())
  it('encodes the edited message including newlines, spaces and special characters', () => {
    const url = buildWhatsAppUrl('012-3456789', '你好\nA & B + # ?')
    expect(url).toBe('https://wa.me/60123456789?text=%E4%BD%A0%E5%A5%BD%0AA%20%26%20B%20%2B%20%23%20%3F')
    expect(buildWhatsAppUrl(null, '你好')).toBeNull()
    expect(buildWhatsAppUrl('012-3456789', '  ')).toBeNull()
  })
  it('aggregates by UUID and month, not shared phone or names; excludes paid/waived/zero', () => {
    const row = (id: string, amount: number, studentId = 'a', status = 'unpaid', month = '2026-09-01') => ({ id, student_id: studentId, fee_month: month, actual_amount: amount, payment_status: status }) as MonthlyFeeDetails
    const all = [row('one', 100.1), row('two', 20.2), row('paid', 30, 'a', 'paid'), row('waived', 60, 'a', 'waived'), row('zero', 0), row('other', 99, 'b'), row('old', 40, 'a', 'unpaid', '2025-09-01')]
    expect(summarizeUnpaidMonth(all, 'a', '2026-09-01')).toMatchObject({ records: [{ id: 'one' }, { id: 'two' }], total: 120.3, months: ['2026-09-01', '2025-09-01'] })
    expect(summarizeUnpaidMonth(all, 'b', '2026-09-01')).toMatchObject({ records: [{ id: 'other' }], total: 99 })
  })
  it('refuses malformed unpaid amounts instead of silently omitting them', () => {
    for (const amount of [NaN, Infinity, -1]) {
      expect(() => summarizeUnpaidMonth([{ student_id: 'a', payment_status: 'unpaid', fee_month: '2026-09-01', actual_amount: amount } as MonthlyFeeDetails], 'a', '2026-09-01')).toThrow()
    }
  })
})
