-- Quiz top-three reward tracking.
--
-- This migration is additive. It creates no ranking records for existing
-- quizzes and never changes existing scores. Historical quizzes only enter the
-- reward ledger after the owner explicitly confirms their leaderboard.

begin;

create table public.tuition_quiz_ranking_confirmations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  quiz_id uuid not null,
  class_id uuid not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  score_signature text not null,
  needs_reconfirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint tuition_quiz_ranking_confirmations_quiz_owner_fk
    foreign key (quiz_id, owner_id) references public.tuition_quizzes(id, owner_id) on delete restrict,
  constraint tuition_quiz_ranking_confirmations_class_owner_fk
    foreign key (class_id, owner_id) references public.classes(id, owner_id) on delete restrict,
  constraint tuition_quiz_ranking_confirmations_quiz_unique unique (quiz_id)
);

create table public.tuition_quiz_top_three_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  quiz_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  rank integer not null check (rank >= 1),
  score numeric(8, 2) not null check (score >= 0),
  is_active boolean not null default true,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint tuition_quiz_top_three_records_quiz_owner_fk
    foreign key (quiz_id, owner_id) references public.tuition_quizzes(id, owner_id) on delete restrict,
  constraint tuition_quiz_top_three_records_class_owner_fk
    foreign key (class_id, owner_id) references public.classes(id, owner_id) on delete restrict,
  constraint tuition_quiz_top_three_records_student_owner_fk
    foreign key (student_id, owner_id) references public.students(id, owner_id) on delete restrict,
  constraint tuition_quiz_top_three_records_enrollment_owner_student_fk
    foreign key (enrollment_id, owner_id, student_id)
    references public.enrollments(id, owner_id, student_id) on delete restrict,
  constraint tuition_quiz_top_three_records_quiz_student_unique unique (quiz_id, student_id)
);

create table public.quiz_reward_claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null,
  class_id uuid not null,
  client_request_id uuid not null,
  rewarded_at timestamptz not null default now(),
  rewarded_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'awarded' check (status in ('awarded', 'reversed')),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint quiz_reward_claims_student_owner_fk
    foreign key (student_id, owner_id) references public.students(id, owner_id) on delete restrict,
  constraint quiz_reward_claims_class_owner_fk
    foreign key (class_id, owner_id) references public.classes(id, owner_id) on delete restrict,
  constraint quiz_reward_claims_request_unique unique (owner_id, client_request_id),
  constraint quiz_reward_claims_reversal_check check (
    (status = 'awarded' and reversed_at is null and reversed_by is null)
    or (status = 'reversed' and reversed_at is not null and reversed_by is not null)
  )
);

create table public.quiz_reward_claim_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  claim_id uuid not null,
  ranking_record_id uuid not null,
  quiz_name_snapshot text not null,
  quiz_date_snapshot date not null,
  rank_snapshot integer not null check (rank_snapshot >= 1),
  score_snapshot numeric(8, 2) not null check (score_snapshot >= 0),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint quiz_reward_claim_items_claim_owner_fk
    foreign key (claim_id, owner_id) references public.quiz_reward_claims(id, owner_id) on delete cascade,
  constraint quiz_reward_claim_items_ranking_owner_fk
    foreign key (ranking_record_id, owner_id)
    references public.tuition_quiz_top_three_records(id, owner_id) on delete restrict,
  constraint quiz_reward_claim_items_claim_ranking_unique unique (claim_id, ranking_record_id)
);

create unique index quiz_reward_claim_items_active_ranking_unique
  on public.quiz_reward_claim_items (ranking_record_id)
  where released_at is null;
create index tuition_quiz_top_three_records_owner_student_class_idx
  on public.tuition_quiz_top_three_records (owner_id, student_id, class_id, confirmed_at, id)
  where is_active;
create index tuition_quiz_top_three_records_owner_quiz_idx
  on public.tuition_quiz_top_three_records (owner_id, quiz_id);
create index quiz_reward_claims_owner_class_status_idx
  on public.quiz_reward_claims (owner_id, class_id, status, rewarded_at desc);
create index quiz_reward_claims_owner_student_idx
  on public.quiz_reward_claims (owner_id, student_id, rewarded_at desc);
create index quiz_reward_claim_items_owner_claim_idx
  on public.quiz_reward_claim_items (owner_id, claim_id);

create trigger tuition_quiz_ranking_confirmations_set_updated_at
  before update on public.tuition_quiz_ranking_confirmations
  for each row execute procedure public.set_updated_at();
create trigger tuition_quiz_top_three_records_set_updated_at
  before update on public.tuition_quiz_top_three_records
  for each row execute procedure public.set_updated_at();
create trigger quiz_reward_claims_set_updated_at
  before update on public.quiz_reward_claims
  for each row execute procedure public.set_updated_at();

