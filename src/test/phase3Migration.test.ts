import { readFileSync } from 'node:fs'

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/202608130004_phase3_schedules_sessions.sql`,
  'utf8',
)

describe('Phase 3 migration', () => {
  it.each(['class_schedule_rules', 'class_sessions', 'session_schedule_changes'])('creates and enables RLS on %s', (table) => {
    expect(migration).toContain(`create table public.${table}`)
    expect(migration).toContain(`alter table public.${table} enable row level security;`)
  })

  it('migrates every deployed Phase 2 class schedule without changing its class id', () => {
    expect(migration).toContain('insert into public.class_schedule_rules')
    expect(migration).toMatch(/select\s+owner_id,\s+id,\s+weekday,\s+start_time,\s+end_time,\s+start_date/s)
    expect(migration).toContain("case when status = 'ended' then end_date else null end")
    expect(migration).not.toMatch(/alter table public\.classes\s+drop/i)
  })

  it('allows several weekly schedule slots in one class', () => {
    expect(migration).toContain('schedule_slot_id uuid not null')
    expect(migration).toContain('class_schedule_rules_one_open_rule_per_slot')
    expect(migration).toContain('(class_id, schedule_slot_id)')
    expect(migration).not.toMatch(/class_schedule_rules_one_open_rule\s+on/)
  })

  it('prevents duplicate regular sessions by rule and original start', () => {
    expect(migration).toContain('class_sessions_regular_rule_origin_unique')
    expect(migration).toContain('(schedule_rule_id, original_start_at)')
    expect(migration).not.toContain('(class_id, schedule_week)')
    expect(migration).toContain("where session_type = 'regular'")
    expect(migration).toContain('on conflict do nothing')
  })

  it('uses schedule rules as the only session-generation source of truth', () => {
    const generator = migration.slice(
      migration.indexOf('function public.ensure_class_sessions'),
      migration.indexOf('function public.preview_class_schedule_change'),
    )

    expect(generator).toContain('r.weekday')
    expect(generator).toContain('r.start_time')
    expect(generator).toContain('r.end_time')
    expect(generator).not.toContain('c.weekday')
    expect(generator).not.toContain('c.start_time')
    expect(generator).not.toContain('c.end_time')
  })

  it('ties the legacy class schedule mirror to an explicit rule and syncs it transactionally', () => {
    expect(migration).toContain('add column schedule_summary_rule_id uuid')
    expect(migration).toContain('classes_schedule_summary_rule_owner_fk')
    expect(migration).toContain('function public.enforce_class_schedule_summary')
    expect(migration).toContain('schedule_summary_rule_id = v_new_rule.id')
    expect(migration).toContain('schedule_summary_rule_id = v_old_rule.id')
  })

  it('uses Kuala Lumpur local schedule values to create timestamptz instants', () => {
    expect(migration).toContain("at time zone 'Asia/Kuala_Lumpur'")
    expect(migration).toContain('original_start_at timestamptz not null')
    expect(migration).toContain('current_start_at timestamptz not null')
  })

  it('uses database transactions for every critical Phase 3 action', () => {
    expect(migration).toContain('function public.ensure_class_sessions')
    expect(migration).toContain('function public.change_class_schedule')
    expect(migration).toContain('function public.reschedule_class_session')
    expect(migration).toContain('function public.cancel_class_session')
    expect(migration).toContain('function public.restore_class_session')
    expect(migration).toContain('function public.stop_class_sessions_for_date')
    expect(migration).toContain('function public.create_extra_class_session')
  })

  it('restores only a stopped session row without replacing its schedule data', () => {
    const restore = migration.slice(
      migration.indexOf('function public.restore_class_session'),
      migration.indexOf('function public.stop_class_sessions_for_date'),
    )

    expect(restore).toContain("v_session.status <> 'cancelled'")
    expect(restore).toContain("and status = 'active'")
    expect(restore).toContain("set status = 'scheduled', cancelled_at = null")
    expect(restore).not.toContain('insert into public.class_sessions')
    expect(restore).not.toMatch(/set\s+(original|current)_/i)
  })

  it('does not allow a completed session to be stopped or restored', () => {
    const stopOne = migration.slice(
      migration.indexOf('function public.cancel_class_session'),
      migration.indexOf('function public.restore_class_session'),
    )
    const restore = migration.slice(
      migration.indexOf('function public.restore_class_session'),
      migration.indexOf('function public.stop_class_sessions_for_date'),
    )

    expect(stopOne).toContain("v_session.status <> 'scheduled'")
    expect(restore).toContain("v_session.status <> 'cancelled'")
  })

  it('stops every still-scheduled session on one Malaysia calendar date atomically', () => {
    const fullDayStop = migration.slice(
      migration.indexOf('function public.stop_class_sessions_for_date'),
      migration.indexOf('function public.create_extra_class_session'),
    )

    expect(fullDayStop).toContain('perform public.ensure_class_sessions(p_session_date, p_session_date)')
    expect(fullDayStop).toContain("status = 'scheduled'")
    expect(fullDayStop).toContain("set status = 'cancelled', cancelled_at = now()")
    expect(fullDayStop).toContain("at time zone 'Asia/Kuala_Lumpur'")
    expect(fullDayStop).not.toMatch(/reason/i)
  })

  it('retains original session times and appends every individual reschedule', () => {
    expect(migration).toContain('insert into public.session_schedule_changes')
    expect(migration).toContain('v_session.current_start_at')
    expect(migration).toContain('set current_start_at = p_new_start_at')
    expect(migration).not.toContain('set original_start_at = p_new_start_at')
  })

  it('keeps cancelled and individually adjusted future sessions during permanent changes', () => {
    expect(migration).toContain("session.status = 'scheduled'")
    expect(migration).toContain('not exists (')
    expect(migration).toContain('from public.session_schedule_changes')
    expect(migration).toContain("set status = 'cancelled', cancelled_at = now()")
  })

  it('does not grant direct writes to the new business tables', () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*class_schedule_rules/i)
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*class_sessions/i)
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*session_schedule_changes/i)
  })
})
