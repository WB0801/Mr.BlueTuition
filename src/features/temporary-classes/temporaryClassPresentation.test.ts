import {
  getTemporaryClassTiming,
  temporaryClassTimingLabel,
  temporaryPaymentLabel,
} from './temporaryClassPresentation'

describe('temporary class presentation', () => {
  const base = {
    status: 'active' as const,
    start_at: '2026-08-21T06:00:00.000Z',
    end_at: '2026-08-21T08:00:00.000Z',
  }

  it('distinguishes upcoming, in-progress, elapsed active and ended classes from existing fields', () => {
    expect(getTemporaryClassTiming(base, new Date('2026-08-21T05:00:00.000Z'))).toBe('upcoming')
    expect(getTemporaryClassTiming(base, new Date('2026-08-21T07:00:00.000Z'))).toBe('in-progress')
    expect(getTemporaryClassTiming(base, new Date('2026-08-21T09:00:00.000Z'))).toBe('needs-ending')
    expect(getTemporaryClassTiming({ ...base, status: 'ended' }, new Date('2026-08-21T05:00:00.000Z'))).toBe('ended')
    expect(temporaryClassTimingLabel('needs-ending')).toBe('待结束')
  })

  it('summarises real payment progress without invented values', () => {
    expect(temporaryPaymentLabel({ paid: 0, unpaid: 0, total: 0 })).toBe('尚无收费')
    expect(temporaryPaymentLabel({ paid: 2, unpaid: 1, total: 3 })).toBe('收费 2/3 已缴')
    expect(temporaryPaymentLabel({ paid: 3, unpaid: 0, total: 3 })).toBe('收费 3/3 已缴')
  })
})