alter table public.tuition_quiz_ranking_confirmations enable row level security;
alter table public.tuition_quiz_top_three_records enable row level security;
alter table public.quiz_reward_claims enable row level security;
alter table public.quiz_reward_claim_items enable row level security;

create policy "Users can read their own quiz ranking confirmations"
  on public.tuition_quiz_ranking_confirmations for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Users can read their own quiz top three records"
  on public.tuition_quiz_top_three_records for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Users can read their own quiz reward claims"
  on public.quiz_reward_claims for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Users can read their own quiz reward claim items"
  on public.quiz_reward_claim_items for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.tuition_quiz_ranking_confirmations to authenticated;
grant select on public.tuition_quiz_top_three_records to authenticated;
grant select on public.quiz_reward_claims to authenticated;
grant select on public.quiz_reward_claim_items to authenticated;
revoke all on public.tuition_quiz_ranking_confirmations from anon;
revoke all on public.tuition_quiz_top_three_records from anon;
revoke all on public.quiz_reward_claims from anon;
revoke all on public.quiz_reward_claim_items from anon;

-- Reuses the existing quiz-date roster RPC. Scores without rows stay blank;
-- a numeric zero remains a valid score. rank() implements competition ranking.
create or replace function public.quiz_reward_top_three_candidates(
  p_owner_id uuid,
  p_quiz_id uuid
)
returns table (
  student_id uuid,
  student_name text,
  enrollment_id uuid,
  score numeric,
  rank integer
)
language sql
set search_path = ''
stable
as $$
  with quiz as (
    select id, max_score
    from public.tuition_quizzes
    where id = p_quiz_id and owner_id = p_owner_id
  ), scored as (
    select
      roster.student_id,
      roster.student_name,
      roster.enrollment_id,
      scores.score
    from quiz
    join public.list_tuition_quiz_roster(p_quiz_id) roster on true
    join public.tuition_quiz_scores scores
      on scores.owner_id = p_owner_id
      and scores.quiz_id = p_quiz_id
      and scores.student_id = roster.student_id
      and scores.enrollment_id = roster.enrollment_id
    where scores.score >= 0 and scores.score <= quiz.max_score
  ), ranked as (
    select
      scored.*,
      rank() over (order by score desc)::integer as competition_rank,
      row_number() over (order by score desc, student_id)::integer as score_position
    from scored
  ), cutoff as (
    select score from ranked where score_position = 3
  )
  select student_id, student_name, enrollment_id, score, competition_rank
  from ranked
  where score >= coalesce((select score from cutoff), score)
  order by score desc, student_name, student_id;
$$;

