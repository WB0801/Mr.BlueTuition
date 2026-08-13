import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  ClassScheduleRule,
  ClassSession,
  ClassSessionWithClass,
  ScheduleChangeInput,
  ScheduleChangePreview,
  SessionScheduleChange,
} from '../../../types/domain'
import {
  addCalendarDays,
  malaysiaDateTime,
  startOfWeekInMalaysia,
  todayInMalaysia,
} from '../../../utils/format'

const sessionSelection = '*, class:classes(id,name,status,subject:subjects(id,name))'

export type AttendanceView = 'today' | 'week' | 'history'

export async function ensureRollingSessions(referenceDate = todayInMalaysia()) {
  const { error } = await requireSupabase().rpc('ensure_class_sessions', {
    p_from_date: addCalendarDays(referenceDate, -30),
    p_to_date: addCalendarDays(referenceDate, 90),
  })
  if (error) throw error
}

export async function getLatestScheduleRule(classId: string): Promise<ClassScheduleRule> {
  const { data, error } = await requireSupabase()
    .from('class_schedule_rules')
    .select('*')
    .eq('class_id', classId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  return data as ClassScheduleRule
}

export async function listScheduleRules(classId: string): Promise<ClassScheduleRule[]> {
  const { data, error } = await requireSupabase()
    .from('class_schedule_rules')
    .select('*')
    .eq('class_id', classId)
    .order('effective_from', { ascending: false })

  if (error) throw error
  return (data ?? []) as ClassScheduleRule[]
}

export async function listClassSessions(classId: string): Promise<ClassSessionWithClass[]> {
  await ensureRollingSessions()
  const { data, error } = await requireSupabase()
    .from('class_sessions')
    .select(sessionSelection)
    .eq('class_id', classId)
    .order('current_start_at', { ascending: true })
    .limit(300)

  if (error) throw error
  return (data ?? []) as unknown as ClassSessionWithClass[]
}

export async function listAttendanceSessions(view: AttendanceView): Promise<ClassSessionWithClass[]> {
  await ensureRollingSessions()
  const today = todayInMalaysia()
  const todayStart = malaysiaDateTime(today, '00:00')

  if (view === 'today') {
    return queryScheduledRange(todayStart, malaysiaDateTime(addCalendarDays(today, 1), '00:00'))
  }

  if (view === 'week') {
    const monday = startOfWeekInMalaysia(today)
    return queryScheduledRange(
      malaysiaDateTime(monday, '00:00'),
      malaysiaDateTime(addCalendarDays(monday, 7), '00:00'),
    )
  }

  const [pastResult, cancelledResult] = await Promise.all([
    requireSupabase()
      .from('class_sessions')
      .select(sessionSelection)
      .lt('current_start_at', todayStart)
      .order('current_start_at', { ascending: false })
      .limit(100),
    requireSupabase()
      .from('class_sessions')
      .select(sessionSelection)
      .eq('status', 'cancelled')
      .gte('current_start_at', todayStart)
      .order('current_start_at', { ascending: false })
      .limit(100),
  ])

  if (pastResult.error) throw pastResult.error
  if (cancelledResult.error) throw cancelledResult.error

  const sessions = [
    ...((pastResult.data ?? []) as unknown as ClassSessionWithClass[]),
    ...((cancelledResult.data ?? []) as unknown as ClassSessionWithClass[]),
  ]
  return sessions.sort((left, right) => right.current_start_at.localeCompare(left.current_start_at))
}

async function queryScheduledRange(from: string, to: string): Promise<ClassSessionWithClass[]> {
  const { data, error } = await requireSupabase()
    .from('class_sessions')
    .select(sessionSelection)
    .eq('status', 'scheduled')
    .gte('current_start_at', from)
    .lt('current_start_at', to)
    .order('current_start_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as ClassSessionWithClass[]
}

export async function listScheduledSessionsForDate(date: string): Promise<ClassSessionWithClass[]> {
  const { error } = await requireSupabase().rpc('ensure_class_sessions', {
    p_from_date: date,
    p_to_date: date,
  })
  if (error) throw error

  return queryScheduledRange(
    malaysiaDateTime(date, '00:00'),
    malaysiaDateTime(addCalendarDays(date, 1), '00:00'),
  )
}

export async function getSession(sessionId: string): Promise<ClassSessionWithClass> {
  const { data, error } = await requireSupabase()
    .from('class_sessions')
    .select(sessionSelection)
    .eq('id', sessionId)
    .single()

  if (error) throw error
  return data as unknown as ClassSessionWithClass
}

export async function listSessionChanges(sessionId: string): Promise<SessionScheduleChange[]> {
  const { data, error } = await requireSupabase()
    .from('session_schedule_changes')
    .select('*')
    .eq('session_id', sessionId)
    .order('changed_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as SessionScheduleChange[]
}

export async function rescheduleSession(
  sessionId: string,
  newStartAt: string,
  newEndAt: string,
): Promise<ClassSession> {
  const { data, error } = await requireSupabase().rpc('reschedule_class_session', {
    p_session_id: sessionId,
    p_new_start_at: newStartAt,
    p_new_end_at: newEndAt,
  })
  if (error) throw error
  return data as ClassSession
}

export async function stopSession(sessionId: string): Promise<ClassSession> {
  const { data, error } = await requireSupabase().rpc('cancel_class_session', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return data as ClassSession
}

export async function restoreSession(sessionId: string): Promise<ClassSession> {
  const { data, error } = await requireSupabase().rpc('restore_class_session', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return data as ClassSession
}

export async function stopSessionsForDate(date: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('stop_class_sessions_for_date', {
    p_session_date: date,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function createExtraSession(
  classId: string,
  startAt: string,
  endAt: string,
): Promise<ClassSession> {
  const { data, error } = await requireSupabase().rpc('create_extra_class_session', {
    p_class_id: classId,
    p_start_at: startAt,
    p_end_at: endAt,
  })
  if (error) throw error
  return data as ClassSession
}

export async function previewScheduleChange(
  classId: string,
  scheduleRuleId: string,
  effectiveFrom: string,
): Promise<ScheduleChangePreview> {
  const { data, error } = await requireSupabase().rpc('preview_class_schedule_change', {
    p_class_id: classId,
    p_schedule_rule_id: scheduleRuleId,
    p_effective_from: effectiveFrom,
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  return {
    affected_count: Number(result?.affected_count ?? 0),
    manually_adjusted_count: Number(result?.manually_adjusted_count ?? 0),
  }
}

export async function changeClassSchedule(
  classId: string,
  scheduleRuleId: string,
  input: ScheduleChangeInput,
) {
  const { data, error } = await requireSupabase().rpc('change_class_schedule', {
    p_class_id: classId,
    p_schedule_rule_id: scheduleRuleId,
    p_weekday: input.weekday,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
    p_effective_from: input.effective_from,
  })
  if (error) throw error
  return data as ScheduleChangePreview & { schedule_rule_id: string }
}
