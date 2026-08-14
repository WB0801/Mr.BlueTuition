-- Phase 6: school exams and regular-class tuition quizzes.
--
-- School exams belong to a subject. Tuition quizzes belong to one regular
-- class. Blank scores have no row; zero is stored as a valid numeric score.

create table public.school_exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid not null,
  year integer not null check (year between 2000 and 2200),
  exam_date date not null,
  name text not null check (btrim(name) <> ''),
  max_score numeric(8, 2) not null check (max_score > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint school_exams_subject_owner_fk
    foreign key (subject_id, owner_id)
    references public.subjects(id, owner_id)
    on delete restrict,
  constraint school_exams_year_date_check
    check (year = extract(year from exam_date)::integer)
);

create unique index school_exams_owner_subject_year_name_unique
  on public.school_exams (owner_id, subject_id, year, lower(btrim(name)));

create index school_exams_owner_year_subject_idx
  on public.school_exams (owner_id, year desc, subject_id, exam_date desc);

create table public.school_exam_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  exam_id uuid not null,
  student_id uuid not null,
  score numeric(8, 2) not null check (score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint school_exam_scores_exam_owner_fk
    foreign key (exam_id, owner_id)
    references public.school_exams(id, owner_id)
    on delete cascade,
  constraint school_exam_scores_student_owner_fk
    foreign key (student_id, owner_id)
    references public.students(id, owner_id)
    on delete restrict,
  constraint school_exam_scores_exam_student_unique unique (exam_id, student_id)
);

create index school_exam_scores_owner_student_idx
  on public.school_exam_scores (owner_id, student_id);

create table public.tuition_quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  class_id uuid not null,
  name text not null check (btrim(name) <> ''),
  quiz_date date not null,
  max_score numeric(8, 2) not null check (max_score > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint tuition_quizzes_class_owner_fk
    foreign key (class_id, owner_id)
    references public.classes(id, owner_id)
    on delete restrict
);

create unique index tuition_quizzes_owner_class_date_name_unique
  on public.tuition_quizzes (owner_id, class_id, quiz_date, lower(btrim(name)));

create index tuition_quizzes_owner_class_date_idx
  on public.tuition_quizzes (owner_id, class_id, quiz_date desc);

create table public.tuition_quiz_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  quiz_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  score numeric(8, 2) not null check (score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint tuition_quiz_scores_quiz_owner_fk
    foreign key (quiz_id, owner_id)
    references public.tuition_quizzes(id, owner_id)
    on delete cascade,
  constraint tuition_quiz_scores_enrollment_owner_student_fk
    foreign key (enrollment_id, owner_id, student_id)
    references public.enrollments(id, owner_id, student_id)
    on delete restrict,
  constraint tuition_quiz_scores_quiz_student_unique unique (quiz_id, student_id)
);

create index tuition_quiz_scores_owner_student_idx
  on public.tuition_quiz_scores (owner_id, student_id);

create trigger school_exams_set_updated_at
  before update on public.school_exams
  for each row execute procedure public.set_updated_at();

create trigger school_exam_scores_set_updated_at
  before update on public.school_exam_scores
  for each row execute procedure public.set_updated_at();

create trigger tuition_quizzes_set_updated_at
  before update on public.tuition_quizzes
  for each row execute procedure public.set_updated_at();

create trigger tuition_quiz_scores_set_updated_at
  before update on public.tuition_quiz_scores
  for each row execute procedure public.set_updated_at();

create or replace function public.phase6_validate_school_exam_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
  v_max_score numeric;
begin
  select subject_id, max_score into v_subject_id, v_max_score
  from public.school_exams
  where id = new.exam_id and owner_id = new.owner_id;

  if not found then raise exception 'School exam not found'; end if;
  if new.score > v_max_score then raise exception 'Score exceeds maximum score'; end if;

  if not exists (
    select 1
    from public.enrollments e
    join public.classes c
      on c.id = e.class_id and c.owner_id = e.owner_id
    where e.owner_id = new.owner_id
      and e.student_id = new.student_id
      and c.subject_id = v_subject_id
  ) then
    raise exception 'Student has no enrollment history for this subject';
  end if;

  return new;
