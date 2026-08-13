import { readFileSync } from 'node:fs'

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/202608130002_phase2_students_classes_enrollments.sql`,
  'utf8',
)

describe('Phase 2 migration', () => {
  it.each(['students', 'subjects', 'classes', 'enrollments'])('enables RLS on %s', (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security;`)
  })

  it('uses transactional functions for enrollment lifecycle actions', () => {
    expect(migration).toContain('function public.create_enrollment')
    expect(migration).toContain('function public.end_enrollment')
    expect(migration).toContain('function public.transfer_enrollment')
    expect(migration).toContain('function public.end_class')
  })

  it('stores every required regular class field on classes', () => {
    const classTable = migration.slice(
      migration.indexOf('create table public.classes'),
      migration.indexOf('create table public.enrollments'),
    )

    expect(classTable).toContain('weekday smallint not null')
    expect(classTable).toContain('start_time time not null')
    expect(classTable).toContain('end_time time not null')
    expect(classTable).toContain('monthly_fee numeric(10, 2) not null')
    expect(classTable).toContain('start_date date not null')
  })

  it('ends the old enrollment one day before the transfer takes effect', () => {
    expect(migration).toContain('p_transfer_date <= v_old.join_date')
    expect(migration).toContain("set status = 'ended', end_date = p_transfer_date - 1")
  })

  it('does not grant permanent delete access', () => {
    expect(migration).not.toMatch(/grant[^;]*delete/i)
  })
})
