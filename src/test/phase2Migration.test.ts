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

  it('does not grant permanent delete access', () => {
    expect(migration).not.toMatch(/grant[^;]*delete/i)
  })
})
