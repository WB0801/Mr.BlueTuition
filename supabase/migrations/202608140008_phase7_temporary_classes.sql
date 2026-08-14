-- Phase 7: one-off temporary classes, registrations, one-time payments,
-- shared attendance sessions, and a unified receipt queue.

create table public.temporary_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid not null,
  name text not null check (btrim(name) <> ''),
  start_at timestamptz not null,
  end_at timestamptz not null,
  fee_amount numeric(10, 2) not null check (fee_amount >= 0),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint temporary_classes_subject_owner_fk
    foreign key (subject_id, owner_id)
    references public.subjects(id, owner_id)
    on delete restrict,
  constraint temporary_classes_time_order_check check (end_at > start_at),
  constraint temporary_classes_same_local_date_check check (
    (start_at at time zone 'Asia/Kuala_Lumpur')::date
      = (end_at at time zone 'Asia/Kuala_Lumpur')::date
  )
);

create index temporary_classes_owner_status_start_idx
  on public.temporary_classes (owner_id, status, start_at);

create table public.temporary_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  temporary_class_id uuid not null,
  student_id uuid not null,
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint temporary_class_enrollments_class_owner_fk
    foreign key (temporary_class_id, owner_id)
    references public.temporary_classes(id, owner_id)
    on delete restrict,
  constraint temporary_class_enrollments_student_owner_fk
    foreign key (student_id, owner_id)
    references public.students(id, owner_id)
    on delete restrict,
  constraint temporary_class_enrollments_class_student_unique
    unique (temporary_class_id, student_id)
);

create index temporary_class_enrollments_owner_student_idx
  on public.temporary_class_enrollments (owner_id, student_id, joined_at desc);

create table public.temporary_class_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  temporary_class_enrollment_id uuid not null,
  amount numeric(10, 2) not null check (amount >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_at timestamptz,
  receipt_status text not null default 'not_applicable'
    check (receipt_status in ('not_applicable', 'pending', 'completed')),
  receipt_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint temporary_class_payments_enrollment_owner_fk
    foreign key (temporary_class_enrollment_id, owner_id)
    references public.temporary_class_enrollments(id, owner_id)
    on delete restrict,
  constraint temporary_class_payments_one_per_enrollment
    unique (temporary_class_enrollment_id),
  constraint temporary_class_payments_state_check check (
    (payment_status = 'unpaid'
      and paid_at is null
      and receipt_status = 'not_applicable'
      and receipt_completed_at is null)
    or
    (payment_status = 'paid'
      and paid_at is not null
      and (
        (receipt_status = 'pending' and receipt_completed_at is null)
        or
        (receipt_status = 'completed' and receipt_completed_at is not null)
      ))
  )
);

create index temporary_class_payments_owner_receipt_idx
  on public.temporary_class_payments (owner_id, receipt_status, paid_at);

create trigger temporary_classes_set_updated_at
  before update on public.temporary_classes
  for each row execute procedure public.set_updated_at();

create trigger temporary_class_payments_set_updated_at
  before update on public.temporary_class_payments
  for each row execute procedure public.set_updated_at();

alter table public.temporary_classes enable row level security;
alter table public.temporary_class_enrollments enable row level security;
alter table public.temporary_class_payments enable row level security;

create policy "Users can read their own temporary classes"
  on public.temporary_classes for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own temporary class enrollments"
  on public.temporary_class_enrollments for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own temporary class payments"
  on public.temporary_class_payments for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.temporary_classes to authenticated;
grant select on public.temporary_class_enrollments to authenticated;
grant select on public.temporary_class_payments to authenticated;
revoke all on public.temporary_classes from anon;
revoke all on public.temporary_class_enrollments from anon;
revoke all on public.temporary_class_payments from anon;

-- Reuse the existing Session table. Normal sessions keep class_id; a
-- temporary Session instead has temporary_class_id and no schedule rule.
alter table public.class_sessions
  alter column class_id drop not null,
  add column temporary_class_id uuid;

