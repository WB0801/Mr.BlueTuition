import type { ClassScheduleRule, ClassSessionWithClass } from '../../types/domain'

export function selectPrimaryScheduleRules(
  rules: ClassScheduleRule[],
  summaryRuleId: string | null | undefined,
  referenceDate: string,
) {
  const summaryRule = rules.find((rule) => rule.id === summaryRuleId)
  const primarySlotId = summaryRule?.schedule_slot_id
  const primaryRules = primarySlotId
    ? rules.filter((rule) => rule.schedule_slot_id === primarySlotId)
    : rules
  const openRule = primaryRules.find((rule) => rule.effective_to === null)
  const currentRule = primaryRules.find((rule) => (
    rule.effective_from <= referenceDate
    && (rule.effective_to === null || rule.effective_to >= referenceDate)
  )) ?? openRule ?? primaryRules[0]
  const upcomingRule = primaryRules
    .filter((rule) => rule.effective_from > referenceDate)
    .sort((left, right) => left.effective_from.localeCompare(right.effective_from))[0] ?? null

  return { currentRule, openRule, upcomingRule }
}

export function splitClassSessions(sessions: ClassSessionWithClass[], referenceTime: number) {
  const ordered = [...sessions].sort((left, right) => (
    left.current_start_at.localeCompare(right.current_start_at)
  ))

  return {
    future: ordered.filter((session) => new Date(session.current_start_at).getTime() >= referenceTime),
    history: ordered
      .filter((session) => new Date(session.current_start_at).getTime() < referenceTime)
      .reverse(),
  }
}
