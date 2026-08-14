import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve('supabase/migrations/202608140005_phase4_attendance_signatures.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')

describe('Phase 4 attendance migration', () => {
  it('stores only signed facts and enforces one valid attendance per student and Session', () => {
    expect(migration).toContain('create table public.attendance_records')
    expect(migration).toContain("check (status in ('valid', 'voided'))")
    expect(migration).toMatch(/create unique index attendance_records_one_valid_student_session[\s\S]*\(session_id, student_id\)[\s\S]*where status = 'valid'/)
    expect(migration).not.toContain("status in ('present', 'absent')")
  })

  it('keeps signatures private and immutable from the frontend', () => {
    expect(migration).toContain("values ('signatures', 'signatures', false")
    expect(migration).toContain('file_size_limit = excluded.file_size_limit')
    expect(migration).toContain("array['image/png']")
    expect(migration).toContain('Users can upload their own private signatures')
    expect(migration).toContain('Users can read their own private signatures')
    expect(migration).toContain("split_part(name, '/', 1) = (select auth.uid())::text")
    expect(migration).not.toMatch(/storage\.objects for (update|delete)/i)
  })

  it('keeps capture and synchronization time distinct while using server time online', () => {
    const recordFunction = migration.slice(
      migration.indexOf('function public.record_attendance'),
      migration.indexOf('function public.void_attendance_record'),
    )
    expect(recordFunction).toContain('client_request_id = p_client_request_id')
    expect(recordFunction).toContain("from storage.objects")
    expect(recordFunction).toContain("bucket_id = 'signatures'")
    expect(recordFunction).toContain("raise exception 'Future Session cannot be signed'")
    expect(recordFunction).toContain("v_capture_source := 'device_offline'")
    expect(recordFunction).toContain("v_capture_source := 'server'")
    expect(recordFunction).toContain('v_captured_at := v_synced_at')
    expect(recordFunction).toMatch(/v_signing_type := case[\s\S]*'backfill'[\s\S]*'checkin'/)
    expect(recordFunction).toMatch(/captured_at,[\s\S]*synced_at,[\s\S]*capture_source/)
  })

  it('derives the roster from effective enrollments and returns no roster for a stopped Session', () => {
    const rosterFunction = migration.slice(
      migration.indexOf('function public.get_session_attendance_roster'),
      migration.indexOf('function public.list_cross_class_candidates'),
    )
    expect(rosterFunction).toContain("if v_session.status = 'cancelled'")
    expect(rosterFunction).toContain('e.join_date <= v_session_date')
    expect(rosterFunction).toContain('(e.end_date is null or e.end_date >= v_session_date)')
    expect(rosterFunction).toContain("ar.status = 'valid'")
    expect(rosterFunction).toContain("ml.link_type = 'makeup'")
    expect(rosterFunction).not.toContain('insert into public.attendance_records')
  })

  it('links cross-class participation without changing the enrollment', () => {
    expect(migration).toContain('create table public.makeup_links')
    expect(migration).toContain('source_enrollment_id uuid not null')
    expect(migration).toContain('target_session_id uuid not null')
    expect(migration).toContain('source_session_id uuid')
    expect(migration).toContain("check (link_type in ('makeup', 'extra'))")
    const addGuest = migration.slice(
      migration.indexOf('function public.add_session_guest'),
      migration.indexOf('function public.record_attendance'),
    )
    expect(addGuest).not.toMatch(/update public\.enrollments/i)
    expect(addGuest).toContain("raise exception 'Student already attended the source Session'")
    expect(addGuest).toContain("raise exception 'Cross-class enrollment must use the same subject'")
  })

  it('voids instead of deleting or overwriting signatures', () => {
    const voidFunction = migration.slice(
      migration.indexOf('function public.void_attendance_record'),
      migration.indexOf('function public.cancel_class_session'),
    )
    expect(voidFunction).toContain("set status = 'voided', voided_at = now()")
    expect(voidFunction).toContain('insert into public.attendance_corrections')
    expect(voidFunction).not.toMatch(/delete from/i)
    expect(voidFunction).not.toMatch(/set\s+signature_path/i)
  })

  it('serializes stop/reschedule operations against valid attendance', () => {
    const stopOne = migration.slice(
      migration.indexOf('function public.cancel_class_session'),
      migration.indexOf('function public.reschedule_class_session'),
    )
    const reschedule = migration.slice(
      migration.indexOf('function public.reschedule_class_session'),
      migration.indexOf('function public.stop_class_sessions_for_date'),
    )
    const stopDay = migration.slice(migration.indexOf('function public.stop_class_sessions_for_date'))
    expect(stopOne).toContain("status = 'valid'")
    expect(reschedule).toContain("status = 'valid'")
    expect(stopDay).toContain('for update')
    expect(stopDay).toMatch(/update public\.class_sessions[\s\S]*not exists[\s\S]*attendance\.status = 'valid'/)
    expect(stopDay).not.toContain('A Session on this date already has valid attendance')
  })

  it('exposes business writes only through authenticated RPC functions', () => {
    expect(migration).toContain('alter table public.attendance_records enable row level security')
    expect(migration).toContain('alter table public.attendance_corrections enable row level security')
    expect(migration).toContain('alter table public.makeup_links enable row level security')
    expect(migration).toContain('grant select on public.attendance_records to authenticated')
    expect(migration).not.toContain('grant insert on public.attendance_records')
    expect(migration).toContain('grant execute on function public.record_attendance')
    expect(migration).toContain('grant execute on function public.void_attendance_record')
  })
})