create or replace function public.preview_tuition_quiz_top_three(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_quiz public.tuition_quizzes;
  v_confirmation public.tuition_quiz_ranking_confirmations;
  v_roster_count integer;
  v_score_count integer;
  v_missing jsonb;
  v_candidates jsonb;
  v_recorded jsonb;
  v_added jsonb;
  v_removed jsonb;
  v_changed jsonb;
  v_awarded_impact integer;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  select * into v_quiz from public.tuition_quizzes
  where id = p_quiz_id and owner_id = v_owner_id;
  if not found then raise exception 'Tuition quiz not found'; end if;

  select * into v_confirmation from public.tuition_quiz_ranking_confirmations
  where owner_id = v_owner_id and quiz_id = p_quiz_id;
  select count(*)::integer into v_roster_count from public.list_tuition_quiz_roster(p_quiz_id);
  select count(*)::integer into v_score_count
  from public.tuition_quiz_scores scores
  join public.list_tuition_quiz_roster(p_quiz_id) roster
    on roster.student_id = scores.student_id and roster.enrollment_id = scores.enrollment_id
  where scores.owner_id = v_owner_id and scores.quiz_id = p_quiz_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', roster.student_id, 'student_name', roster.student_name
  ) order by roster.student_name, roster.student_id), '[]'::jsonb) into v_missing
  from public.list_tuition_quiz_roster(p_quiz_id) roster
  where not exists (
    select 1 from public.tuition_quiz_scores scores
    where scores.owner_id = v_owner_id and scores.quiz_id = p_quiz_id
      and scores.student_id = roster.student_id and scores.enrollment_id = roster.enrollment_id
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', candidate.student_id,
    'student_name', candidate.student_name,
    'enrollment_id', candidate.enrollment_id,
    'rank', candidate.rank,
    'score', candidate.score,
    'unredeemed_after', (
      select count(*)::integer
      from public.tuition_quiz_top_three_records record
      where record.owner_id = v_owner_id
        and record.student_id = candidate.student_id
        and record.class_id = v_quiz.class_id
        and record.is_active
        and record.quiz_id <> p_quiz_id
        and not exists (
          select 1 from public.quiz_reward_claim_items item
          where item.owner_id = v_owner_id and item.ranking_record_id = record.id and item.released_at is null
        )
    ) + case when exists (
      select 1 from public.tuition_quiz_top_three_records existing
      join public.quiz_reward_claim_items item
        on item.owner_id = existing.owner_id and item.ranking_record_id = existing.id and item.released_at is null
      where existing.owner_id = v_owner_id and existing.quiz_id = p_quiz_id
        and existing.student_id = candidate.student_id
    ) then 0 else 1 end
  ) order by candidate.score desc, candidate.student_name, candidate.student_id), '[]'::jsonb)
  into v_candidates
  from public.quiz_reward_top_three_candidates(v_owner_id, p_quiz_id) candidate;

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record.id,
    'student_id', record.student_id,
    'student_name', student.name,
    'rank', record.rank,
    'score', record.score,
    'is_active', record.is_active,
    'used_for_reward', exists (
      select 1 from public.quiz_reward_claim_items item
      where item.owner_id = v_owner_id and item.ranking_record_id = record.id and item.released_at is null
    )
  ) order by record.rank, student.name, record.id), '[]'::jsonb)
  into v_recorded
  from public.tuition_quiz_top_three_records record
  join public.students student on student.id = record.student_id and student.owner_id = record.owner_id
  where record.owner_id = v_owner_id and record.quiz_id = p_quiz_id and record.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', candidate.student_id, 'student_name', candidate.student_name,
    'rank', candidate.rank, 'score', candidate.score
  ) order by candidate.rank, candidate.student_name), '[]'::jsonb) into v_added
  from public.quiz_reward_top_three_candidates(v_owner_id, p_quiz_id) candidate
  where not exists (
    select 1 from public.tuition_quiz_top_three_records record
    where record.owner_id = v_owner_id and record.quiz_id = p_quiz_id
      and record.student_id = candidate.student_id and record.is_active
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', record.student_id, 'student_name', student.name,
    'rank', record.rank, 'score', record.score
  ) order by record.rank, student.name), '[]'::jsonb) into v_removed
  from public.tuition_quiz_top_three_records record
  join public.students student on student.id = record.student_id and student.owner_id = record.owner_id
  where record.owner_id = v_owner_id and record.quiz_id = p_quiz_id and record.is_active
    and not exists (
      select 1 from public.quiz_reward_top_three_candidates(v_owner_id, p_quiz_id) candidate
      where candidate.student_id = record.student_id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', candidate.student_id, 'student_name', candidate.student_name,
    'old_rank', record.rank, 'new_rank', candidate.rank,
    'old_score', record.score, 'new_score', candidate.score
  ) order by candidate.student_name), '[]'::jsonb) into v_changed
  from public.quiz_reward_top_three_candidates(v_owner_id, p_quiz_id) candidate
  join public.tuition_quiz_top_three_records record
    on record.owner_id = v_owner_id and record.quiz_id = p_quiz_id
    and record.student_id = candidate.student_id and record.is_active
  where record.rank is distinct from candidate.rank or record.score is distinct from candidate.score;

  select count(distinct claim.id)::integer into v_awarded_impact
  from public.quiz_reward_claims claim
  join public.quiz_reward_claim_items item
    on item.owner_id = claim.owner_id and item.claim_id = claim.id and item.released_at is null
  join public.tuition_quiz_top_three_records record
    on record.owner_id = item.owner_id and record.id = item.ranking_record_id
  where claim.owner_id = v_owner_id and claim.status = 'awarded' and record.quiz_id = p_quiz_id;

  return jsonb_build_object(
    'quiz_id', v_quiz.id,
    'class_id', v_quiz.class_id,
    'confirmed', v_confirmation.id is not null,
    'confirmed_at', v_confirmation.confirmed_at,
    'needs_reconfirmation', coalesce(v_confirmation.needs_reconfirmation, false),
    'roster_count', v_roster_count,
    'score_count', v_score_count,
    'missing_students', v_missing,
    'candidates', v_candidates,
    'recorded', v_recorded,
    'differences', jsonb_build_object('added', v_added, 'removed', v_removed, 'changed', v_changed),
    'awarded_history_impact', coalesce(v_awarded_impact, 0)
  );
end;
$$;

