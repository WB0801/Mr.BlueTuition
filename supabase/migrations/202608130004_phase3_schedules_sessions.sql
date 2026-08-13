-- Phase 3: schedule history, generated class sessions, rescheduling,
-- cancellation, and extra sessions. All timestamps represent real instants;
-- local schedule calculations use Asia/Kuala_Lumpur explicitly.

create table public.class_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  class_id uuid not null,
  schedule_slot_id uuid not null default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, class_id, owner_id),
  constraint class_schedule_rules_class_owner_fk
    foreign key (class_id, owner_id)
    references public.classes(id, owner_id)
    on delete restrict,
  constraint class_schedule_rules_time_order_check check (end_time > start_time),
  constraint class_schedule_rules_date_order_check check (
    effective_to is null or effective_to >= effective_from
  ),
  unique (class_id, schedule_slot_id, effective_from)
);

-- A class may have several parallel weekly schedule slots. Each slot has one
-- open rule, and permanent changes append a successor inside that same slot.
create unique index class_schedule_rules_one_open_rule_per_slot
  on public.class_schedule_rules (class_id, schedule_slot_id)
  where effective_to is null;

create index class_schedule_rules_class_dates_idx
  on public.class_schedule_rules (class_id, effective_from, effective_to);

-- Preserve every Phase 2 class and copy its deployed fixed schedule into the
-- first rule. Ended classes receive a closed historical rule.
insert into public.class_schedule_rules (
  owner_id,
  class_id,
  weekday,
  start_time,
  end_time,
  effective_from,
  effective_to
)
select
  owner_id,
  id,
  weekday,
  start_time,
  end_time,
  start_date,
  case when status = 'ended' then end_date else null end
from public.classes;

-- Phase 2 fixed-time columns remain only as a compatibility mirror. This
-- explicit pointer states exactly which schedule rule they mirror; schedule
-- generation and schedule UI never use those columns as the source of truth.
alter table public.classes
  add column schedule_summary_rule_id uuid;

update public.classes c
set schedule_summary_rule_id = rule.id
from public.class_schedule_rules rule
where rule.class_id = c.id
  and rule.owner_id = c.owner_id;

alter table public.classes
  add constraint classes_schedule_summary_rule_owner_fk
  foreign key (schedule_summary_rule_id, id, owner_id)
  references public.class_schedule_rules(id, class_id, owner_id)
  on delete restrict;

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  class_id uuid not null,
  schedule_rule_id uuid,
  session_type text not null check (session_type in ('regular', 'extra')),
  schedule_week date,
  original_start_at timestamptz not null,
  original_end_at timestamptz not null,
  current_start_at timestamptz not null,
  current_end_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint class_sessions_class_owner_fk
    foreign key (class_id, owner_id)
    references public.classes(id, owner_id)
    on delete restrict,
  constraint class_sessions_rule_owner_fk
    foreign key (schedule_rule_id, owner_id)
    references public.class_schedule_rules(id, owner_id)
    on delete restrict,
  constraint class_sessions_original_time_order_check
    check (original_end_at > original_start_at),
  constraint class_sessions_current_time_order_check
    check (current_end_at > current_start_at),
  constraint class_sessions_type_rule_check check (
    (session_type = 'regular' and schedule_rule_id is not null and schedule_week is not null)
    or
    (session_type = 'extra' and schedule_rule_id is null and schedule_week is null)
  ),
  constraint class_sessions_cancelled_state_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or
    (status <> 'cancelled' and cancelled_at is null)
  )
);

-- Each rule may generate at most one copy of its original scheduled instant.
-- Different rules belonging to the same class remain independent, allowing a
-- class to have two or more fixed lessons in one teaching week.
create unique index class_sessions_regular_rule_origin_unique
  on public.class_sessions (schedule_rule_id, original_start_at)
  where session_type = 'regular';

create unique index class_sessions_extra_start_unique
  on public.class_sessions (class_id, original_start_at)
  where session_type = 'extra';

create index class_sessions_owner_current_idx
  on public.class_sessions (owner_id, current_start_at);

