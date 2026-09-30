import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  ClassScheduleRule,
  ClassSession,
  ClassSessionWithClass,
  AllDayStopSession,
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

const sessionSelection = '*, class:classes(id,name,status,subject:subjects(id,name)), temporary_class:temporary_classes(id,name,status,subject:subjects(id,name))'

export type AttendanceView = 'today' | 'week' | 'history'

export interface AttendanceHistoryCursor { startAt: string; id: string }
export interface AttendanceHistoryPage {
  sessions: ClassSessionWithClass[]
  pastCount: number
  nextCursor: AttendanceHistoryCursor | null
}

interface StudentEnrollmentWindow {
  classId: string
  joinDate: string
  endDate: string | null
}

export interface StudentAttendanceScope {
  enrollments: StudentEnrollmentWindow[]
  temporaryClassIds: string[]
  makeupSessionIds: string[]
}

// The roster RPC has three participation sources. Read all pages of each
// source, including ended registrations and old enrollments, before filtering.
export async function loadStudentAttendanceScope(studentId: string): Promise<StudentAttendanceScope> {
  const [enrollments, temporary, makeup] = await Promise.all([
    readStudentParticipationRows<{ class_id: string; join_date: string; end_date: string | null }>('enrollments', 'id,class_id,join_date,end_date', studentId),
    readStudentParticipationRows<{ temporary_class_id: string }>('temporary_class_enrollments', 'id,temporary_class_id', studentId),
    readStudentParticipationRows<{ target_session_id: string }>('makeup_links', 'id,target_session_id', studentId),
  ])
  return {
    enrollments: enrollments.map((item) => ({ classId: item.class_id, joinDate: item.join_date, endDate: item.end_date })),
    temporaryClassIds: [...new Set(temporary.map((item) => item.temporary_class_id))],
    makeupSessionIds: [...new Set(makeup.map((item) => item.target_session_id))],
  }
}

async function readStudentParticipationRows<T>(table: string, columns: string, studentId: string): Promise<T[]> {
  const result: T[] = []
  const batchSize = 500
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await requireSupabase().from(table).select(columns)
      .eq('student_id', studentId).order('id', { ascending: true }).range(offset, offset + batchSize - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    result.push(...batch)
    if (batch.length < batchSize) break
  }
  return result
}