create or replace function public.confirm_tuition_quiz_top_three(
  p_quiz_id uuid,
  p_allow_incomplete boolean default false,
  p_allow_awarded_history_impact boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_quiz public.tuition_quizzes;
  v_existing public.tuition_quiz_ranking_confirmations;
  v_preview jsonb;
  v_candidate record;
  v_signature text;
  v_is_reconfirmation boolean;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  select * into v_quiz from public.tuition_quizzes
  where id = p_quiz_id and owner_id = v_owner_id for update;
  if not found then raise exception 'Tuition quiz not found'; end if;
  select * into v_existing from public.tuition_quiz_ranking_confirmations
  where owner_id = v_owner_id and quiz_id = p_quiz_id for update;
  v_is_reconfirmation := v_existing.id is not null;
  v_preview := public.preview_tuition_quiz_top_three(p_quiz_id);
  if jsonb_array_length(v_preview->'missing_students') > 0 and not coalesce(p_allow_incomplete, false) then
    raise exception 'Incomplete scores require explicit confirmation';
  end if;
  if (v_preview->>'awarded_history_impact')::integer > 0
    and v_is_reconfirmation
    and not coalesce(p_allow_awarded_history_impact, false) then
    raise exception 'Awarded reward history requires explicit confirmation';
  end if;

  update public.tuition_quiz_top_three_records record
  set is_active = false, confirmed_at = now(), confirmed_by = v_owner_id
  where record.owner_id = v_owner_id and record.quiz_id = p_quiz_id and record.is_active
    and not exists (
      select 1 from public.quiz_reward_top_three_candidates(v_owner_id, p_quiz_id) candidate
      where candidate.student_id = record.student_id
    );

  for v_candidate in select * from public.quiz_reward_top_three_candidates(v_owner_id, p_quiz_id)
  loop
    insert into public.tuition_quiz_top_three_records (
      owner_id, quiz_id, class_id, student_id, enrollment_id,
      rank, score, is_active, confirmed_at, confirmed_by
    ) values (
      v_owner_id, p_quiz_id, v_quiz.class_id, v_candidate.student_id, v_candidate.enrollment_id,
      v_candidate.rank, v_candidate.score, true, now(), v_owner_id
    )
    on conflict (quiz_id, student_id) do update set
      enrollment_id = excluded.enrollment_id,
      class_id = excluded.class_id,
      rank = excluded.rank,
      score = excluded.score,
      is_active = true,
      confirmed_at = excluded.confirmed_at,
      confirmed_by = excluded.confirmed_by;
  end loop;

  select md5(coalesce(string_agg(
    scores.student_id::text || ':' || scores.enrollment_id::text || ':' || scores.score::text,
    ',' order by scores.student_id
  ), '')) into v_signature
  from public.tuition_quiz_scores scores
  where scores.owner_id = v_owner_id and scores.quiz_id = p_quiz_id;

  insert into public.tuition_quiz_ranking_confirmations (
    owner_id, quiz_id, class_id, confirmed_at, confirmed_by, score_signature, needs_reconfirmation
  ) values (
    v_owner_id, p_quiz_id, v_quiz.class_id, now(), v_owner_id, v_signature, false
  )
  on conflict (quiz_id) do update set
    class_id = excluded.class_id,
    confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by,
    score_signature = excluded.score_signature,
    needs_reconfirmation = false;

  perform public.phase5_write_activity(
    v_owner_id,
    case when v_is_reconfirmation then 'tuition_quiz_ranking_reconfirmed' else 'tuition_quiz_ranking_confirmed' end,
    'tuition_quiz',
    p_quiz_id,
    case when v_is_reconfirmation then U&'\8865\4E60\73ED\5C0F\6D4B\524D\4E09\540D \2192 \91CD\65B0\786E\8BA4'
      else U&'\8865\4E60\73ED\5C0F\6D4B\524D\4E09\540D \2192 \786E\8BA4' end
  );
  return public.preview_tuition_quiz_top_three(p_quiz_id);
end;
$$;

create or replace function public.mark_tuition_quiz_rewards_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_id uuid := coalesce(new.quiz_id, old.quiz_id);
  v_owner_id uuid := coalesce(new.owner_id, old.owner_id);
begin
  update public.tuition_quiz_ranking_confirmations
  set needs_reconfirmation = true
  where owner_id = v_owner_id and quiz_id = v_quiz_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger tuition_quiz_scores_mark_rewards_stale
  after insert or update or delete on public.tuition_quiz_scores
  for each row execute procedure public.mark_tuition_quiz_rewards_stale();

create or replace function public.quiz_reward_overview_json(
  p_owner_id uuid,
  p_class_id uuid default null,
  p_student_id uuid default null
)
returns jsonb
language sql
set search_path = ''
stable
as $$
  with unredeemed as (
    select
      record.id,
      record.student_id,
      student.name as student_name,
      record.class_id,
      tuition_class.name as class_name,
      record.rank,
      record.score,
      quiz.id as quiz_id,
      quiz.name as quiz_name,
      quiz.quiz_date,
      record.confirmed_at
    from public.tuition_quiz_top_three_records record
    join public.students student on student.id = record.student_id and student.owner_id = record.owner_id
    join public.classes tuition_class on tuition_class.id = record.class_id and tuition_class.owner_id = record.owner_id
    join public.tuition_quizzes quiz on quiz.id = record.quiz_id and quiz.owner_id = record.owner_id
    where record.owner_id = p_owner_id and record.is_active
      and (p_class_id is null or record.class_id = p_class_id)
      and (p_student_id is null or record.student_id = p_student_id)
      and not exists (
        select 1 from public.quiz_reward_claim_items item
        where item.owner_id = p_owner_id and item.ranking_record_id = record.id and item.released_at is null
      )
  ), grouped as (
    select
      student_id,
      student_name,
      class_id,
      class_name,
      count(*)::integer as unredeemed_count,
      jsonb_agg(jsonb_build_object(
        'record_id', id,
        'quiz_id', quiz_id,
        'quiz_name', quiz_name,
        'quiz_date', quiz_date,
        'rank', rank,
        'score', score,
        'confirmed_at', confirmed_at
      ) order by quiz_date, confirmed_at, id) as records
    from unredeemed
    group by student_id, student_name, class_id, class_name
  ), claim_rows as (
    select
      claim.id,
      claim.student_id,
      student.name as student_name,
      claim.class_id,
      tuition_class.name as class_name,
      claim.rewarded_at,
      claim.status,
      claim.reversed_at,
      coalesce(jsonb_agg(jsonb_build_object(
        'item_id', item.id,
        'record_id', item.ranking_record_id,
        'quiz_name', item.quiz_name_snapshot,
        'quiz_date', item.quiz_date_snapshot,
        'rank', item.rank_snapshot,
        'score', item.score_snapshot
      ) order by item.quiz_date_snapshot, item.created_at, item.id)
        filter (where item.id is not null), '[]'::jsonb) as records
    from public.quiz_reward_claims claim
    join public.students student on student.id = claim.student_id and student.owner_id = claim.owner_id
    join public.classes tuition_class on tuition_class.id = claim.class_id and tuition_class.owner_id = claim.owner_id
    left join public.quiz_reward_claim_items item on item.claim_id = claim.id and item.owner_id = claim.owner_id
    where claim.owner_id = p_owner_id
      and (p_class_id is null or claim.class_id = p_class_id)
      and (p_student_id is null or claim.student_id = p_student_id)
    group by claim.id, claim.student_id, student.name, claim.class_id, tuition_class.name,
      claim.rewarded_at, claim.status, claim.reversed_at
  )
  select jsonb_build_object(
    'pending_count', coalesce((select sum(unredeemed_count / 3)::integer from grouped), 0),
    'pending', coalesce((select jsonb_agg(jsonb_build_object(
      'student_id', student_id,
      'student_name', student_name,
      'class_id', class_id,
      'class_name', class_name,
      'unredeemed_count', unredeemed_count,
      'reward_count', unredeemed_count / 3,
      'records', records
    ) order by class_name, student_name, student_id) from grouped where unredeemed_count >= 3), '[]'::jsonb),
    'progress', coalesce((select jsonb_agg(jsonb_build_object(
      'student_id', student_id,
      'student_name', student_name,
      'class_id', class_id,
      'class_name', class_name,
      'unredeemed_count', unredeemed_count,
      'records', records
    ) order by class_name, student_name, student_id) from grouped where unredeemed_count between 1 and 2), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'claim_id', id,
      'student_id', student_id,
      'student_name', student_name,
      'class_id', class_id,
      'class_name', class_name,
      'rewarded_at', rewarded_at,
      'status', status,
      'reversed_at', reversed_at,
      'records', records
    ) order by rewarded_at desc, id desc) from claim_rows), '[]'::jsonb)
  );
