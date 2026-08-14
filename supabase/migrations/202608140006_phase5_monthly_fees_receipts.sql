-- Phase 5: regular-class monthly fees and the pending receipt queue.
--
-- Temporary-class payments are intentionally excluded. All money-changing
-- operations go through RPCs so payment and receipt states remain consistent.

alter table public.enrollments
  add column transferred_from_enrollment_id uuid;

alter table public.enrollments
  add constraint enrollments_id_owner_student_unique unique (id, owner_id, student_id),
  add constraint enrollments_transfer_source_owner_fk
    foreign key (transferred_from_enrollment_id, owner_id)
    references public.enrollments(id, owner_id)
    on delete restrict;

create unique index enrollments_one_transfer_successor
  on public.enrollments (transferred_from_enrollment_id)
  where transferred_from_enrollment_id is not null;

-- The production preflight found exactly one Phase 2 transfer. It was
-- confirmed from the real acceptance flow: 庄闵浩 moved from 高一会计学（1）
-- to 高一会计学（2） on 2026-09-15. Backfill only this exact relationship and
-- fail if any ownership, student, subject, or date fact no longer matches.
do $$
declare
  v_updated integer;
begin
  update public.enrollments successor
  set transferred_from_enrollment_id = previous.id
  from public.enrollments previous,
       public.classes previous_class,
       public.classes successor_class
  where previous.id = '45f8a1a9-6e10-42f2-9bc8-1a36936eafd8'::uuid
    and successor.id = 'f60ec161-54bd-4959-b99a-32e6c946dd90'::uuid
    and successor.owner_id = previous.owner_id
    and successor.student_id = previous.student_id
    and previous_class.id = previous.class_id
    and previous_class.owner_id = previous.owner_id
    and successor.class_id = successor_class.id
    and successor_class.owner_id = successor.owner_id
    and successor_class.subject_id = previous_class.subject_id
    and successor.class_id <> previous.class_id
    and previous.status = 'ended'
    and previous.join_date = '2026-09-01'::date
    and previous.end_date = '2026-09-14'::date
    and successor.join_date = '2026-09-15'::date
    and successor.transferred_from_enrollment_id is null;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'PHASE5_CONFIRMED_TRANSFER_BACKFILL_FAILED';
  end if;

  -- Phase 2 did not otherwise record how an adjacent pair was created. Any
  -- additional candidate needs a separate human confirmation; never guess.
  if exists (
    select 1
    from public.enrollments other_previous
    join public.enrollments other_successor
      on other_successor.owner_id = other_previous.owner_id
      and other_successor.student_id = other_previous.student_id
      and other_successor.class_id <> other_previous.class_id
      and other_successor.join_date = other_previous.end_date + 1
    join public.classes other_previous_class
      on other_previous_class.id = other_previous.class_id
      and other_previous_class.owner_id = other_previous.owner_id
    join public.classes other_successor_class
      on other_successor_class.id = other_successor.class_id
      and other_successor_class.owner_id = other_successor.owner_id
      and other_successor_class.subject_id = other_previous_class.subject_id
    where other_previous.status = 'ended'
      and other_previous.end_date is not null
      and other_successor.transferred_from_enrollment_id is null
  ) then
    raise exception 'PHASE5_HISTORICAL_TRANSFER_REVIEW_REQUIRED';
  end if;
end;
$$;