alter table public.class_sessions
  drop constraint class_sessions_session_type_check,
  drop constraint class_sessions_type_rule_check,
  add constraint class_sessions_session_type_check
    check (session_type in ('regular', 'extra', 'temporary')),
  add constraint class_sessions_temporary_class_owner_fk
    foreign key (temporary_class_id, owner_id)
    references public.temporary_classes(id, owner_id)
    on delete restrict,
  add constraint class_sessions_source_type_check check (
    (session_type = 'regular'
      and class_id is not null
      and temporary_class_id is null
      and schedule_rule_id is not null
      and schedule_week is not null)
    or
    (session_type = 'extra'
      and class_id is not null
      and temporary_class_id is null
      and schedule_rule_id is null
      and schedule_week is null)
    or
    (session_type = 'temporary'
      and class_id is null
      and temporary_class_id is not null
      and schedule_rule_id is null
      and schedule_week is null)
  );

create unique index class_sessions_one_temporary_session
  on public.class_sessions (temporary_class_id)
  where session_type = 'temporary';

create index class_sessions_temporary_current_idx
  on public.class_sessions (temporary_class_id, current_start_at)
  where session_type = 'temporary';

create or replace function public.phase7_create_payment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric(10, 2);
begin
  select fee_amount into v_amount
  from public.temporary_classes
  where id = new.temporary_class_id and owner_id = new.owner_id;

  insert into public.temporary_class_payments (
    owner_id, temporary_class_enrollment_id, amount
  ) values (
    new.owner_id, new.id, v_amount
  );
  return new;
end;
$$;

create trigger temporary_class_enrollment_create_payment
  after insert on public.temporary_class_enrollments
  for each row execute procedure public.phase7_create_payment_snapshot();

revoke all on function public.phase7_create_payment_snapshot()
  from public, anon, authenticated;

create or replace function public.create_temporary_class(
  p_subject_id uuid,
  p_name text,
  p_class_date date,
  p_start_time time,
  p_end_time time,
  p_fee_amount numeric
)
returns public.temporary_classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.temporary_classes;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Temporary class name is required'; end if;
  if p_class_date is null or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Invalid temporary class time';
  end if;
  if p_fee_amount is null or p_fee_amount < 0 then raise exception 'Invalid fee amount'; end if;
  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and owner_id = v_owner_id
  ) then raise exception 'Subject not found'; end if;

  v_start_at := (p_class_date + p_start_time) at time zone 'Asia/Kuala_Lumpur';
  v_end_at := (p_class_date + p_end_time) at time zone 'Asia/Kuala_Lumpur';

  insert into public.temporary_classes (
    owner_id, subject_id, name, start_at, end_at, fee_amount
  ) values (
    v_owner_id, p_subject_id, btrim(p_name), v_start_at, v_end_at, p_fee_amount
  ) returning * into v_class;

  insert into public.class_sessions (
    owner_id, class_id, temporary_class_id, schedule_rule_id, session_type,
    schedule_week, original_start_at, original_end_at, current_start_at, current_end_at
  ) values (
    v_owner_id, null, v_class.id, null, 'temporary', null,
    v_start_at, v_end_at, v_start_at, v_end_at
  );

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_created', 'temporary_class', v_class.id,
    v_class.name || U&' \4E34\65F6\73ED \2192 \65B0\589E'
  );
  return v_class;
end;
$$;