end;
$$;

create trigger school_exam_scores_validate
  before insert or update on public.school_exam_scores
  for each row execute procedure public.phase6_validate_school_exam_score();

create or replace function public.phase6_validate_tuition_quiz_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_quiz_date date;
  v_max_score numeric;
  v_enrollment public.enrollments;
begin
  select class_id, quiz_date, max_score into v_class_id, v_quiz_date, v_max_score
  from public.tuition_quizzes
  where id = new.quiz_id and owner_id = new.owner_id;

  if not found then raise exception 'Tuition quiz not found'; end if;
  if new.score > v_max_score then raise exception 'Score exceeds maximum score'; end if;

  select * into v_enrollment
  from public.enrollments
  where id = new.enrollment_id
    and owner_id = new.owner_id
    and student_id = new.student_id;

  if not found
    or v_enrollment.class_id <> v_class_id
    or v_enrollment.join_date > v_quiz_date
    or (v_enrollment.end_date is not null and v_enrollment.end_date < v_quiz_date) then
    raise exception 'Student enrollment is not valid for this quiz date';
  end if;

  return new;
end;
$$;

create trigger tuition_quiz_scores_validate
  before insert or update on public.tuition_quiz_scores
  for each row execute procedure public.phase6_validate_tuition_quiz_score();

alter table public.school_exams enable row level security;
alter table public.school_exam_scores enable row level security;
alter table public.tuition_quizzes enable row level security;
alter table public.tuition_quiz_scores enable row level security;

create policy "Users can read their own school exams"
  on public.school_exams for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own school exam scores"
  on public.school_exam_scores for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own tuition quizzes"
  on public.tuition_quizzes for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own tuition quiz scores"
  on public.tuition_quiz_scores for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.school_exams to authenticated;
grant select on public.school_exam_scores to authenticated;
grant select on public.tuition_quizzes to authenticated;
grant select on public.tuition_quiz_scores to authenticated;

revoke all on public.school_exams from anon;
revoke all on public.school_exam_scores from anon;
revoke all on public.tuition_quizzes from anon;
revoke all on public.tuition_quiz_scores from anon;

create or replace function public.create_school_exam(
  p_subject_id uuid,
  p_year integer,
  p_exam_date date,
  p_name text,
  p_max_score numeric
)
returns public.school_exams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_exam public.school_exams;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Exam name is required'; end if;
  if p_year is null or p_year < 2000 or p_year > 2200 then raise exception 'Invalid exam year'; end if;
  if p_exam_date is null or extract(year from p_exam_date)::integer <> p_year then
    raise exception 'Exam year must match exam date';
  end if;
  if p_max_score is null or p_max_score <= 0 then raise exception 'Invalid maximum score'; end if;
  if not exists (
    select 1 from public.subjects where id = p_subject_id and owner_id = v_owner_id
  ) then raise exception 'Subject not found'; end if;

  insert into public.school_exams (owner_id, subject_id, year, exam_date, name, max_score)
  values (v_owner_id, p_subject_id, p_year, p_exam_date, btrim(p_name), p_max_score)
  returning * into v_exam;

  perform public.phase5_write_activity(
    v_owner_id, 'school_exam_created', 'school_exam', v_exam.id,
    p_year || ' ' || v_exam.name || U&' \5B66\6821\8003\8BD5 \2192 \65B0\589E'
  );
  return v_exam;
end;
$$;

