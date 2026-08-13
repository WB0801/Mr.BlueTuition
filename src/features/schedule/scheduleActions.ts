import type { ClassStatus, ScheduleChangePreview, SessionStatus } from '../../types/domain'

export function canStopSession(status: SessionStatus) {
  return status === 'scheduled'
}

export function canRestoreSession(status: SessionStatus, classStatus?: ClassStatus) {
  return status === 'cancelled' && classStatus === 'active'
}

export function getScheduleChangeConfirmationMessage(preview: ScheduleChangePreview) {
  return [
    `将影响 ${preview.affected_count} 堂未来课程。`,
    `其中 ${preview.manually_adjusted_count} 堂已经人工调整，不会被覆盖。`,
    '确定从所选日期开始使用新固定课表？',
  ].join('\n')
}

export function getAllDayStopConfirmationMessage(dateLabel: string, sessionCount: number) {
  return `${dateLabel} 共有 ${sessionCount} 堂尚未停课的课程。确定全部标记为停课吗？课程不会删除，也不会自动建立补课。`
}