create or replace function public.update_temporary_class(
  p_temporary_class_id uuid,
  p_subject_id uuid,
  p_name text,
  p_class_date date,
  p_start_time time,
  p_end_time time,
  p_fee_amount numeric
)
returns public.temporary_classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.temporary_classes;
  v_session public.class_sessions;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Temporary class name is required'; end if;
  if p_class_date is null or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Invalid temporary class time';
  end if;
  if p_fee_amount is null or p_fee_amount < 0 then raise exception 'Invalid fee amount'; end if;

  select * into v_class from public.temporary_classes
  where id = p_temporary_class_id and owner_id = v_owner_id
  for update;
  if not found or v_class.status <> 'active' then raise exception 'Active temporary class not found'; end if;
  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and owner_id = v_owner_id
  ) then raise exception 'Subject not found'; end if;

  select * into v_session from public.class_sessions
  where temporary_class_id = v_class.id and owner_id = v_owner_id
  for update;
  if not found then raise exception 'Temporary class Session not found'; end if;

  if p_subject_id <> v_class.subject_id and exists (
    select 1 from public.temporary_class_enrollments
    where owner_id = v_owner_id and temporary_class_id = v_class.id
  ) then raise exception 'Subject cannot change after students have registered'; end if;

  v_start_at := (p_class_date + p_start_time) at time zone 'Asia/Kuala_Lumpur';
  v_end_at := (p_class_date + p_end_time) at time zone 'Asia/Kuala_Lumpur';

  if (v_start_at <> v_class.start_at or v_end_at <> v_class.end_at) then
    if v_session.status = 'completed' then
      raise exception 'Completed temporary class time cannot be changed';
    end if;
    if exists (
      select 1 from public.attendance_records
      where owner_id = v_owner_id and session_id = v_session.id and status = 'valid'
    ) then raise exception 'Temporary class with valid attendance cannot change time'; end if;

    insert into public.session_schedule_changes (
      owner_id, session_id, old_start_at, old_end_at, new_start_at, new_end_at
    ) values (
      v_owner_id, v_session.id, v_session.current_start_at, v_session.current_end_at,
      v_start_at, v_end_at
    );

    update public.class_sessions
    set current_start_at = v_start_at, current_end_at = v_end_at
    where id = v_session.id;
  end if;

  update public.temporary_classes
  set subject_id = p_subject_id,
      name = btrim(p_name),
      start_at = v_start_at,
      end_at = v_end_at,
      fee_amount = p_fee_amount
  where id = v_class.id
  returning * into v_class;

  return v_class;
end;
$$;

create or replace function public.add_student_to_temporary_class(
  p_temporary_class_id uuid,
  p_student_id uuid
)
returns public.temporary_class_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.temporary_classes;
  v_student public.students;
  v_enrollment public.temporary_class_enrollments;
begin
  select * into v_class from public.temporary_classes
  where id = p_temporary_class_id and owner_id = v_owner_id
  for update;
  if not found or v_class.status <> 'active' then raise exception 'Active temporary class not found'; end if;

  select * into v_student from public.students
  where id = p_student_id and owner_id = v_owner_id;
  if not found then raise exception 'Student not found'; end if;

  insert into public.temporary_class_enrollments (
    owner_id, temporary_class_id, student_id
  ) values (
    v_owner_id, v_class.id, v_student.id
  ) returning * into v_enrollment;

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_student_added', 'temporary_class_enrollment', v_enrollment.id,
    v_student.name || U&' \2192 \62A5\540D ' || v_class.name
  );
  return v_enrollment;
end;
$$;

create or replace function public.create_student_for_temporary_class(
  p_temporary_class_id uuid,
  p_name text,
  p_school_class text,
  p_phone text
)
returns public.temporary_class_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.temporary_classes;
  v_student public.students;
  v_enrollment public.temporary_class_enrollments;
begin
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Student name is required'; end if;
  select * into v_class from public.temporary_classes
  where id = p_temporary_class_id and owner_id = v_owner_id
  for update;
  if not found or v_class.status <> 'active' then raise exception 'Active temporary class not found'; end if;

  insert into public.students (owner_id, name, school_class, phone)
  values (
    v_owner_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_school_class, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), '')
  ) returning * into v_student;

  insert into public.temporary_class_enrollments (
    owner_id, temporary_class_id, student_id
  ) values (
    v_owner_id, v_class.id, v_student.id
  ) returning * into v_enrollment;

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_student_added', 'temporary_class_enrollment', v_enrollment.id,
    v_student.name || U&' \2192 \62A5\540D ' || v_class.name
  );
  return v_enrollment;
end;
$$;

