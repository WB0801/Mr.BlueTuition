import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608140007_phase6_grades.sql'),
  'utf8',
)

describe('Phase 6 grades migration', () => {
  it('keeps school exams subject-wide and prevents duplicate exams and scores', () => {
    const examTable = migration.slice(
      migration.indexOf('create table public.school_exams'),
      migration.indexOf('create unique index school_exams_owner_subject_year_name_unique'),
    )
    expect(migration).toContain('create table public.school_exams')
    expect(migration).toContain('subject_id uuid not null')
    expect(examTable).toContain('exam_date date not null')
    expect(examTable).toContain('year = extract(year from exam_date)::integer')
    expect(migration).toContain('school_exams_owner_subject_year_name_unique')
    expect(migration).toContain('constraint school_exam_scores_exam_student_unique unique (exam_id, student_id)')
    expect(examTable).not.toContain('class_id')
  })

  it('uses exam date for class placement but permits earlier results through subject history', () => {
    const validation = migration.slice(
      migration.indexOf('function public.phase6_validate_school_exam_score'),
      migration.indexOf('create trigger school_exam_scores_validate'),
    )
    const roster = migration.slice(
      migration.indexOf('function public.list_school_exam_roster'),
      migration.indexOf('function public.list_school_exam_historical_candidates'),
    )
    const save = migration.slice(
      migration.indexOf('function public.save_school_exam_scores'),
      migration.indexOf('function public.delete_school_exam'),
    )
    expect(validation).toContain('c.subject_id = v_subject_id')
    expect(validation).not.toContain('join_date <=')
    expect(validation).not.toContain('end_date >=')
    expect(roster).toContain('e.join_date <= exam.exam_date')
    expect(roster).toContain('e.end_date >= exam.exam_date')
    expect(save).toContain('c.subject_id = exam.subject_id')
    expect(save).not.toContain('e.join_date <= exam.exam_date')
    expect(migration).toContain('function public.list_school_exam_historical_candidates')
  })

  it('binds quizzes to one class and validates the enrollment on the quiz date', () => {
    expect(migration).toContain('create table public.tuition_quizzes')
    expect(migration).toContain('class_id uuid not null')
    expect(migration).toContain('enrollment_id uuid not null')
    expect(migration).toContain('constraint tuition_quiz_scores_quiz_student_unique unique (quiz_id, student_id)')
    expect(migration).toContain('v_enrollment.join_date > v_quiz_date')
    expect(migration).toContain('v_enrollment.end_date < v_quiz_date')
  })

  it('enforces score bounds, preserves zero, and represents blank by deleting the row', () => {
    expect(migration).toMatch(/score numeric\(8, 2\) not null check \(score >= 0\)/)
    expect(migration).toContain('if new.score > v_max_score')
    expect(migration).toContain("jsonb_typeof(v_item->'score') = 'null'")
    expect(migration).toContain('delete from public.school_exam_scores')
    expect(migration).toContain('delete from public.tuition_quiz_scores')
  })

  it('uses read-only RLS tables and transactional RPC writes', () => {
    for (const table of ['school_exams', 'school_exam_scores', 'tuition_quizzes', 'tuition_quiz_scores']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`grant select on public.${table} to authenticated`)
      expect(migration).not.toContain(`grant insert on public.${table}`)
    }
    expect(migration).toContain('function public.save_school_exam_scores')
    expect(migration).toContain('function public.save_tuition_quiz_scores')
    expect(migration).toContain('function public.delete_school_exam')
    expect(migration).toContain('function public.delete_tuition_quiz')
  })
})