create or replace function public.list_school_exam_roster(
  p_exam_id uuid,
  p_class_id uuid default null
)
returns table (
  student_id uuid,
  student_name text,
  school_class text,
  phone text,
  class_id uuid,
  class_name text,
  enrollment_id uuid
)
language sql
security definer
set search_path = ''
stable
as $$
  with exam as (
    select subject_id, exam_date
    from public.school_exams
    where id = p_exam_id and owner_id = auth.uid()
  ), ranked as (
    select
      s.id as student_id,
      s.name as student_name,
      s.school_class,
      s.phone,
      c.id as class_id,
      c.name as class_name,
      e.id as enrollment_id,
      row_number() over (
        partition by s.id
        order by e.join_date desc, e.created_at desc, e.id desc
      ) as position
    from exam
    join public.classes c
      on c.owner_id = auth.uid() and c.subject_id = exam.subject_id
    join public.enrollments e
      on e.owner_id = c.owner_id
      and e.class_id = c.id
      and e.join_date <= exam.exam_date
      and (e.end_date is null or e.end_date >= exam.exam_date)
    join public.students s
      on s.owner_id = e.owner_id and s.id = e.student_id
  )
  select student_id, student_name, school_class, phone, class_id, class_name, enrollment_id
  from ranked
  where position = 1 and (p_class_id is null or class_id = p_class_id)
  order by student_name, student_id;
$$;

create or replace function public.list_school_exam_historical_candidates(
  p_exam_id uuid,
  p_query text
)
returns table (
  student_id uuid,
  student_name text,
  school_class text,
  phone text
)
language sql
security definer
set search_path = ''
stable
as $$
  with exam as (
    select subject_id, exam_date
    from public.school_exams
    where id = p_exam_id and owner_id = auth.uid()
  ), subject_students as (
    select distinct s.id, s.name, s.school_class, s.phone
    from exam
    join public.classes c
      on c.owner_id = auth.uid() and c.subject_id = exam.subject_id
    join public.enrollments e
      on e.owner_id = c.owner_id and e.class_id = c.id
    join public.students s
      on s.owner_id = e.owner_id and s.id = e.student_id
  )
  select s.id, s.name, s.school_class, s.phone
  from subject_students s
  where (
      btrim(coalesce(p_query, '')) = ''
      or s.name ilike '%' || btrim(p_query) || '%'
    )
    and not exists (
      select 1
      from exam
      join public.classes c
        on c.owner_id = auth.uid() and c.subject_id = exam.subject_id
      join public.enrollments e
        on e.owner_id = c.owner_id
        and e.class_id = c.id
        and e.student_id = s.id
        and e.join_date <= exam.exam_date
        and (e.end_date is null or e.end_date >= exam.exam_date)
    )
  order by s.name, s.id
  limit case
    when btrim(coalesce(p_query, '')) = '' then 2147483647
    else 30
  end;
$$;