create or replace function public.mark_temporary_class_payment_paid(p_payment_id uuid)
returns public.temporary_class_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_payment public.temporary_class_payments;
  v_class_name text;
  v_student_name text;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  select p.* into v_payment
  from public.temporary_class_payments p
  join public.temporary_class_enrollments e
    on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id
  join public.temporary_classes tc
    on tc.id = e.temporary_class_id and tc.owner_id = e.owner_id
  where p.id = p_payment_id and p.owner_id = v_owner_id
  for update of p;
  if not found then raise exception 'Temporary class payment not found'; end if;
  select tc.name, s.name into v_class_name, v_student_name
  from public.temporary_class_enrollments e
  join public.temporary_classes tc
    on tc.id = e.temporary_class_id and tc.owner_id = e.owner_id
  join public.students s on s.id = e.student_id and s.owner_id = e.owner_id
  where e.id = v_payment.temporary_class_enrollment_id and e.owner_id = v_owner_id;
  if v_payment.payment_status = 'paid' then return v_payment; end if;

  update public.temporary_class_payments
  set payment_status = 'paid', paid_at = now(), receipt_status = 'pending', receipt_completed_at = null
  where id = v_payment.id
  returning * into v_payment;

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_payment_paid', 'temporary_class_payment', v_payment.id,
    v_student_name || ' ' || v_class_name || U&' \8D39\7528 \2192 \5DF2\7F34'
  );
  return v_payment;
end;
$$;

create or replace function public.undo_temporary_class_payment(p_payment_id uuid)
returns public.temporary_class_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_payment public.temporary_class_payments;
  v_class_name text;
  v_student_name text;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  select p.* into v_payment
  from public.temporary_class_payments p
  join public.temporary_class_enrollments e
    on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id
  join public.temporary_classes tc
    on tc.id = e.temporary_class_id and tc.owner_id = e.owner_id
  where p.id = p_payment_id and p.owner_id = v_owner_id
  for update of p;
  if not found then raise exception 'Temporary class payment not found'; end if;
  select tc.name, s.name into v_class_name, v_student_name
  from public.temporary_class_enrollments e
  join public.temporary_classes tc
    on tc.id = e.temporary_class_id and tc.owner_id = e.owner_id
  join public.students s on s.id = e.student_id and s.owner_id = e.owner_id
  where e.id = v_payment.temporary_class_enrollment_id and e.owner_id = v_owner_id;
  if v_payment.payment_status = 'unpaid' then return v_payment; end if;

  update public.temporary_class_payments
  set payment_status = 'unpaid', paid_at = null,
      receipt_status = 'not_applicable', receipt_completed_at = null
  where id = v_payment.id
  returning * into v_payment;

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_payment_undone', 'temporary_class_payment', v_payment.id,
    v_student_name || ' ' || v_class_name || U&' \8D39\7528 \2192 \64A4\9500\7F34\8D39'
  );
  return v_payment;
end;
$$;

create or replace function public.end_temporary_class(p_temporary_class_id uuid)
returns public.temporary_classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.temporary_classes;
begin
  select * into v_class from public.temporary_classes
  where id = p_temporary_class_id and owner_id = v_owner_id
  for update;
  if not found then raise exception 'Temporary class not found'; end if;
  if v_class.status = 'ended' then return v_class; end if;

  update public.temporary_classes set status = 'ended'
  where id = v_class.id returning * into v_class;
  update public.temporary_class_enrollments set status = 'ended'
  where owner_id = v_owner_id and temporary_class_id = v_class.id and status = 'active';
  update public.class_sessions set status = 'completed', cancelled_at = null
  where owner_id = v_owner_id and temporary_class_id = v_class.id and status = 'scheduled';

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_ended', 'temporary_class', v_class.id,
    v_class.name || U&' \2192 \5DF2\7ED3\675F'
  );
  return v_class;
end;
$$;

-- A security-invoker view keeps underlying owner RLS in force while exposing
-- one receipt list to the frontend.
create view public.receipt_queue
with (security_invoker = true)
as
select
  'monthly_fee:' || mf.id::text as receipt_key,
  'monthly_fee'::text as source_type,
  mf.id as source_id,
  mf.owner_id,
  mf.student_id,
  s.name as student_name,
  s.school_class,
  s.phone,
  c.name as source_name,
  mf.actual_amount as amount,
  mf.payment_status,
  mf.receipt_status,
  mf.paid_at,
  mf.receipt_completed_at,
  mf.fee_month as receipt_period