$$;

create or replace function public.list_quiz_reward_overview(p_class_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if p_class_id is not null and not exists (
    select 1 from public.classes where id = p_class_id and owner_id = v_owner_id
  ) then raise exception 'Class not found'; end if;
  return public.quiz_reward_overview_json(v_owner_id, p_class_id, null);
end;
$$;

create or replace function public.get_student_quiz_reward_summary(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.students where id = p_student_id and owner_id = v_owner_id) then
    raise exception 'Student not found';
  end if;
  return public.quiz_reward_overview_json(v_owner_id, null, p_student_id);
end;
$$;

create or replace function public.count_pending_quiz_rewards()
returns integer
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  v_result := public.quiz_reward_overview_json(v_owner_id, null, null);
  return coalesce((v_result->>'pending_count')::integer, 0);
end;
$$;

create or replace function public.mark_quiz_reward_awarded(
  p_student_id uuid,
  p_class_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_claim public.quiz_reward_claims;
  v_record record;
  v_count integer := 0;
  v_remaining integer;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if p_client_request_id is null then raise exception 'Client request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text || ':' || p_student_id::text || ':' || p_class_id::text, 0));

  select * into v_claim from public.quiz_reward_claims
  where owner_id = v_owner_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('claim_id', v_claim.id, 'remaining_count', (
      select count(*) from public.tuition_quiz_top_three_records record
      where record.owner_id = v_owner_id and record.student_id = p_student_id
        and record.class_id = p_class_id and record.is_active
        and not exists (select 1 from public.quiz_reward_claim_items item
          where item.owner_id = v_owner_id and item.ranking_record_id = record.id and item.released_at is null)
    ), 'idempotent', true);
  end if;

  if not exists (select 1 from public.students where id = p_student_id and owner_id = v_owner_id) then
    raise exception 'Student not found';
  end if;
  if not exists (select 1 from public.classes where id = p_class_id and owner_id = v_owner_id) then
    raise exception 'Class not found';
  end if;

  insert into public.quiz_reward_claims (
    owner_id, student_id, class_id, client_request_id, rewarded_by
  ) values (
    v_owner_id, p_student_id, p_class_id, p_client_request_id, v_owner_id
  ) returning * into v_claim;

  for v_record in
    select record.*, quiz.name as quiz_name, quiz.quiz_date
    from public.tuition_quiz_top_three_records record
    join public.tuition_quizzes quiz on quiz.id = record.quiz_id and quiz.owner_id = record.owner_id
    where record.owner_id = v_owner_id and record.student_id = p_student_id
      and record.class_id = p_class_id and record.is_active
      and not exists (
        select 1 from public.quiz_reward_claim_items item
        where item.owner_id = v_owner_id and item.ranking_record_id = record.id and item.released_at is null
      )
    order by quiz.quiz_date, record.confirmed_at, record.id
    limit 3
    for update of record
  loop
    insert into public.quiz_reward_claim_items (
      owner_id, claim_id, ranking_record_id, quiz_name_snapshot,
      quiz_date_snapshot, rank_snapshot, score_snapshot
    ) values (
      v_owner_id, v_claim.id, v_record.id, v_record.quiz_name,
      v_record.quiz_date, v_record.rank, v_record.score
    );
    v_count := v_count + 1;
  end loop;

  if v_count <> 3 then raise exception 'Three unredeemed ranking records are required'; end if;
  select count(*)::integer into v_remaining
  from public.tuition_quiz_top_three_records record
  where record.owner_id = v_owner_id and record.student_id = p_student_id
    and record.class_id = p_class_id and record.is_active
    and not exists (
      select 1 from public.quiz_reward_claim_items item
      where item.owner_id = v_owner_id and item.ranking_record_id = record.id and item.released_at is null
    );
  perform public.phase5_write_activity(
    v_owner_id, 'quiz_reward_awarded', 'quiz_reward_claim', v_claim.id,
    U&'\8865\4E60\73ED\524D\4E09\540D\5956\52B1 \2192 \5DF2\53D1\653E\FF083\7B14\8BB0\5F55\FF09'
  );
  return jsonb_build_object('claim_id', v_claim.id, 'remaining_count', v_remaining, 'idempotent', false);
end;
$$;

create or replace function public.reverse_quiz_reward(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_claim public.quiz_reward_claims;
  v_released integer;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  select * into v_claim from public.quiz_reward_claims
  where id = p_claim_id and owner_id = v_owner_id for update;
  if not found then raise exception 'Reward claim not found'; end if;
  if v_claim.status = 'reversed' then
    return jsonb_build_object('claim_id', v_claim.id, 'released_count', 0, 'idempotent', true);
  end if;
  update public.quiz_reward_claim_items
  set released_at = now()
  where owner_id = v_owner_id and claim_id = p_claim_id and released_at is null;
  get diagnostics v_released = row_count;
  if v_released <> 3 then raise exception 'Reward claim must release exactly three records'; end if;
  update public.quiz_reward_claims
  set status = 'reversed', reversed_at = now(), reversed_by = v_owner_id
  where id = p_claim_id and owner_id = v_owner_id;
  perform public.phase5_write_activity(
    v_owner_id, 'quiz_reward_reversed', 'quiz_reward_claim', p_claim_id,
    U&'\8865\4E60\73ED\524D\4E09\540D\5956\52B1 \2192 \64A4\9500\5DF2\53D1\5956\52B1'
  );
  return jsonb_build_object('claim_id', v_claim.id, 'released_count', v_released, 'idempotent', false);
end;
$$;

-- Keep UI 5.1 permanent deletion atomic. Core rows retain restrictive FKs;
-- these owner-scoped before-delete triggers remove reward history first.
create or replace function public.quiz_reward_cleanup_before_core_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_ids uuid[];
begin
  if tg_table_name = 'tuition_quizzes' then
    select coalesce(array_agg(distinct item.claim_id), array[]::uuid[]) into v_claim_ids
    from public.quiz_reward_claim_items item
    join public.tuition_quiz_top_three_records record
      on record.id = item.ranking_record_id and record.owner_id = item.owner_id
    where item.owner_id = old.owner_id and record.quiz_id = old.id;
    delete from public.activity_logs where owner_id = old.owner_id and entity_id = any(v_claim_ids);
    delete from public.quiz_reward_claims claim
    where claim.owner_id = old.owner_id and claim.id = any(v_claim_ids);
    delete from public.tuition_quiz_top_three_records where owner_id = old.owner_id and quiz_id = old.id;
    delete from public.tuition_quiz_ranking_confirmations where owner_id = old.owner_id and quiz_id = old.id;
  elsif tg_table_name = 'students' then
    select coalesce(array_agg(id), array[]::uuid[]) into v_claim_ids
    from public.quiz_reward_claims where owner_id = old.owner_id and student_id = old.id;
    delete from public.activity_logs where owner_id = old.owner_id and entity_id = any(v_claim_ids);
    delete from public.quiz_reward_claims where owner_id = old.owner_id and student_id = old.id;
    delete from public.tuition_quiz_top_three_records where owner_id = old.owner_id and student_id = old.id;
  elsif tg_table_name = 'classes' then
    select coalesce(array_agg(id), array[]::uuid[]) into v_claim_ids
    from public.quiz_reward_claims where owner_id = old.owner_id and class_id = old.id;
    delete from public.activity_logs where owner_id = old.owner_id and entity_id = any(v_claim_ids);
    delete from public.quiz_reward_claims where owner_id = old.owner_id and class_id = old.id;
    delete from public.tuition_quiz_top_three_records where owner_id = old.owner_id and class_id = old.id;
    delete from public.tuition_quiz_ranking_confirmations where owner_id = old.owner_id and class_id = old.id;
  end if;
  return old;
end;
$$;

create trigger tuition_quizzes_cleanup_rewards_before_delete
  before delete on public.tuition_quizzes
  for each row execute procedure public.quiz_reward_cleanup_before_core_delete();
create trigger students_cleanup_rewards_before_delete
  before delete on public.students
  for each row execute procedure public.quiz_reward_cleanup_before_core_delete();
create trigger classes_cleanup_rewards_before_delete
  before delete on public.classes
  for each row execute procedure public.quiz_reward_cleanup_before_core_delete();

-- Extend the existing preview without copying or weakening its whitelist.
alter function public.ui51_preview_permanent_delete(text, uuid)
  rename to ui51_preview_permanent_delete_without_quiz_rewards;
revoke all on function public.ui51_preview_permanent_delete_without_quiz_rewards(text, uuid)
  from public, anon, authenticated;

create or replace function public.ui51_preview_permanent_delete(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_base jsonb;
  v_counts jsonb;
  v_rankings integer := 0;
  v_claims integer := 0;
  v_items integer := 0;
  v_confirmations integer := 0;
  v_reward_logs integer := 0;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  v_base := public.ui51_preview_permanent_delete_without_quiz_rewards(p_entity_type, p_entity_id);
  v_counts := coalesce(v_base->'counts', '{}'::jsonb);
  case p_entity_type
    when 'student' then
      select count(*) into v_rankings from public.tuition_quiz_top_three_records where owner_id = v_owner_id and student_id = p_entity_id;
      select count(*) into v_claims from public.quiz_reward_claims where owner_id = v_owner_id and student_id = p_entity_id;
      select count(*) into v_items from public.quiz_reward_claim_items item join public.quiz_reward_claims claim on claim.id = item.claim_id and claim.owner_id = item.owner_id where item.owner_id = v_owner_id and claim.student_id = p_entity_id;
      select count(*) into v_reward_logs from public.activity_logs log where log.owner_id = v_owner_id and log.entity_id in (select id from public.quiz_reward_claims where owner_id = v_owner_id and student_id = p_entity_id);
    when 'class' then
      select count(*) into v_rankings from public.tuition_quiz_top_three_records where owner_id = v_owner_id and class_id = p_entity_id;
      select count(*) into v_claims from public.quiz_reward_claims where owner_id = v_owner_id and class_id = p_entity_id;
      select count(*) into v_items from public.quiz_reward_claim_items item join public.quiz_reward_claims claim on claim.id = item.claim_id and claim.owner_id = item.owner_id where item.owner_id = v_owner_id and claim.class_id = p_entity_id;
      select count(*) into v_confirmations from public.tuition_quiz_ranking_confirmations where owner_id = v_owner_id and class_id = p_entity_id;
      select count(*) into v_reward_logs from public.activity_logs log where log.owner_id = v_owner_id and log.entity_id in (select id from public.quiz_reward_claims where owner_id = v_owner_id and class_id = p_entity_id);
    when 'subject' then
      select count(*) into v_rankings from public.tuition_quiz_top_three_records record join public.classes tuition_class on tuition_class.id = record.class_id and tuition_class.owner_id = record.owner_id where record.owner_id = v_owner_id and tuition_class.subject_id = p_entity_id;
      select count(*) into v_claims from public.quiz_reward_claims claim join public.classes tuition_class on tuition_class.id = claim.class_id and tuition_class.owner_id = claim.owner_id where claim.owner_id = v_owner_id and tuition_class.subject_id = p_entity_id;
      select count(*) into v_items from public.quiz_reward_claim_items item join public.quiz_reward_claims claim on claim.id = item.claim_id and claim.owner_id = item.owner_id join public.classes tuition_class on tuition_class.id = claim.class_id and tuition_class.owner_id = claim.owner_id where item.owner_id = v_owner_id and tuition_class.subject_id = p_entity_id;
      select count(*) into v_confirmations from public.tuition_quiz_ranking_confirmations confirmation join public.classes tuition_class on tuition_class.id = confirmation.class_id and tuition_class.owner_id = confirmation.owner_id where confirmation.owner_id = v_owner_id and tuition_class.subject_id = p_entity_id;
      select count(*) into v_reward_logs from public.activity_logs log where log.owner_id = v_owner_id and log.entity_id in (select claim.id from public.quiz_reward_claims claim join public.classes tuition_class on tuition_class.id = claim.class_id and tuition_class.owner_id = claim.owner_id where claim.owner_id = v_owner_id and tuition_class.subject_id = p_entity_id);
    when 'tuition_quiz' then
      select count(*) into v_rankings from public.tuition_quiz_top_three_records where owner_id = v_owner_id and quiz_id = p_entity_id;
      select count(distinct claim.id) into v_claims from public.quiz_reward_claims claim join public.quiz_reward_claim_items item on item.claim_id = claim.id and item.owner_id = claim.owner_id join public.tuition_quiz_top_three_records record on record.id = item.ranking_record_id and record.owner_id = item.owner_id where claim.owner_id = v_owner_id and record.quiz_id = p_entity_id;
      select count(*) into v_items from public.quiz_reward_claim_items item where item.owner_id = v_owner_id and item.claim_id in (select distinct related_item.claim_id from public.quiz_reward_claim_items related_item join public.tuition_quiz_top_three_records record on record.id = related_item.ranking_record_id and record.owner_id = related_item.owner_id where related_item.owner_id = v_owner_id and record.quiz_id = p_entity_id);
      select count(*) into v_confirmations from public.tuition_quiz_ranking_confirmations where owner_id = v_owner_id and quiz_id = p_entity_id;
      select count(*) into v_reward_logs from public.activity_logs log where log.owner_id = v_owner_id and log.entity_id in (select distinct claim.id from public.quiz_reward_claims claim join public.quiz_reward_claim_items item on item.claim_id = claim.id and item.owner_id = claim.owner_id join public.tuition_quiz_top_three_records record on record.id = item.ranking_record_id and record.owner_id = item.owner_id where claim.owner_id = v_owner_id and record.quiz_id = p_entity_id);
    else
      null;
  end case;
  v_counts := v_counts || jsonb_build_object(
    'quiz_ranking_confirmations', v_confirmations,
    'quiz_top_three_records', v_rankings,
    'quiz_reward_claims', v_claims,
    'quiz_reward_claim_items', v_items
  );
  v_counts := jsonb_set(v_counts, '{activity_logs}', to_jsonb(coalesce((v_counts->>'activity_logs')::integer, 0) + v_reward_logs), true);
  return jsonb_set(v_base, '{counts}', v_counts, true);
end;
$$;

revoke all on function public.quiz_reward_top_three_candidates(uuid, uuid) from public, anon, authenticated;
revoke all on function public.quiz_reward_overview_json(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_tuition_quiz_rewards_stale() from public, anon, authenticated;
revoke all on function public.quiz_reward_cleanup_before_core_delete() from public, anon, authenticated;
revoke all on function public.preview_tuition_quiz_top_three(uuid) from public, anon;
revoke all on function public.confirm_tuition_quiz_top_three(uuid, boolean, boolean) from public, anon;
revoke all on function public.list_quiz_reward_overview(uuid) from public, anon;
revoke all on function public.get_student_quiz_reward_summary(uuid) from public, anon;
revoke all on function public.count_pending_quiz_rewards() from public, anon;
revoke all on function public.mark_quiz_reward_awarded(uuid, uuid, uuid) from public, anon;
revoke all on function public.reverse_quiz_reward(uuid) from public, anon;
revoke all on function public.ui51_preview_permanent_delete(text, uuid) from public, anon;
grant execute on function public.preview_tuition_quiz_top_three(uuid) to authenticated;
grant execute on function public.confirm_tuition_quiz_top_three(uuid, boolean, boolean) to authenticated;
grant execute on function public.list_quiz_reward_overview(uuid) to authenticated;
grant execute on function public.get_student_quiz_reward_summary(uuid) to authenticated;
grant execute on function public.count_pending_quiz_rewards() to authenticated;
grant execute on function public.mark_quiz_reward_awarded(uuid, uuid, uuid) to authenticated;
grant execute on function public.reverse_quiz_reward(uuid) to authenticated;
grant execute on function public.ui51_preview_permanent_delete(text, uuid) to authenticated;

commit;