create or replace function public.save_school_exam_scores(
  p_exam_id uuid,
  p_scores jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_item jsonb;
  v_student_id uuid;
  v_score numeric;
  v_changed integer := 0;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Scores must be an array'; end if;
  if not exists (
    select 1 from public.school_exams where id = p_exam_id and owner_id = v_owner_id
  ) then raise exception 'School exam not found'; end if;
  if (
    select count(*) from jsonb_array_elements(p_scores)
  ) <> (
    select count(distinct value->>'student_id') from jsonb_array_elements(p_scores)
  ) then raise exception 'Duplicate student in score payload'; end if;

  for v_item in select value from jsonb_array_elements(p_scores)
  loop
    v_student_id := (v_item->>'student_id')::uuid;
    if not exists (
      select 1
      from public.school_exams exam
      join public.classes c
        on c.owner_id = exam.owner_id and c.subject_id = exam.subject_id
      join public.enrollments e
        on e.owner_id = c.owner_id and e.class_id = c.id
      where exam.id = p_exam_id
        and exam.owner_id = v_owner_id
        and e.student_id = v_student_id
    ) then raise exception 'Student is not eligible for this school exam'; end if;

    if v_item->'score' is null or jsonb_typeof(v_item->'score') = 'null' then
      delete from public.school_exam_scores
      where owner_id = v_owner_id and exam_id = p_exam_id and student_id = v_student_id;
      v_changed := v_changed + case when found then 1 else 0 end;
    else
      v_score := (v_item->>'score')::numeric;
      insert into public.school_exam_scores (owner_id, exam_id, student_id, score)
      values (v_owner_id, p_exam_id, v_student_id, v_score)
      on conflict (exam_id, student_id) do update
        set score = excluded.score
        where public.school_exam_scores.score is distinct from excluded.score;
      v_changed := v_changed + case when found then 1 else 0 end;
    end if;
  end loop;

  return v_changed;
end;
$$;

create or replace function public.delete_school_exam(p_exam_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_exam public.school_exams;
  v_score_count integer;
begin
  select * into v_exam from public.school_exams
  where id = p_exam_id and owner_id = v_owner_id for update;
  if not found then raise exception 'School exam not found'; end if;

  select count(*)::integer into v_score_count from public.school_exam_scores
  where owner_id = v_owner_id and exam_id = p_exam_id;
  delete from public.school_exams where id = p_exam_id;

  perform public.phase5_write_activity(
    v_owner_id, 'school_exam_deleted', 'school_exam', p_exam_id,
    v_exam.year || ' ' || v_exam.name || U&' \5B66\6821\8003\8BD5 \2192 \5220\9664\FF08'
      || v_score_count || U&' \7B14\6210\7EE9\FF09'
  );
  return v_score_count;
end;
$$;

create or replace function public.create_tuition_quiz(
  p_class_id uuid,
  p_name text,
  p_quiz_date date,
  p_max_score numeric
)
returns public.tuition_quizzes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_quiz public.tuition_quizzes;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Quiz name is required'; end if;
  if p_quiz_date is null then raise exception 'Quiz date is required'; end if;
  if p_max_score is null or p_max_score <= 0 then raise exception 'Invalid maximum score'; end if;
  if not exists (
    select 1 from public.classes where id = p_class_id and owner_id = v_owner_id
  ) then raise exception 'Class not found'; end if;

  insert into public.tuition_quizzes (owner_id, class_id, name, quiz_date, max_score)
  values (v_owner_id, p_class_id, btrim(p_name), p_quiz_date, p_max_score)
  returning * into v_quiz;

  perform public.phase5_write_activity(
    v_owner_id, 'tuition_quiz_created', 'tuition_quiz', v_quiz.id,
    v_quiz.name || U&' \8865\4E60\73ED\5C0F\6D4B \2192 \65B0\589E'
  );
  return v_quiz;
end;
$$;

create or replace function public.list_tuition_quiz_roster(p_quiz_id uuid)
returns table (
  student_id uuid,
  student_name text,
  school_class text,
  phone text,
  enrollment_id uuid
)
language sql
security definer
set search_path = ''
stable
as $$
  with quiz as (
    select class_id, quiz_date
    from public.tuition_quizzes
    where id = p_quiz_id and owner_id = auth.uid()
  ), ranked as (
    select
      s.id as student_id,
      s.name as student_name,
      s.school_class,
      s.phone,
      e.id as enrollment_id,
      row_number() over (
        partition by s.id
        order by e.join_date desc, e.created_at desc, e.id desc
      ) as position
    from quiz
    join public.enrollments e
      on e.owner_id = auth.uid()
      and e.class_id = quiz.class_id
      and e.join_date <= quiz.quiz_date
      and (e.end_date is null or e.end_date >= quiz.quiz_date)
    join public.students s
      on s.owner_id = e.owner_id and s.id = e.student_id
  )
  select student_id, student_name, school_class, phone, enrollment_id
  from ranked
  where position = 1
  order by student_name, student_id;
$$;

create or replace function public.save_tuition_quiz_scores(
  p_quiz_id uuid,
  p_scores jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_item jsonb;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_score numeric;
  v_changed integer := 0;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Scores must be an array'; end if;
  if not exists (
    select 1 from public.tuition_quizzes where id = p_quiz_id and owner_id = v_owner_id
  ) then raise exception 'Tuition quiz not found'; end if;
  if (
    select count(*) from jsonb_array_elements(p_scores)
  ) <> (
    select count(distinct value->>'student_id') from jsonb_array_elements(p_scores)
  ) then raise exception 'Duplicate student in score payload'; end if;

  for v_item in select value from jsonb_array_elements(p_scores)
  loop
    v_student_id := (v_item->>'student_id')::uuid;
    v_enrollment_id := (v_item->>'enrollment_id')::uuid;
    if not exists (
      select 1 from public.list_tuition_quiz_roster(p_quiz_id) roster
      where roster.student_id = v_student_id and roster.enrollment_id = v_enrollment_id
    ) then raise exception 'Student enrollment is not valid for this tuition quiz'; end if;

    if v_item->'score' is null or jsonb_typeof(v_item->'score') = 'null' then
      delete from public.tuition_quiz_scores
      where owner_id = v_owner_id and quiz_id = p_quiz_id and student_id = v_student_id;
      v_changed := v_changed + case when found then 1 else 0 end;
    else
      v_score := (v_item->>'score')::numeric;
      insert into public.tuition_quiz_scores (
        owner_id, quiz_id, student_id, enrollment_id, score
      ) values (
        v_owner_id, p_quiz_id, v_student_id, v_enrollment_id, v_score
      )
      on conflict (quiz_id, student_id) do update
        set enrollment_id = excluded.enrollment_id, score = excluded.score
        where public.tuition_quiz_scores.score is distinct from excluded.score
          or public.tuition_quiz_scores.enrollment_id is distinct from excluded.enrollment_id;
      v_changed := v_changed + case when found then 1 else 0 end;
    end if;
  end loop;

  return v_changed;
end;
$$;

create or replace function public.delete_tuition_quiz(p_quiz_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_quiz public.tuition_quizzes;
  v_score_count integer;
begin
  select * into v_quiz from public.tuition_quizzes
  where id = p_quiz_id and owner_id = v_owner_id for update;
  if not found then raise exception 'Tuition quiz not found'; end if;

  select count(*)::integer into v_score_count from public.tuition_quiz_scores
  where owner_id = v_owner_id and quiz_id = p_quiz_id;
  delete from public.tuition_quizzes where id = p_quiz_id;

  perform public.phase5_write_activity(
    v_owner_id, 'tuition_quiz_deleted', 'tuition_quiz', p_quiz_id,
    v_quiz.name || U&' \8865\4E60\73ED\5C0F\6D4B \2192 \5220\9664\FF08'
      || v_score_count || U&' \7B14\6210\7EE9\FF09'
  );
  return v_score_count;
end;
$$;

revoke all on function public.phase6_validate_school_exam_score() from public, anon, authenticated;
revoke all on function public.phase6_validate_tuition_quiz_score() from public, anon, authenticated;
revoke all on function public.create_school_exam(uuid, integer, date, text, numeric) from public, anon;
revoke all on function public.list_school_exam_roster(uuid, uuid) from public, anon;
revoke all on function public.list_school_exam_historical_candidates(uuid, text) from public, anon;
revoke all on function public.save_school_exam_scores(uuid, jsonb) from public, anon;
revoke all on function public.delete_school_exam(uuid) from public, anon;
revoke all on function public.create_tuition_quiz(uuid, text, date, numeric) from public, anon;
revoke all on function public.list_tuition_quiz_roster(uuid) from public, anon;
revoke all on function public.save_tuition_quiz_scores(uuid, jsonb) from public, anon;
revoke all on function public.delete_tuition_quiz(uuid) from public, anon;

grant execute on function public.create_school_exam(uuid, integer, date, text, numeric) to authenticated;
grant execute on function public.list_school_exam_roster(uuid, uuid) to authenticated;
grant execute on function public.list_school_exam_historical_candidates(uuid, text) to authenticated;
grant execute on function public.save_school_exam_scores(uuid, jsonb) to authenticated;
grant execute on function public.delete_school_exam(uuid) to authenticated;
grant execute on function public.create_tuition_quiz(uuid, text, date, numeric) to authenticated;
grant execute on function public.list_tuition_quiz_roster(uuid) to authenticated;
grant execute on function public.save_tuition_quiz_scores(uuid, jsonb) to authenticated;
grant execute on function public.delete_tuition_quiz(uuid) to authenticated;
