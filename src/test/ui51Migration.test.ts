import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202608210009_ui51_safe_permanent_deletion.sql'), 'utf8')
const deletionUsages = [
  'src/features/students/pages/StudentDetailPage.tsx',
  'src/features/classes/pages/SubjectsPage.tsx',
  'src/features/classes/pages/ClassDetailPage.tsx',
  'src/features/temporary-classes/pages/TemporaryClassDetailPage.tsx',
  'src/features/grades/pages/SchoolExamDetailPage.tsx',
  'src/features/grades/pages/TuitionQuizDetailPage.tsx',
].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n')

describe('UI 5.1 permanent deletion migration', () => {
  it('is additive and exposes only owner-scoped preview and transaction RPCs', () => {
    expect(migration).toMatch(/begin;[\s\S]*commit;/)
    expect(migration).toContain('create or replace function public.ui51_preview_permanent_delete')
    expect(migration).toContain('create or replace function public.ui51_permanently_delete_entity')
    expect(migration).toContain('v_owner_id uuid := auth.uid()')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain("raise exception 'Authentication required'")
    expect(migration).not.toMatch(/\bexecute\s+format\b/i)
    expect(migration).not.toMatch(/\btruncate\b/i)
    expect(migration).not.toMatch(/\bdrop\s+table\b/i)
  })

  it('whitelists all supported root entity types and revokes private helpers', () => {
    for (const entity of ['student', 'subject', 'class', 'temporary_class', 'school_exam', 'tuition_quiz']) {
      expect(migration).toContain(`when '${entity}' then`)
    }
    expect(migration).toContain("raise exception 'Unsupported permanent deletion type'")
    expect(migration).toContain('revoke all on function public.ui51_delete_class_data(uuid, uuid) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.ui51_permanently_delete_entity(text, uuid, text) to authenticated')
  })

  it('handles the circular class schedule relation and dependent records before roots', () => {
    expect(migration).toContain('update public.classes set schedule_summary_rule_id = null')
    expect(migration.indexOf('delete from public.class_sessions')).toBeLessThan(migration.indexOf('delete from public.class_schedule_rules'))
    expect(migration).toContain('delete from public.attendance_corrections')
    expect(migration).toContain('delete from public.attendance_records')
    expect(migration).toContain('delete from public.makeup_links')
    expect(migration).toContain('update public.enrollments set transferred_from_enrollment_id = null')
  })

  it('returns exact signature paths and permits only own-bucket Storage API deletion', () => {
    expect(migration).toContain("jsonb_build_object('signature_paths', v_paths)")
    expect(migration).toContain('on storage.objects for delete to authenticated')
    expect(migration).toContain("bucket_id = 'signatures'")
    expect(migration).toContain("split_part(name, '/', 1) = (select auth.uid())::text")
    expect(migration).not.toContain('delete from storage.objects')
  })

  it('places the shared danger mechanism on every user-created core entity', () => {
    for (const entity of ['student', 'subject', 'class', 'temporary_class', 'school_exam', 'tuition_quiz']) {
      expect(deletionUsages).toContain(`entityType="${entity}"`)
    }
    expect((deletionUsages.match(/PermanentDeleteZone/g) ?? []).length).toBeGreaterThanOrEqual(12)
  })
})