create index class_sessions_class_current_idx
  on public.class_sessions (class_id, current_start_at);

create table public.session_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  session_id uuid not null,
  old_start_at timestamptz not null,
  old_end_at timestamptz not null,
  new_start_at timestamptz not null,
  new_end_at timestamptz not null,
  changed_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint session_schedule_changes_session_owner_fk
    foreign key (session_id, owner_id)
    references public.class_sessions(id, owner_id)
    on delete restrict,
  constraint session_schedule_changes_old_time_order_check
    check (old_end_at > old_start_at),
  constraint session_schedule_changes_new_time_order_check
    check (new_end_at > new_start_at)
);

create index session_schedule_changes_session_changed_idx
  on public.session_schedule_changes (session_id, changed_at);

create trigger class_schedule_rules_set_updated_at
  before update on public.class_schedule_rules
  for each row execute procedure public.set_updated_at();

create trigger class_sessions_set_updated_at
  before update on public.class_sessions
  for each row execute procedure public.set_updated_at();

alter table public.class_schedule_rules enable row level security;
alter table public.class_sessions enable row level security;
alter table public.session_schedule_changes enable row level security;

create policy "Users can read their own class schedule rules"
  on public.class_schedule_rules for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own class sessions"
  on public.class_sessions for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own session schedule changes"
  on public.session_schedule_changes for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.class_schedule_rules to authenticated;
grant select on public.class_sessions to authenticated;
grant select on public.session_schedule_changes to authenticated;

revoke all on public.class_schedule_rules from anon;
revoke all on public.class_sessions from anon;
revoke all on public.session_schedule_changes from anon;

-- Schedule fields and lifecycle state are now database-managed. Normal class
-- edits may still change the plain Phase 2 fields listed below.
revoke update on public.classes from authenticated;
grant update (subject_id, name, monthly_fee, start_date) on public.classes to authenticated;

create or replace function public.enforce_class_schedule_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.schedule_summary_rule_id is null or not exists (
    select 1
    from public.class_schedule_rules rule
    where rule.id = new.schedule_summary_rule_id
      and rule.class_id = new.id
      and rule.owner_id = new.owner_id
      and rule.weekday = new.weekday
      and rule.start_time = new.start_time
      and rule.end_time = new.end_time
  ) then
    raise exception 'Class schedule compatibility mirror must match its referenced rule';
  end if;

  return new;
end;
$$;

create trigger classes_enforce_schedule_summary
  before update of weekday, start_time, end_time, schedule_summary_rule_id
  on public.classes
  for each row execute procedure public.enforce_class_schedule_summary();

revoke all on function public.enforce_class_schedule_summary() from public, anon, authenticated;

create or replace function public.create_initial_class_schedule_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_id uuid;
begin
  insert into public.class_schedule_rules (
    owner_id,
    class_id,
    weekday,
    start_time,
    end_time,
    effective_from
  )
  values (
    new.owner_id,
    new.id,
    new.weekday,
    new.start_time,
    new.end_time,
    new.start_date
  )
  returning id into v_rule_id;

  update public.classes
  set schedule_summary_rule_id = v_rule_id
  where id = new.id;

  return new;
end;
$$;

create trigger classes_create_initial_schedule_rule
  after insert on public.classes
  for each row execute procedure public.create_initial_class_schedule_rule();

revoke all on function public.create_initial_class_schedule_rule() from public, anon, authenticated;

