import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608140008_phase7_temporary_classes.sql'),
  'utf8',
)

describe('Phase 7 temporary classes migration', () => {
  it('keeps temporary classes, registrations, and one-time payment snapshots separate from monthly fees', () => {
    expect(migration).toContain('create table public.temporary_classes')
    expect(migration).toContain('create table public.temporary_class_enrollments')
    expect(migration).toContain('create table public.temporary_class_payments')
    expect(migration).toContain('unique (temporary_class_id, student_id)')
    expect(migration).toContain('unique (temporary_class_enrollment_id)')
    expect(migration).toContain('v_amount')
    expect(migration).toContain('select fee_amount into v_amount')
    expect(migration).not.toContain('insert into public.monthly_fees')
  })

  it('adds exactly one temporary Session without weakening regular and extra Session structure', () => {
    expect(migration).toContain("session_type in ('regular', 'extra', 'temporary')")
    expect(migration).toContain("session_type = 'temporary'")
    expect(migration).toContain('class_id is null')
    expect(migration).toContain('temporary_class_id is not null')
    expect(migration).toContain('class_sessions_one_temporary_session')
    expect(migration).toContain("v_owner_id, null, v_class.id, null, 'temporary', null")
  })

  it('reuses attendance and forbids cross-class makeup for temporary sessions', () => {
    const roster = migration.slice(
      migration.indexOf('function public.get_session_attendance_roster'),
      migration.indexOf('function public.record_attendance'),
    )
    const record = migration.slice(
      migration.indexOf('function public.record_attendance'),
      migration.indexOf('function public.restore_class_session'),
    )
    expect(roster).toContain('public.temporary_class_enrollments')
    expect(roster).toContain("v_session.session_type = 'temporary'")
    expect(roster).toContain("v_session.session_type <> 'temporary'")
    expect(record).toContain('public.temporary_class_enrollments')
    expect(record).toContain("v_participation_type := 'regular'")
    expect(record).toContain("raise exception 'Student is not in this Session roster'")
  })

  it('protects facts when editing time, subject, and fee', () => {
    const update = migration.slice(
      migration.indexOf('function public.update_temporary_class'),
      migration.indexOf('function public.add_student_to_temporary_class'),
    )
    expect(update).toContain('Subject cannot change after students have registered')
    expect(update).toContain('Temporary class with valid attendance cannot change time')
    expect(update).toContain('insert into public.session_schedule_changes')
    expect(update).toContain('fee_amount = p_fee_amount')
    expect(update).not.toContain('update public.temporary_class_payments')
  })

  it('unifies receipts atomically while preserving owner RLS', () => {
    expect(migration).toContain('create view public.receipt_queue')
    expect(migration).toContain('security_invoker = true')
    expect(migration).toContain("'monthly_fee:' || mf.id::text")
    expect(migration).toContain("'temporary_class_payment:' || p.id::text")
    expect(migration).toContain('function public.complete_receipts')
    expect(migration).toContain('function public.restore_receipt')
    for (const table of ['temporary_classes', 'temporary_class_enrollments', 'temporary_class_payments']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`grant select on public.${table} to authenticated`)
      expect(migration).not.toContain(`grant insert on public.${table}`)
    }
  })

  it('archives instead of deleting and retains historical backfill support', () => {
    const end = migration.slice(
      migration.indexOf('function public.end_temporary_class'),
      migration.indexOf('create view public.receipt_queue'),
    )
    expect(end).toContain("set status = 'ended'")
    expect(end).toContain("set status = 'completed'")
    expect(end).not.toContain('delete from')
    expect(migration).toContain("v_session.status not in ('scheduled', 'completed')")
  })

  it('allows payment settlement for existing registrations after a temporary class ends', () => {
    const paymentFunctions = migration.slice(
      migration.indexOf('function public.mark_temporary_class_payment_paid'),
      migration.indexOf('function public.end_temporary_class'),
    )

    expect(paymentFunctions).not.toContain("tc.status = 'active'")
    expect(paymentFunctions).not.toContain("e.status = 'active'")
    expect(paymentFunctions).toContain("set payment_status = 'paid', paid_at = now(), receipt_status = 'pending'")
  })
})
