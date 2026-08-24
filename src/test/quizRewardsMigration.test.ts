import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202608240010_quiz_top_three_rewards.sql'), 'utf8')

describe('quiz top-three rewards migration', () => {
  it('is additive and never backfills or alters existing scores', () => {
    const schemaOnly = migration.slice(0, migration.indexOf('create or replace function public.quiz_reward_top_three_candidates'))
    expect(migration).toMatch(/begin;[\s\S]*commit;/)
    expect(schemaOnly).not.toContain('insert into public.tuition_quiz_top_three_records')
    expect(migration).not.toMatch(/update public\.tuition_quiz_scores/i)
    expect(migration).not.toMatch(/\btruncate\b/i)
  })

  it('creates traceable ranking, confirmation, reward and three-source tables', () => {
    for (const table of [
      'tuition_quiz_ranking_confirmations',
      'tuition_quiz_top_three_records',
      'quiz_reward_claims',
      'quiz_reward_claim_items',
    ]) {
      expect(migration).toContain(`create table public.${table}`)
      expect(migration).toContain(`alter table public.${table} enable row level security`)
    }
    expect(migration).toContain('constraint tuition_quiz_top_three_records_quiz_student_unique unique (quiz_id, student_id)')
    expect(migration).toContain('quiz_reward_claim_items_active_ranking_unique')
    expect(migration).toContain('quiz_reward_claims_request_unique')
  })

  it('reuses the quiz-date roster and implements the tied third-place cutoff', () => {
    expect(migration).toContain('public.list_tuition_quiz_roster(p_quiz_id)')
    expect(migration).toContain('rank() over (order by score desc)')
    expect(migration).toContain('row_number() over (order by score desc, student_id)')
    expect(migration).toContain('where score >= coalesce((select score from cutoff), score)')
  })

  it('marks confirmed rankings stale after score changes and requires explicit reconfirmation', () => {
    expect(migration).toContain('tuition_quiz_scores_mark_rewards_stale')
    expect(migration).toContain('set needs_reconfirmation = true')
    expect(migration).toContain("raise exception 'Awarded reward history requires explicit confirmation'")
    expect(migration).toContain("'tuition_quiz_ranking_reconfirmed'")
  })

  it('awards exactly the oldest three atomically and supports traceable reversal', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('order by quiz.quiz_date, record.confirmed_at, record.id')
    expect(migration).toContain('limit 3')
    expect(migration).toContain("if v_count <> 3 then raise exception 'Three unredeemed ranking records are required'")
    expect(migration).toContain('set released_at = now()')
    expect(migration).toContain("'quiz_reward_awarded'")
    expect(migration).toContain("'quiz_reward_reversed'")
  })

  it('extends permanent deletion previews and removes reward dependencies before core rows', () => {
    expect(migration).toContain('rename to ui51_preview_permanent_delete_without_quiz_rewards')
    expect(migration).toContain("'quiz_top_three_records'")
    expect(migration).toContain("'quiz_reward_claims'")
    expect(migration).toContain('quiz_reward_cleanup_before_core_delete')
    expect(migration).toContain("tg_table_name = 'tuition_quizzes'")
    expect(migration).toContain("tg_table_name = 'students'")
    expect(migration).toContain("tg_table_name = 'classes'")
  })

  it('keeps helpers private and grants only owner-scoped public RPCs', () => {
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('v_owner_id uuid := auth.uid()')
    expect(migration).toContain('revoke all on function public.quiz_reward_top_three_candidates(uuid, uuid) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.mark_quiz_reward_awarded(uuid, uuid, uuid) to authenticated')
    expect(migration).not.toMatch(/\bexecute\s+format\b/i)
  })
})