create or replace function public.ensure_class_sessions(
  p_from_date date,
  p_to_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_inserted integer := 0;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid generation date range';
  end if;

  if p_to_date - p_from_date > 400 then
    raise exception 'Generation range is too large';
  end if;

  with candidate_dates as (
    select
      c.id as class_id,
      c.owner_id,
      r.id as schedule_rule_id,
      r.schedule_slot_id,
      (p_from_date + offsets.day_offset) as session_date,
      (p_from_date + offsets.day_offset)
        - (extract(isodow from (p_from_date + offsets.day_offset))::integer - 1)
        as schedule_week,
      r.start_time,
      r.end_time
    from public.classes c
    join public.class_schedule_rules r
      on r.class_id = c.id and r.owner_id = c.owner_id
    cross join generate_series(0, p_to_date - p_from_date) as offsets(day_offset)
    where c.owner_id = v_owner_id
      and c.status = 'active'
      and (p_from_date + offsets.day_offset) >= c.start_date
      and (c.end_date is null or (p_from_date + offsets.day_offset) <= c.end_date)
      and (p_from_date + offsets.day_offset) >= r.effective_from
      and (r.effective_to is null or (p_from_date + offsets.day_offset) <= r.effective_to)
      and extract(isodow from (p_from_date + offsets.day_offset))::smallint = r.weekday
      -- A manually adjusted/cancelled/completed occurrence from a predecessor
      -- rule in the same slot is preserved and suppresses its replacement for
      -- that slot/week. Parallel slots in the same class remain independent.
      and not exists (
        select 1
        from public.class_sessions existing_session
        join public.class_schedule_rules existing_rule
          on existing_rule.id = existing_session.schedule_rule_id
          and existing_rule.owner_id = existing_session.owner_id
        where existing_session.class_id = c.id
          and existing_session.owner_id = c.owner_id
          and existing_session.session_type = 'regular'
          and existing_rule.schedule_slot_id = r.schedule_slot_id
          and existing_session.schedule_week = (
            (p_from_date + offsets.day_offset)
            - (extract(isodow from (p_from_date + offsets.day_offset))::integer - 1)
          )
      )
  )
  insert into public.class_sessions (
    owner_id,
    class_id,
    schedule_rule_id,
    session_type,
    schedule_week,
    original_start_at,
    original_end_at,
    current_start_at,
    current_end_at
  )
  select
    owner_id,
    class_id,
    schedule_rule_id,
    'regular',
    schedule_week,
    (session_date + start_time) at time zone 'Asia/Kuala_Lumpur',
    (session_date + end_time) at time zone 'Asia/Kuala_Lumpur',
    (session_date + start_time) at time zone 'Asia/Kuala_Lumpur',
    (session_date + end_time) at time zone 'Asia/Kuala_Lumpur'
  from candidate_dates
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.preview_class_schedule_change(
  p_class_id uuid,
  p_schedule_rule_id uuid,
  p_effective_from date
)
returns table (affected_count bigint, manually_adjusted_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.class_schedule_rules rule
    join public.classes c
      on c.id = rule.class_id and c.owner_id = rule.owner_id
    where rule.id = p_schedule_rule_id
      and rule.class_id = p_class_id
      and rule.owner_id = v_owner_id
      and rule.effective_to is null
      and c.status = 'active'
  ) then
    raise exception 'Open schedule rule not found';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where exists (
      select 1
      from public.session_schedule_changes change
      where change.session_id = session.id
        and change.owner_id = v_owner_id
    ))::bigint
  from public.class_sessions session
  where session.class_id = p_class_id
    and session.owner_id = v_owner_id
    and session.schedule_rule_id = p_schedule_rule_id
    and session.session_type = 'regular'
    and session.status = 'scheduled'
    and session.original_start_at >= now()
    and (session.original_start_at at time zone 'Asia/Kuala_Lumpur')::date >= p_effective_from;
end;
$$;

