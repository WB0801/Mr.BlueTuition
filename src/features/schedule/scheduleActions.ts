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

export function getAllDayStopConfirmationMessage(dateLabel: string, stoppableCount: number, protectedCount: number) {
  return [
    `${dateLabel} 将停课 ${stoppableCount} 堂。`,
    `因已有签到而保留 ${protectedCount} 堂。`,
    '确定继续吗？课程不会删除，也不会自动建立补课。',
  ].join('\n')
}
