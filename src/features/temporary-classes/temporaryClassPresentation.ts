import type { TemporaryClassStatus } from '../../types/domain'

export type TemporaryClassTiming = 'upcoming' | 'in-progress' | 'needs-ending' | 'ended'

export interface TemporaryClassPresentationInput {
  start_at: string
  end_at: string
  status: TemporaryClassStatus
}

export interface TemporaryPaymentProgress {
  paid: number
  total: number
  unpaid: number
}

export function getTemporaryClassTiming(
  temporaryClass: TemporaryClassPresentationInput,
  now = new Date(),
): TemporaryClassTiming {
  if (temporaryClass.status === 'ended') return 'ended'
  const currentTime = now.getTime()
  if (currentTime < new Date(temporaryClass.start_at).getTime()) return 'upcoming'
  if (currentTime <= new Date(temporaryClass.end_at).getTime()) return 'in-progress'
  return 'needs-ending'
}

export function temporaryClassTimingLabel(timing: TemporaryClassTiming) {
  if (timing === 'upcoming') return '即将开始'
  if (timing === 'in-progress') return '进行中'
  if (timing === 'needs-ending') return '待结束'
  return '已结束'
}

export function temporaryClassTimingTone(timing: TemporaryClassTiming) {
  if (timing === 'in-progress') return 'success' as const
  if (timing === 'upcoming') return 'info' as const
  if (timing === 'needs-ending') return 'warning' as const
  return 'neutral' as const
}

export function temporaryPaymentLabel(progress: TemporaryPaymentProgress) {
  if (progress.total === 0) return '尚无收费'
  if (progress.unpaid === 0) return `收费 ${progress.total}/${progress.total} 已缴`
  return `收费 ${progress.paid}/${progress.total} 已缴`
}
