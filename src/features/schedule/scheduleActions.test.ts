import {
  canRestoreSession,
  canStopSession,
  getAllDayStopConfirmationMessage,
  getScheduleChangeConfirmationMessage,
} from './scheduleActions'

describe('getScheduleChangeConfirmationMessage', () => {
  it('shows both total affected and protected manually adjusted sessions', () => {
    expect(getScheduleChangeConfirmationMessage({
      affected_count: 13,
      manually_adjusted_count: 2,
    })).toBe([
      '将影响 13 堂未来课程。',
      '其中 2 堂已经人工调整，不会被覆盖。',
      '确定从所选日期开始使用新固定课表？',
    ].join('\n'))
  })

  it('clearly confirms the selected date and all affected sessions for a full-day stop', () => {
    expect(getAllDayStopConfirmationMessage('2026/8/20', 3)).toBe(
      '2026/8/20 共有 3 堂尚未停课的课程。确定全部标记为停课吗？课程不会删除，也不会自动建立补课。',
    )
  })

  it('only offers stop and restore for the allowed lifecycle states', () => {
    expect(canStopSession('scheduled')).toBe(true)
    expect(canStopSession('completed')).toBe(false)
    expect(canRestoreSession('cancelled', 'active')).toBe(true)
    expect(canRestoreSession('cancelled', 'ended')).toBe(false)
    expect(canRestoreSession('completed', 'active')).toBe(false)
  })
})