from public.monthly_fees mf
join public.students s on s.id = mf.student_id and s.owner_id = mf.owner_id
join public.enrollments e on e.id = mf.enrollment_id and e.owner_id = mf.owner_id
join public.classes c on c.id = e.class_id and c.owner_id = e.owner_id
where mf.payment_status = 'paid'

union all

select
  'temporary_class_payment:' || p.id::text,
  'temporary_class_payment'::text,
  p.id,
  p.owner_id,
  e.student_id,
  s.name,
  s.school_class,
  s.phone,
  tc.name,
  p.amount,
  p.payment_status,
  p.receipt_status,
  p.paid_at,
  p.receipt_completed_at,
  date_trunc('month', p.paid_at at time zone 'Asia/Kuala_Lumpur')::date
from public.temporary_class_payments p
join public.temporary_class_enrollments e
  on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id
join public.temporary_classes tc
  on tc.id = e.temporary_class_id and tc.owner_id = e.owner_id
join public.students s on s.id = e.student_id and s.owner_id = e.owner_id
where p.payment_status = 'paid';

grant select on public.receipt_queue to authenticated;
revoke all on public.receipt_queue from anon;

create or replace function public.complete_receipts(p_receipt_keys text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_requested integer;
  v_found integer;
  v_monthly integer := 0;
  v_temporary integer := 0;
begin
  with requested as (
    select distinct key from unnest(coalesce(p_receipt_keys, array[]::text[])) key
    where key is not null and key <> ''
  ) select count(*)::integer into v_requested from requested;
  if v_requested = 0 then return 0; end if;

  with requested as (
    select distinct key from unnest(p_receipt_keys) key
  ), found as (
    select 'monthly_fee:' || f.id::text as key
    from public.monthly_fees f
    join requested r on r.key = 'monthly_fee:' || f.id::text
    where f.owner_id = v_owner_id and f.payment_status = 'paid'
    union all
    select 'temporary_class_payment:' || p.id::text
    from public.temporary_class_payments p
    join requested r on r.key = 'temporary_class_payment:' || p.id::text
    where p.owner_id = v_owner_id and p.payment_status = 'paid'
  ) select count(*)::integer into v_found from found;
  if v_found <> v_requested then raise exception 'One or more paid receipts were not found'; end if;

  perform 1 from public.monthly_fees f
  where f.owner_id = v_owner_id and 'monthly_fee:' || f.id::text = any(p_receipt_keys)
  for update;
  perform 1 from public.temporary_class_payments p
  where p.owner_id = v_owner_id and 'temporary_class_payment:' || p.id::text = any(p_receipt_keys)
  for update;

  update public.monthly_fees
  set receipt_status = 'completed', receipt_completed_at = now()
  where owner_id = v_owner_id and payment_status = 'paid' and receipt_status = 'pending'
    and 'monthly_fee:' || id::text = any(p_receipt_keys);
  get diagnostics v_monthly = row_count;

  update public.temporary_class_payments
  set receipt_status = 'completed', receipt_completed_at = now()
  where owner_id = v_owner_id and payment_status = 'paid' and receipt_status = 'pending'
    and 'temporary_class_payment:' || id::text = any(p_receipt_keys);
  get diagnostics v_temporary = row_count;

  if v_monthly + v_temporary > 0 then
    perform public.phase5_write_activity(
      v_owner_id, 'receipts_completed', 'receipt', null,
      U&'\6279\91CF\6807\8BB0 ' || (v_monthly + v_temporary) || U&' \5F20\6536\636E\5DF2\5904\7406'
    );
  end if;
  return v_monthly + v_temporary;
end;
$$;

create or replace function public.restore_receipt(p_receipt_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_id uuid;
  v_updated integer := 0;
begin
  if p_receipt_key like 'monthly_fee:%' then
    v_id := substring(p_receipt_key from length('monthly_fee:') + 1)::uuid;
    perform 1 from public.monthly_fees
    where id = v_id and owner_id = v_owner_id and payment_status = 'paid'
    for update;
    if not found then raise exception 'Paid monthly fee not found'; end if;
    update public.monthly_fees
    set receipt_status = 'pending', receipt_completed_at = null
    where id = v_id and owner_id = v_owner_id and receipt_status = 'completed';
    get diagnostics v_updated = row_count;
  elsif p_receipt_key like 'temporary_class_payment:%' then
    v_id := substring(p_receipt_key from length('temporary_class_payment:') + 1)::uuid;
    perform 1 from public.temporary_class_payments
    where id = v_id and owner_id = v_owner_id and payment_status = 'paid'
    for update;
    if not found then raise exception 'Paid temporary class payment not found'; end if;
    update public.temporary_class_payments
    set receipt_status = 'pending', receipt_completed_at = null
    where id = v_id and owner_id = v_owner_id and receipt_status = 'completed';
    get diagnostics v_updated = row_count;
  else
    raise exception 'Invalid receipt key';
  end if;

  if v_updated > 0 then
    perform public.phase5_write_activity(
      v_owner_id, 'receipt_restored', 'receipt', v_id,
      U&'\6536\636E \2192 \5F85\5904\7406'
    );
  end if;
  return v_updated > 0;
end;
$$;

-- Extend the Phase 4 roster with temporary registrations. Missing attendance
-- is still derived; no absence rows are created.
create or replace function public.get_session_attendance_roster(p_session_id uuid)
returns table (
  student_id uuid, student_name text, school_class text, phone text,
  participation_type text, makeup_link_id uuid, source_session_id uuid,
  attendance_record_id uuid, captured_at timestamptz, synced_at timestamptz,
  capture_source text, signing_type text, signature_path text,
  made_up_session_id uuid, made_up_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
  v_session_date date;
begin
  select * into v_session from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id;
  if not found then raise exception 'Session not found'; end if;
  if v_session.status = 'cancelled' then return; end if;
  v_session_date := (v_session.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;

  return query
  with roster as (
    select distinct e.student_id, 'regular'::text as participation_type,
      null::uuid as makeup_link_id, null::uuid as source_session_id
    from public.enrollments e
    where v_session.session_type <> 'temporary'
      and e.owner_id = v_owner_id and e.class_id = v_session.class_id
      and e.join_date <= v_session_date
      and (e.end_date is null or e.end_date >= v_session_date)

    union all

    select e.student_id, 'regular'::text, null::uuid, null::uuid
    from public.temporary_class_enrollments e
    where v_session.session_type = 'temporary'
      and e.owner_id = v_owner_id
      and e.temporary_class_id = v_session.temporary_class_id

    union all

    select ml.student_id, ml.link_type, ml.id, ml.source_session_id
    from public.makeup_links ml
    where v_session.session_type <> 'temporary'
      and ml.owner_id = v_owner_id and ml.target_session_id = v_session.id
      and not exists (
        select 1 from public.enrollments target_enrollment
        where target_enrollment.owner_id = v_owner_id
          and target_enrollment.student_id = ml.student_id
          and target_enrollment.class_id = v_session.class_id
          and target_enrollment.join_date <= v_session_date
          and (target_enrollment.end_date is null or target_enrollment.end_date >= v_session_date)
      )
  )
  select s.id, s.name, s.school_class, s.phone,
    roster.participation_type, roster.makeup_link_id, roster.source_session_id,
    ar.id, ar.captured_at, ar.synced_at, ar.capture_source, ar.signing_type,
    ar.signature_path, made_up.target_session_id, made_up.target_start_at
  from roster
  join public.students s on s.id = roster.student_id and s.owner_id = v_owner_id
  left join public.attendance_records ar
    on ar.owner_id = v_owner_id and ar.session_id = v_session.id
    and ar.student_id = roster.student_id and ar.status = 'valid'
  left join lateral (
    select ml.target_session_id, target.current_start_at as target_start_at
    from public.makeup_links ml
    join public.class_sessions target
      on target.id = ml.target_session_id and target.owner_id = ml.owner_id
    join public.attendance_records target_attendance
      on target_attendance.owner_id = ml.owner_id
      and target_attendance.session_id = ml.target_session_id
      and target_attendance.student_id = ml.student_id
      and target_attendance.status = 'valid'
    where ml.owner_id = v_owner_id and ml.link_type = 'makeup'
      and ml.source_session_id = v_session.id and ml.student_id = roster.student_id
    order by target_attendance.captured_at desc limit 1
  ) made_up on roster.participation_type = 'regular' and ar.id is null
  order by s.name, s.school_class nulls last, s.id;
end;
$$;

-- Extend the existing signature transaction without adding a second signing
-- path. A temporary registration is a regular roster participation.
create or replace function public.record_attendance(
  p_session_id uuid,
  p_student_id uuid,
  p_signature_path text,
  p_client_request_id uuid,
  p_captured_at timestamptz,
  p_use_device_captured_at boolean
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
  v_session_date date;
  v_expected_path text;
  v_link public.makeup_links;
  v_participation_type text;
  v_signing_type text;
  v_signature_size bigint;
  v_captured_at timestamptz;
  v_synced_at timestamptz := now();
  v_capture_source text;
  v_existing public.attendance_records;
  v_result public.attendance_records;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  select * into v_existing from public.attendance_records
  where owner_id = v_owner_id and client_request_id = p_client_request_id;
  if found then
    if v_existing.session_id <> p_session_id or v_existing.student_id <> p_student_id
      or v_existing.signature_path <> p_signature_path then
      raise exception 'Idempotency key does not match attendance request';
    end if;
    return v_existing;
  end if;

  select * into v_session from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id for update;
  if not found or v_session.status not in ('scheduled', 'completed') then
    raise exception 'Session is not available for attendance';
  end if;

  v_session_date := (v_session.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;
  if (v_synced_at at time zone 'Asia/Kuala_Lumpur')::date < v_session_date then
    raise exception 'Future Session cannot be signed';
  end if;
  if p_captured_at is null then raise exception 'Captured time is required'; end if;
  if coalesce(p_use_device_captured_at, false) or p_captured_at < v_synced_at - interval '2 minutes' then
    if p_captured_at > v_synced_at + interval '5 minutes' then
      raise exception 'Device captured time is too far in the future';
    end if;
    v_captured_at := p_captured_at;
    v_capture_source := 'device_offline';
  else
    v_captured_at := v_synced_at;
    v_capture_source := 'server';
  end if;
  if (v_captured_at at time zone 'Asia/Kuala_Lumpur')::date < v_session_date then
    raise exception 'Signature was captured before the Session date';
  end if;

  v_expected_path := v_owner_id::text || '/' || p_session_id::text || '/'
    || p_student_id::text || '/' || p_client_request_id::text || '.png';
  if p_signature_path <> v_expected_path then raise exception 'Invalid signature path'; end if;
  select nullif(metadata->>'size', '')::bigint into v_signature_size
  from storage.objects where bucket_id = 'signatures' and name = p_signature_path;
  if not found then raise exception 'Signature file has not been uploaded'; end if;

  if v_session.session_type = 'temporary' and exists (
    select 1 from public.temporary_class_enrollments e
    where e.owner_id = v_owner_id and e.student_id = p_student_id
      and e.temporary_class_id = v_session.temporary_class_id
  ) then
    v_participation_type := 'regular';
  elsif v_session.session_type <> 'temporary' and exists (
    select 1 from public.enrollments e
    where e.owner_id = v_owner_id and e.student_id = p_student_id
      and e.class_id = v_session.class_id and e.join_date <= v_session_date
      and (e.end_date is null or e.end_date >= v_session_date)
  ) then
    v_participation_type := 'regular';
  elsif v_session.session_type <> 'temporary' then
    select * into v_link from public.makeup_links
    where owner_id = v_owner_id and target_session_id = v_session.id
      and student_id = p_student_id;
    if not found then raise exception 'Student is not in this Session roster'; end if;
    v_participation_type := v_link.link_type;
  else
    raise exception 'Student is not in this Session roster';
  end if;

  if exists (
    select 1 from public.attendance_records existing_valid
    where existing_valid.owner_id = v_owner_id and existing_valid.session_id = v_session.id
      and existing_valid.student_id = p_student_id and existing_valid.status = 'valid'
  ) then raise exception 'Student already has a valid attendance record'; end if;

  v_signing_type := case
    when (v_captured_at at time zone 'Asia/Kuala_Lumpur')::date > v_session_date then 'backfill'
    else 'checkin'
  end;
  insert into public.attendance_records (
    owner_id, student_id, session_id, makeup_link_id, client_request_id,
    participation_type, signing_type, captured_at, synced_at, capture_source,
    signature_path, signature_byte_size
  ) values (
    v_owner_id, p_student_id, v_session.id, v_link.id, p_client_request_id,
    v_participation_type, v_signing_type, v_captured_at, v_synced_at,
    v_capture_source, p_signature_path, v_signature_size
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.restore_class_session(p_session_id uuid)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.class_sessions;
begin
  select * into v_session from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id for update;
  if not found or v_session.status <> 'cancelled' then raise exception 'Stopped session not found'; end if;
  if v_session.session_type = 'temporary' then
    if not exists (
      select 1 from public.temporary_classes
      where id = v_session.temporary_class_id and owner_id = v_owner_id and status = 'active'
    ) then raise exception 'Active temporary class not found'; end if;
  elsif not exists (
    select 1 from public.classes
    where id = v_session.class_id and owner_id = v_owner_id and status = 'active'
  ) then raise exception 'Active class not found'; end if;

  update public.class_sessions set status = 'scheduled', cancelled_at = null
  where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;

-- Temporary times are edited from the temporary class transaction so the
-- class record and Session cannot drift apart.
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
  select * into v_session from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id for update;
  if not found or v_session.status <> 'scheduled' then raise exception 'Scheduled session not found'; end if;
  if v_session.session_type = 'temporary' then
    raise exception 'Edit temporary class time from the temporary class page';
  end if;
  if exists (
    select 1 from public.attendance_records
    where owner_id = v_owner_id and session_id = v_session.id and status = 'valid'
  ) then raise exception 'Session with valid attendance cannot be rescheduled'; end if;
  if p_new_end_at <= p_new_start_at then raise exception 'New end time must be after start time'; end if;
  if p_new_start_at = v_session.current_start_at and p_new_end_at = v_session.current_end_at then
    raise exception 'New schedule is unchanged';
  end if;
  insert into public.session_schedule_changes (
    owner_id, session_id, old_start_at, old_end_at, new_start_at, new_end_at
  ) values (
    v_owner_id, v_session.id, v_session.current_start_at, v_session.current_end_at,
    p_new_start_at, p_new_end_at
  );
  update public.class_sessions
  set current_start_at = p_new_start_at, current_end_at = p_new_end_at
  where id = v_session.id returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.create_temporary_class(uuid, text, date, time, time, numeric) from public, anon;
revoke all on function public.update_temporary_class(uuid, uuid, text, date, time, time, numeric) from public, anon;
revoke all on function public.add_student_to_temporary_class(uuid, uuid) from public, anon;
revoke all on function public.create_student_for_temporary_class(uuid, text, text, text) from public, anon;
revoke all on function public.mark_temporary_class_payment_paid(uuid) from public, anon;
revoke all on function public.undo_temporary_class_payment(uuid) from public, anon;
revoke all on function public.end_temporary_class(uuid) from public, anon;
revoke all on function public.complete_receipts(text[]) from public, anon;
revoke all on function public.restore_receipt(text) from public, anon;

grant execute on function public.create_temporary_class(uuid, text, date, time, time, numeric) to authenticated;
grant execute on function public.update_temporary_class(uuid, uuid, text, date, time, time, numeric) to authenticated;
grant execute on function public.add_student_to_temporary_class(uuid, uuid) to authenticated;
grant execute on function public.create_student_for_temporary_class(uuid, text, text, text) to authenticated;
grant execute on function public.mark_temporary_class_payment_paid(uuid) to authenticated;
grant execute on function public.undo_temporary_class_payment(uuid) to authenticated;
grant execute on function public.end_temporary_class(uuid) to authenticated;
grant execute on function public.complete_receipts(text[]) to authenticated;
grant execute on function public.restore_receipt(text) to authenticated;
