import { getEndClassConfirmationMessage } from './classActions'

describe('getEndClassConfirmationMessage', () => {
  it('clearly includes the number of affected current enrollments', () => {
    expect(getEndClassConfirmationMessage(3)).toBe(
      '结束此班将同时结束 3 位当前学生的报读。历史资料会保留。确定继续吗？',
    )
  })

  it('also shows zero when the class has no current students', () => {
    expect(getEndClassConfirmationMessage(0)).toContain('0 位当前学生')
  })
})
