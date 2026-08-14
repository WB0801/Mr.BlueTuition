import { describe, expect, it } from 'vitest'
import type { ClassScheduleRule, ClassSessionWithClass } from '../../types/domain'
import { selectPrimaryScheduleRules, splitClassSessions } from './scheduleView'

const rules = [
  {
    id: 'future', schedule_slot_id: 'slot-a', weekday: 6, start_time: '15:00:00', end_time: '16:30:00',
    effective_from: '2026-09-01', effective_to: null,
  },
  {
    id: 'current', schedule_slot_id: 'slot-a', weekday: 6, start_time: '14:00:00', end_time: '15:30:00',
    effective_from: '2026-08-01', effective_to: '2026-08-31',
  },
] as ClassScheduleRule[]

describe('class schedule view helpers', () => {
  it('shows the current rule and the next future change separately', () => {
    const result = selectPrimaryScheduleRules(rules, 'future', '2026-08-14')

    expect(result.currentRule?.id).toBe('current')
    expect(result.openRule?.id).toBe('future')
    expect(result.upcomingRule?.id).toBe('future')
  })

  it('keeps stopped and extra sessions in the future course summary', () => {
    const sessions = [
      { id: 'extra', current_start_at: '2026-08-16T02:00:00Z', session_type: 'extra', status: 'scheduled' },
      { id: 'stopped', current_start_at: '2026-08-15T06:00:00Z', session_type: 'regular', status: 'cancelled' },
      { id: 'past', current_start_at: '2026-08-13T06:00:00Z', session_type: 'regular', status: 'completed' },
    ] as ClassSessionWithClass[]

    const result = splitClassSessions(sessions, new Date('2026-08-14T00:00:00Z').getTime())

    expect(result.future.map((session) => session.id)).toEqual(['stopped', 'extra'])
    expect(result.history.map((session) => session.id)).toEqual(['past'])
  })
})