create or replace function public.change_class_schedule(
  p_class_id uuid,
  p_schedule_rule_id uuid,
  p_weekday smallint,
  p_start_time time,
  p_end_time time,
  p_effective_from date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.classes;
  v_old_rule public.class_schedule_rules;
  v_new_rule public.class_schedule_rules;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_generate_until date;
  v_affected bigint := 0;
  v_manual bigint := 0;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_weekday not between 1 and 7 or p_end_time <= p_start_time then
    raise exception 'Invalid schedule time';
  end if;

  if p_effective_from < v_today then
    raise exception 'New schedule cannot start in the past';
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id and owner_id = v_owner_id
  for update;

  if not found or v_class.status <> 'active' then
    raise exception 'Active class not found';
  end if;

  select * into v_old_rule
  from public.class_schedule_rules
  where id = p_schedule_rule_id
    and class_id = p_class_id
    and owner_id = v_owner_id
    and effective_to is null
  for update;

  if not found then
    raise exception 'Current schedule rule not found';
  end if;

  if p_effective_from <= v_old_rule.effective_from then
    raise exception 'New schedule must start after the current rule starts';
  end if;

  select result.affected_count, result.manually_adjusted_count
  into v_affected, v_manual
  from public.preview_class_schedule_change(
    p_class_id,
    p_schedule_rule_id,
    p_effective_from
  ) result;

  update public.class_schedule_rules
  set effective_to = p_effective_from - 1
  where id = v_old_rule.id;

  insert into public.class_schedule_rules (
    owner_id,
    class_id,
    schedule_slot_id,
    weekday,
    start_time,
    end_time,
    effective_from
  )
  values (
    v_owner_id,
    p_class_id,
    v_old_rule.schedule_slot_id,
    p_weekday,
    p_start_time,
    p_end_time,
    p_effective_from
  )
  returning * into v_new_rule;

  -- Only untouched, scheduled, future regular sessions are regenerated.
  -- Cancelled/completed sessions and every individually rescheduled session
  -- keep their original row and history.
  delete from public.class_sessions session
  where session.class_id = p_class_id
    and session.owner_id = v_owner_id
    and session.schedule_rule_id = v_old_rule.id
    and session.session_type = 'regular'
    and session.status = 'scheduled'
    and session.original_start_at >= now()
    and (session.original_start_at at time zone 'Asia/Kuala_Lumpur')::date >= p_effective_from
    and not exists (
      select 1 from public.session_schedule_changes change
      where change.session_id = session.id
        and change.owner_id = v_owner_id
    );

  -- The Phase 2 columns are an explicit compatibility mirror only. If this is
  -- the mirrored slot, atomically move the pointer and values to its successor.
  update public.classes
  set weekday = p_weekday,
      start_time = p_start_time,
      end_time = p_end_time,
      schedule_summary_rule_id = v_new_rule.id
  where id = p_class_id
    and schedule_summary_rule_id = v_old_rule.id;

  v_generate_until := greatest(v_today + 90, p_effective_from + 90);

  perform public.ensure_class_sessions(p_effective_from, v_generate_until);

  return jsonb_build_object(
    'affected_count', v_affected,
    'manually_adjusted_count', v_manual,
    'schedule_rule_id', v_new_rule.id
  );
end;
$$;

create or replace function public.reschedule_class_session(
  p_session_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id
  for update;

  if not found or v_session.status <> 'scheduled' then
    raise exception 'Scheduled session not found';
  end if;

  if p_new_end_at <= p_new_start_at then
    raise exception 'New end time must be after start time';
  end if;

  if p_new_start_at = v_session.current_start_at
     and p_new_end_at = v_session.current_end_at then
    raise exception 'New schedule is unchanged';
  end if;

  insert into public.session_schedule_changes (
    owner_id,
    session_id,
    old_start_at,
    old_end_at,
    new_start_at,
    new_end_at
  )
  values (
    v_owner_id,
    v_session.id,
    v_session.current_start_at,
    v_session.current_end_at,
    p_new_start_at,
    p_new_end_at
  );

  update public.class_sessions
  set current_start_at = p_new_start_at,
      current_end_at = p_new_end_at
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.cancel_class_session(
  p_session_id uuid
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id
  for update;

  if not found or v_session.status <> 'scheduled' then
    raise exception 'Scheduled session not found';
  end if;

  update public.class_sessions
  set status = 'cancelled', cancelled_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.restore_class_session(
  p_session_id uuid
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id
  for update;

  if not found or v_session.status <> 'cancelled' then
    raise exception 'Stopped session not found';
  end if;

  if not exists (
    select 1
    from public.classes
    where id = v_session.class_id
      and owner_id = v_owner_id
      and status = 'active'
  ) then
    raise exception 'Active class not found';
  end if;

  -- Restore the same row only. Original/current times, schedule rule, type,
  -- and every schedule change record remain untouched.
  update public.class_sessions
  set status = 'scheduled', cancelled_at = null
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.stop_class_sessions_for_date(
  p_session_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_stopped integer := 0;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_session_date is null then
    raise exception 'Session date is required';
  end if;

  -- Ensure the selected date has been materialized before the atomic update,
  -- including dates outside the normal page's rolling window.
  perform public.ensure_class_sessions(p_session_date, p_session_date);

  update public.class_sessions
  set status = 'cancelled', cancelled_at = now()
  where owner_id = v_owner_id
    and status = 'scheduled'
    and (current_start_at at time zone 'Asia/Kuala_Lumpur')::date = p_session_date;

  get diagnostics v_stopped = row_count;
  return v_stopped;
end;
$$;

create or replace function public.create_extra_class_session(
  p_class_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'End time must be after start time';
  end if;

  if not exists (
    select 1 from public.classes
    where id = p_class_id and owner_id = v_owner_id and status = 'active'
  ) then
    raise exception 'Active class not found';
  end if;

  insert into public.class_sessions (
    owner_id,
    class_id,
    session_type,
    original_start_at,
    original_end_at,
    current_start_at,
    current_end_at
  )
  values (
    v_owner_id,
    p_class_id,
    'extra',
    p_start_at,
    p_end_at,
    p_start_at,
    p_end_at
  )
  returning * into v_session;

  return v_session;
end;
$$;

-- Extend the accepted Phase 2 end-class transaction so schedule generation
-- stops and already-generated future sessions are retained as cancelled.
create or replace function public.end_class(
  p_class_id uuid,
  p_end_date date
)
returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.classes;
begin
  select * into v_class
  from public.classes
  where id = p_class_id and owner_id = v_owner_id
  for update;

  if not found or v_class.status <> 'active' then
    raise exception 'Active class not found';
  end if;

  if p_end_date < v_class.start_date then
    raise exception 'End date cannot be before class start date';
  end if;

  if exists (
    select 1 from public.enrollments
    where class_id = p_class_id
      and owner_id = v_owner_id
      and status = 'active'
      and join_date > p_end_date
  ) then
    raise exception 'Class has an enrollment after the selected end date';
  end if;

  update public.enrollments
  set status = 'ended', end_date = p_end_date
  where class_id = p_class_id
    and owner_id = v_owner_id
    and status = 'active';

  update public.class_schedule_rules
  set effective_to = p_end_date
  where class_id = p_class_id
    and owner_id = v_owner_id
    and effective_from <= p_end_date
    and (effective_to is null or effective_to > p_end_date);

  update public.class_sessions
  set status = 'cancelled', cancelled_at = now()
  where class_id = p_class_id
    and owner_id = v_owner_id
    and status = 'scheduled'
    and (current_start_at at time zone 'Asia/Kuala_Lumpur')::date > p_end_date;

  update public.classes
  set status = 'ended', end_date = p_end_date
  where id = p_class_id
  returning * into v_class;

  return v_class;
end;
$$;

revoke all on function public.ensure_class_sessions(date, date) from public, anon;
revoke all on function public.preview_class_schedule_change(uuid, uuid, date) from public, anon;
revoke all on function public.change_class_schedule(uuid, uuid, smallint, time, time, date) from public, anon;
revoke all on function public.reschedule_class_session(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.cancel_class_session(uuid) from public, anon;
revoke all on function public.restore_class_session(uuid) from public, anon;
revoke all on function public.stop_class_sessions_for_date(date) from public, anon;
revoke all on function public.create_extra_class_session(uuid, timestamptz, timestamptz) from public, anon;

grant execute on function public.ensure_class_sessions(date, date) to authenticated;
grant execute on function public.preview_class_schedule_change(uuid, uuid, date) to authenticated;
grant execute on function public.change_class_schedule(uuid, uuid, smallint, time, time, date) to authenticated;
grant execute on function public.reschedule_class_session(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_class_session(uuid) to authenticated;
grant execute on function public.restore_class_session(uuid) to authenticated;
grant execute on function public.stop_class_sessions_for_date(date) to authenticated;
grant execute on function public.create_extra_class_session(uuid, timestamptz, timestamptz) to authenticated;