// Query only sessions that can contain this student under the existing roster
// rules. Each source is bounded to 101 rows; their sorted union gives one
// stable 100-course page without scanning every other class in the system.
export async function listStudentAttendanceHistoryPage(
  cursor: AttendanceHistoryCursor | null,
  scope: StudentAttendanceScope,
  referenceDate = todayInMalaysia(),
  classId = '',
): Promise<AttendanceHistoryPage> {
  if (!cursor) await ensureRollingSessions(referenceDate)
  const cursorFilter = cursor ? historyCursorFilter(cursor) : null
  const todayStart = malaysiaDateTime(referenceDate, '00:00')
  type Source = { type: 'enrollment'; window: StudentEnrollmentWindow } | { type: 'temporary' | 'makeup'; ids: string[] }
  const sources: Source[] = [
    ...scope.enrollments.filter((item) => !classId || item.classId === classId).map((window): Source => ({ type: 'enrollment', window })),
  ]
  if (!classId) {
    for (let index = 0; index < scope.temporaryClassIds.length; index += 50) {
      sources.push({ type: 'temporary', ids: scope.temporaryClassIds.slice(index, index + 50) })
    }
  }
  for (let index = 0; index < scope.makeupSessionIds.length; index += 50) {
    sources.push({ type: 'makeup', ids: scope.makeupSessionIds.slice(index, index + 50) })
  }
  const results: ClassSessionWithClass[][] = []
  // Keep request fan-out bounded for students with many historical enrollments.
  for (let index = 0; index < sources.length; index += 8) {
    const batch = await Promise.all(sources.slice(index, index + 8).map(async (source) => {
      let query = requireSupabase().from('class_sessions').select(sessionSelection)
        .neq('status', 'cancelled').lt('current_start_at', todayStart)
        .order('current_start_at', { ascending: false }).order('id', { ascending: false }).limit(101)
      if (cursorFilter) query = query.or(cursorFilter)
      if (source.type === 'enrollment') {
        query = query.eq('class_id', source.window.classId)
          .gte('current_start_at', malaysiaDateTime(source.window.joinDate, '00:00'))
        if (source.window.endDate) query = query.lt('current_start_at', malaysiaDateTime(addCalendarDays(source.window.endDate, 1), '00:00'))
      } else if (source.type === 'temporary') {
        query = query.in('temporary_class_id', source.ids)
      } else {
        query = query.in('id', source.ids)
        if (classId) query = query.eq('class_id', classId)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as ClassSessionWithClass[]
    }))
    results.push(...batch)
  }
  const unique = new Map(results.flat().map((session) => [session.id, session]))
  const ordered = [...unique.values()].sort((left, right) =>
    Date.parse(right.current_start_at) - Date.parse(left.current_start_at) || right.id.localeCompare(left.id))
  const page = ordered.slice(0, 100)
  const last = page.at(-1)
  return {
    sessions: page,
    pastCount: page.length,
    nextCursor: ordered.length > 100 && last ? { startAt: last.current_start_at, id: last.id } : null,
  }
}

function historyCursorFilter(cursor: AttendanceHistoryCursor) {
  if (!/^[\w-]+$/.test(cursor.id) || !/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(cursor.startAt) || !Number.isFinite(Date.parse(cursor.startAt))) throw new Error('无效的历史课程游标。')
  return `current_start_at.lt.${cursor.startAt},and(current_start_at.eq.${cursor.startAt},id.lt.${cursor.id})`
}

// Stable keyset pagination: equal timestamps use the UUID as a second ordering key.
export async function listAttendanceHistoryPage(cursor: AttendanceHistoryCursor | null, classId = '', referenceDate = todayInMalaysia()): Promise<AttendanceHistoryPage> {
  if (!cursor) await ensureRollingSessions(referenceDate)
  const todayStart = malaysiaDateTime(referenceDate, '00:00')
  let query = requireSupabase().from('class_sessions').select(sessionSelection)
    .lt('current_start_at', todayStart)
    .order('current_start_at', { ascending: false }).order('id', { ascending: false }).limit(101)
  if (classId) query = query.eq('class_id', classId)
  if (cursor) query = query.or(historyCursorFilter(cursor))
  const { data, error } = await query
  if (error) throw error
  const past = (data ?? []) as unknown as ClassSessionWithClass[]
  const page = past.slice(0, 100)
  let future: ClassSessionWithClass[] = []
  if (!cursor) {
    let cancelled = requireSupabase().from('class_sessions').select(sessionSelection)
      .eq('status', 'cancelled').gte('current_start_at', todayStart)
      .order('current_start_at', { ascending: false }).limit(100)
    if (classId) cancelled = cancelled.eq('class_id', classId)
    const result = await cancelled
    if (result.error) throw result.error
    future = (result.data ?? []) as unknown as ClassSessionWithClass[]
  }
  const last = page.at(-1)
  return {
    sessions: [...future, ...page], pastCount: page.length,
    nextCursor: past.length > 100 && last ? { startAt: last.current_start_at, id: last.id } : null,
  }
}

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

export async function listScheduledSessionsForDate(date: string): Promise<AllDayStopSession[]> {
  const { error } = await requireSupabase().rpc('ensure_class_sessions', {
    p_from_date: date,
    p_to_date: date,
  })
  if (error) throw error

  const sessions = await queryScheduledRange(
    malaysiaDateTime(date, '00:00'),
    malaysiaDateTime(addCalendarDays(date, 1), '00:00'),
  )
  if (sessions.length === 0) return []

  const { data, error: attendanceError } = await requireSupabase()
    .from('attendance_records')
    .select('session_id')
    .in('session_id', sessions.map((session) => session.id))
    .eq('status', 'valid')

  if (attendanceError) throw attendanceError
  const protectedIds = new Set((data ?? []).map((record) => record.session_id as string))
  return sessions.map((session) => ({
    ...session,
    has_valid_attendance: protectedIds.has(session.id),
  }))
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