create table public.monthly_fees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null,
  enrollment_id uuid not null,
  fee_month date not null,
  normal_amount numeric(10, 2) not null check (normal_amount >= 0),
  actual_amount numeric(10, 2) not null check (actual_amount >= 0),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'waived')),
  paid_at timestamptz,
  receipt_status text not null default 'not_applicable'
    check (receipt_status in ('not_applicable', 'pending', 'completed')),
  receipt_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint monthly_fees_enrollment_owner_student_fk
    foreign key (enrollment_id, owner_id, student_id)
    references public.enrollments(id, owner_id, student_id)
    on delete restrict,
  constraint monthly_fees_month_start_check
    check (fee_month = date_trunc('month', fee_month)::date),
  constraint monthly_fees_payment_receipt_state_check check (
    (payment_status in ('unpaid', 'waived')
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

create unique index monthly_fees_one_enrollment_month
  on public.monthly_fees (enrollment_id, fee_month);

create index monthly_fees_owner_month_classification_idx
  on public.monthly_fees (owner_id, fee_month desc, payment_status);

create index monthly_fees_pending_receipts_idx
  on public.monthly_fees (owner_id, fee_month, paid_at)
  where payment_status = 'paid' and receipt_status = 'pending';

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null check (btrim(action_type) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  description text not null check (btrim(description) <> ''),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index activity_logs_owner_created_idx
  on public.activity_logs (owner_id, created_at desc);

create trigger monthly_fees_set_updated_at
  before update on public.monthly_fees
  for each row execute procedure public.set_updated_at();

alter table public.monthly_fees enable row level security;
alter table public.activity_logs enable row level security;

create policy "Users can read their own monthly fees"
  on public.monthly_fees for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own activity logs"
  on public.activity_logs for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.monthly_fees to authenticated;
grant select on public.activity_logs to authenticated;

revoke all on public.monthly_fees from anon;
revoke all on public.activity_logs from anon;

create or replace function public.phase5_write_activity(
  p_owner_id uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_logs (
    owner_id, action_type, entity_type, entity_id, description
  ) values (
    p_owner_id, p_action_type, p_entity_type, p_entity_id, p_description
  );
end;
$$;

revoke all on function public.phase5_write_activity(uuid, text, text, uuid, text)
  from public, anon, authenticated;

create or replace function public.phase5_ensure_fees_for_owner(
  p_owner_id uuid,
  p_from_month date,
  p_to_month date,
  p_class_id uuid default null,
  p_amount_override numeric default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  with requested_months as (
    select value::date as fee_month
    from generate_series(
      date_trunc('month', p_from_month)::date,
      date_trunc('month', p_to_month)::date,
      interval '1 month'
    ) value
  ), candidates as (
    select
      e.owner_id,
      e.student_id,
      e.id as enrollment_id,
      m.fee_month,
      coalesce(p_amount_override, c.monthly_fee) as amount
    from public.enrollments e
    join public.classes c
      on c.id = e.class_id and c.owner_id = e.owner_id
    cross join requested_months m
    where e.owner_id = p_owner_id
      and (p_class_id is null or e.class_id = p_class_id)
      and e.join_date <= (m.fee_month + interval '1 month' - interval '1 day')::date
      and (e.end_date is null or e.end_date >= m.fee_month)
      and c.start_date <= (m.fee_month + interval '1 month' - interval '1 day')::date
      and (c.end_date is null or c.end_date >= m.fee_month)
      -- Mid-month transfer: the previous enrollment owns this month's fee and
      -- the successor starts billing next month. On day 1, the previous end
      -- date belongs to the prior month, so the successor is billed normally.
      and not (
        e.transferred_from_enrollment_id is not null
        and date_trunc('month', e.join_date)::date = m.fee_month
        and exists (
          select 1
          from public.enrollments previous
          where previous.id = e.transferred_from_enrollment_id
            and previous.owner_id = e.owner_id
            and date_trunc('month', previous.end_date)::date = m.fee_month
        )
      )
  )
  insert into public.monthly_fees (
    owner_id, student_id, enrollment_id, fee_month, normal_amount, actual_amount
  )
  select owner_id, student_id, enrollment_id, fee_month, amount, amount
  from candidates
  on conflict (enrollment_id, fee_month) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.phase5_ensure_fees_for_owner(uuid, date, date, uuid, numeric)
  from public, anon, authenticated;

create or replace function public.ensure_monthly_fees(
  p_from_month date,
  p_to_month date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_from date := date_trunc('month', p_from_month)::date;
  v_to date := date_trunc('month', p_to_month)::date;
  v_created integer;
  v_current_month date := date_trunc(
    'month', now() at time zone 'Asia/Kuala_Lumpur'
  )::date;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_from_month is null or p_to_month is null or v_to < v_from then
    raise exception 'Invalid fee month range';
  end if;

  if v_to > (v_from + interval '600 months')::date then
    raise exception 'Fee month range is too large';
  end if;

  if v_to > v_current_month then
    raise exception 'Future monthly fees cannot be generated';
  end if;

  v_created := public.phase5_ensure_fees_for_owner(
    v_owner_id, v_from, v_to, null, null
  );

  return v_created;
end;
$$;

create or replace function public.phase5_snapshot_fees_before_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_month date := date_trunc(
    'month', now() at time zone 'Asia/Kuala_Lumpur'
  )::date;
begin
  if new.monthly_fee is distinct from old.monthly_fee then
    perform public.phase5_ensure_fees_for_owner(
      old.owner_id,
      date_trunc('month', old.start_date)::date,
      v_current_month,
      old.id,
      old.monthly_fee
    );
  end if;
  return new;
end;
$$;

revoke all on function public.phase5_snapshot_fees_before_price_change()
  from public, anon, authenticated;

create trigger classes_snapshot_fees_before_price_change
  before update of monthly_fee on public.classes
  for each row
  when (new.monthly_fee is distinct from old.monthly_fee)
  execute procedure public.phase5_snapshot_fees_before_price_change();

create or replace function public.update_monthly_fee_amount(
  p_fee_id uuid,
  p_actual_amount numeric
)
returns public.monthly_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_fee public.monthly_fees;
  v_student_name text;
begin
  if p_actual_amount is null or p_actual_amount < 0 then
    raise exception 'Invalid monthly fee amount';
  end if;

  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  select name into v_student_name from public.students
  where id = v_fee.student_id and owner_id = v_owner_id;
  if v_fee.payment_status <> 'unpaid' then
    raise exception 'Only unpaid monthly fees can be changed';
  end if;
  if v_fee.actual_amount = p_actual_amount then return v_fee; end if;

  update public.monthly_fees
  set actual_amount = p_actual_amount
  where id = p_fee_id
  returning * into v_fee;

  perform public.phase5_write_activity(
    v_owner_id, 'monthly_fee_amount_changed', 'monthly_fee', v_fee.id,
    v_student_name || ' ' || to_char(v_fee.fee_month, 'YYYY-MM')
      || ' 学费金额修改为 RM' || trim(to_char(v_fee.actual_amount, 'FM999999990.00'))
  );
  return v_fee;
end;
$$;

create or replace function public.mark_monthly_fee_paid(p_fee_id uuid)
returns public.monthly_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_fee public.monthly_fees;
  v_student_name text;
begin
  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  select name into v_student_name from public.students
  where id = v_fee.student_id and owner_id = v_owner_id;
  if v_fee.payment_status = 'waived' then
    raise exception 'Waived monthly fee cannot be marked paid';
  end if;
  if v_fee.payment_status = 'paid' then return v_fee; end if;

  update public.monthly_fees
  set payment_status = 'paid',
      paid_at = now(),
      receipt_status = 'pending',
      receipt_completed_at = null
  where id = p_fee_id
  returning * into v_fee;

  perform public.phase5_write_activity(
    v_owner_id, 'monthly_fee_paid', 'monthly_fee', v_fee.id,
    v_student_name || ' ' || to_char(v_fee.fee_month, 'YYYY-MM') || ' 学费 → 已缴'
  );
  return v_fee;
end;
$$;

create or replace function public.undo_monthly_fee_payment(p_fee_id uuid)
returns public.monthly_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_fee public.monthly_fees;
  v_student_name text;
begin
  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  select name into v_student_name from public.students
  where id = v_fee.student_id and owner_id = v_owner_id;
  if v_fee.payment_status = 'unpaid' then return v_fee; end if;
  if v_fee.payment_status <> 'paid' then
    raise exception 'Only paid monthly fees can be undone';
  end if;

  update public.monthly_fees
  set payment_status = 'unpaid',
      paid_at = null,
      receipt_status = 'not_applicable',
      receipt_completed_at = null
  where id = p_fee_id
  returning * into v_fee;

  perform public.phase5_write_activity(
    v_owner_id, 'monthly_fee_payment_undone', 'monthly_fee', v_fee.id,
    v_student_name || ' ' || to_char(v_fee.fee_month, 'YYYY-MM') || ' 学费 → 撤销缴费'
  );
  return v_fee;
end;
$$;

create or replace function public.waive_monthly_fee(p_fee_id uuid)
returns public.monthly_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_fee public.monthly_fees;
  v_enrollment public.enrollments;
  v_student_name text;
begin
  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  select name into v_student_name from public.students
  where id = v_fee.student_id and owner_id = v_owner_id;
  if v_fee.payment_status = 'waived' then return v_fee; end if;
  if v_fee.payment_status <> 'unpaid' then
    raise exception 'Only unpaid monthly fees can be waived';
  end if;

  select * into v_enrollment
  from public.enrollments
  where id = v_fee.enrollment_id and owner_id = v_owner_id;

  if v_enrollment.status <> 'ended'
    or date_trunc('month', v_enrollment.end_date)::date <> v_fee.fee_month then
    raise exception 'Only the final month of an ended enrollment can be waived';
  end if;

  update public.monthly_fees
  set payment_status = 'waived',
      paid_at = null,
      receipt_status = 'not_applicable',
      receipt_completed_at = null
  where id = p_fee_id
  returning * into v_fee;

  perform public.phase5_write_activity(
    v_owner_id, 'monthly_fee_waived', 'monthly_fee', v_fee.id,
    v_student_name || ' ' || to_char(v_fee.fee_month, 'YYYY-MM') || ' 学费 → 本月不再追缴'
  );
  return v_fee;
end;
$$;

create or replace function public.complete_monthly_fee_receipts(p_fee_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_requested integer;
  v_found integer;
  v_updated integer;
begin
  select count(*)::integer into v_requested
  from (select distinct unnest(p_fee_ids) as id) requested;

  if v_requested = 0 then return 0; end if;

  select count(*)::integer into v_found
  from public.monthly_fees f
  join (select distinct unnest(p_fee_ids) as id) requested on requested.id = f.id
  where f.owner_id = v_owner_id and f.payment_status = 'paid';

  if v_found <> v_requested then
    raise exception 'One or more paid monthly fees were not found';
  end if;

  perform 1
  from public.monthly_fees f
  join (select distinct unnest(p_fee_ids) as id) requested on requested.id = f.id
  where f.owner_id = v_owner_id
  for update of f;

  update public.monthly_fees
  set receipt_status = 'completed', receipt_completed_at = now()
  where owner_id = v_owner_id
    and id = any(p_fee_ids)
    and payment_status = 'paid'
    and receipt_status = 'pending';
  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    perform public.phase5_write_activity(
      v_owner_id, 'monthly_fee_receipts_completed', 'monthly_fee', null,
      '批量标记 ' || v_updated || ' 张收据已处理'
    );
  end if;
  return v_updated;
end;
$$;

create or replace function public.restore_monthly_fee_receipt(p_fee_id uuid)
returns public.monthly_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_fee public.monthly_fees;
  v_student_name text;
begin
  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  select name into v_student_name from public.students
  where id = v_fee.student_id and owner_id = v_owner_id;
  if v_fee.payment_status <> 'paid' then
    raise exception 'Only paid monthly fees have receipt status';
  end if;
  if v_fee.receipt_status = 'pending' then return v_fee; end if;

  update public.monthly_fees
  set receipt_status = 'pending', receipt_completed_at = null
  where id = p_fee_id
  returning * into v_fee;

  perform public.phase5_write_activity(
    v_owner_id, 'monthly_fee_receipt_restored', 'monthly_fee', v_fee.id,
    v_student_name || ' ' || to_char(v_fee.fee_month, 'YYYY-MM') || ' 收据 → 待处理'
  );
  return v_fee;
end;
$$;

create or replace function public.end_enrollment_with_fee(
  p_enrollment_id uuid,
  p_end_date date,
  p_waive_final_month boolean default false
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_enrollment public.enrollments;
  v_fee_month date := date_trunc('month', p_end_date)::date;
  v_fee_id uuid;
  v_student_name text;
begin
  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment_id and owner_id = v_owner_id
  for update;

  if not found or v_enrollment.status <> 'active' then
    raise exception 'Active enrollment not found';
  end if;
  select name into v_student_name from public.students
  where id = v_enrollment.student_id and owner_id = v_owner_id;
  if p_end_date < v_enrollment.join_date then
    raise exception 'End date cannot be before join date';
  end if;

  perform public.phase5_ensure_fees_for_owner(
    v_owner_id, v_fee_month, v_fee_month, v_enrollment.class_id, null
  );

  update public.enrollments
  set status = 'ended', end_date = p_end_date
  where id = p_enrollment_id
  returning * into v_enrollment;

  if p_waive_final_month then
    update public.monthly_fees
    set payment_status = 'waived',
        paid_at = null,
        receipt_status = 'not_applicable',
        receipt_completed_at = null
    where owner_id = v_owner_id
      and enrollment_id = p_enrollment_id
      and fee_month = v_fee_month
      and payment_status = 'unpaid'
    returning id into v_fee_id;

    if v_fee_id is null then
      raise exception 'Final monthly fee cannot be waived';
    end if;

    perform public.phase5_write_activity(
      v_owner_id, 'monthly_fee_waived', 'monthly_fee', v_fee_id,
      v_student_name || ' ' || to_char(v_fee_month, 'YYYY-MM') || ' 学费 → 本月不再追缴'
    );
  end if;

  return v_enrollment;
end;
$$;

-- Future transfers are explicitly linked so the transfer-month fee cannot be
-- silently doubled. The exact billing side remains a pre-deployment decision.
create or replace function public.transfer_enrollment(
  p_enrollment_id uuid,
  p_new_class_id uuid,
  p_transfer_date date
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_old public.enrollments;
  v_new_class public.classes;
  v_new public.enrollments;
  v_old_class public.classes;
  v_existing_fee public.monthly_fees;
begin
  select * into v_old
  from public.enrollments
  where id = p_enrollment_id and owner_id = v_owner_id
  for update;

  if not found or v_old.status <> 'active' then
    raise exception 'Active enrollment not found';
  end if;

  select * into v_new_class
  from public.classes
  where id = p_new_class_id and owner_id = v_owner_id;

  if not found or v_new_class.status <> 'active' then
    raise exception 'Active destination class not found';
  end if;

  if v_old.class_id = p_new_class_id then
    raise exception 'Destination class must be different';
  end if;

  select * into v_old_class
  from public.classes
  where id = v_old.class_id and owner_id = v_owner_id;

  if v_old_class.subject_id <> v_new_class.subject_id then
    raise exception 'Transfer classes must have the same subject';
  end if;

  if p_transfer_date <= v_old.join_date or p_transfer_date < v_new_class.start_date then
    raise exception 'Invalid transfer date';
  end if;

  -- A backdated day-1 transfer may find an automatically generated old-class
  -- fee for the month. An untouched unpaid record can be removed because the
  -- old enrollment was never valid in that month. Paid or waived history must
  -- be resolved first and is never silently moved or deleted.
  if extract(day from p_transfer_date) = 1 then
    select * into v_existing_fee
    from public.monthly_fees
    where owner_id = v_owner_id
      and enrollment_id = v_old.id
      and fee_month = date_trunc('month', p_transfer_date)::date
    for update;

    if found then
      if v_existing_fee.payment_status <> 'unpaid' then
        raise exception 'Transfer month already has a processed old enrollment fee';
      end if;
      delete from public.monthly_fees where id = v_existing_fee.id;
    end if;
  end if;

  update public.enrollments
  set status = 'ended', end_date = p_transfer_date - 1
  where id = v_old.id;

  insert into public.enrollments (
    owner_id, student_id, class_id, join_date, transferred_from_enrollment_id
  ) values (
    v_owner_id, v_old.student_id, p_new_class_id, p_transfer_date, v_old.id
  )
  returning * into v_new;

  return v_new;
end;
$$;

revoke all on function public.ensure_monthly_fees(date, date) from public, anon;
revoke all on function public.update_monthly_fee_amount(uuid, numeric) from public, anon;
revoke all on function public.mark_monthly_fee_paid(uuid) from public, anon;
revoke all on function public.undo_monthly_fee_payment(uuid) from public, anon;
revoke all on function public.waive_monthly_fee(uuid) from public, anon;
revoke all on function public.complete_monthly_fee_receipts(uuid[]) from public, anon;
revoke all on function public.restore_monthly_fee_receipt(uuid) from public, anon;
revoke all on function public.end_enrollment_with_fee(uuid, date, boolean) from public, anon;
revoke all on function public.transfer_enrollment(uuid, uuid, date) from public, anon;
revoke execute on function public.end_enrollment(uuid, date) from authenticated;

grant execute on function public.ensure_monthly_fees(date, date) to authenticated;
grant execute on function public.update_monthly_fee_amount(uuid, numeric) to authenticated;
grant execute on function public.mark_monthly_fee_paid(uuid) to authenticated;
grant execute on function public.undo_monthly_fee_payment(uuid) to authenticated;
grant execute on function public.waive_monthly_fee(uuid) to authenticated;
grant execute on function public.complete_monthly_fee_receipts(uuid[]) to authenticated;
grant execute on function public.restore_monthly_fee_receipt(uuid) to authenticated;
grant execute on function public.end_enrollment_with_fee(uuid, date, boolean) to authenticated;
grant execute on function public.transfer_enrollment(uuid, uuid, date) to authenticated;
