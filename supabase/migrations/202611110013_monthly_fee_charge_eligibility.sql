-- Monthly charge eligibility / explicit single-month cancellation.
-- No backfill, row deletion, RLS change or modification of payment history.
begin;
alter table public.monthly_fees add column billing_cancelled_at timestamptz;
alter table public.monthly_fees add constraint monthly_fee_cancelled_unpaid_check
  check (billing_cancelled_at is null or payment_status = 'unpaid');

-- All related RPC entry points acquire this lock BEFORE row locks.
create function public.lock_monthly_billing(p_owner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('monthly-billing:' || p_owner_id::text, 0));
end; $$;
revoke all on function public.lock_monthly_billing(uuid) from public, anon, authenticated;

create function public.monthly_fee_inapplicable_reason(p_enrollment_id uuid, p_owner_id uuid, p_month date)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when e.end_date < p_month then '报读已结束，此月不适用'
    when e.join_date >= (p_month + interval '1 month')::date then '报读尚未生效，此月不适用'
    when c.end_date < p_month then '班级已结束，此月不适用'
    when c.start_date >= (p_month + interval '1 month')::date then '班级尚未开始，此月不适用'
    when e.transferred_from_enrollment_id is not null
      and date_trunc('month', e.join_date)::date = p_month
      and exists(select 1 from public.enrollments previous where previous.id=e.transferred_from_enrollment_id and previous.owner_id=p_owner_id and date_trunc('month',previous.end_date)::date=p_month)
      then '转班当月由原报读收费'
    else null end
  from public.enrollments e join public.classes c on c.id=e.class_id and c.owner_id=e.owner_id
  where e.id=p_enrollment_id and e.owner_id=p_owner_id;
$$;
revoke all on function public.monthly_fee_inapplicable_reason(uuid,uuid,date) from public, anon, authenticated;

create function public.cancel_monthly_fee_charge(p_fee_id uuid) returns public.monthly_fees
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_fee public.monthly_fees;
begin
  perform public.lock_monthly_billing(v_owner);
  select * into v_fee from public.monthly_fees where id=p_fee_id and owner_id=v_owner for update;
  if not found then raise exception 'Monthly fee not found'; end if;
  if v_fee.payment_status <> 'unpaid' then raise exception '仅可取消未缴学费'; end if;
  if v_fee.billing_cancelled_at is not null then return v_fee; end if;
  if public.monthly_fee_inapplicable_reason(v_fee.enrollment_id,v_owner,v_fee.fee_month) is not null then raise exception '此月已不适用，无需手动取消收费'; end if;
  update public.monthly_fees set billing_cancelled_at=now() where id=p_fee_id returning * into v_fee;
  perform public.phase5_write_activity(v_owner,'monthly_fee_charge_cancelled','monthly_fee',v_fee.id,to_char(v_fee.fee_month,'YYYY-MM') || ' 取消此月收费');
  return v_fee;
end; $$;

create function public.restore_monthly_fee_charge(p_fee_id uuid) returns public.monthly_fees
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_fee public.monthly_fees;
begin
  perform public.lock_monthly_billing(v_owner);
  select * into v_fee from public.monthly_fees where id=p_fee_id and owner_id=v_owner for update;
  if not found then raise exception 'Monthly fee not found'; end if;
  if v_fee.payment_status <> 'unpaid' then raise exception '仅可恢复手动取消的未缴学费'; end if;
  if public.monthly_fee_inapplicable_reason(v_fee.enrollment_id,v_owner,v_fee.fee_month) is not null then raise exception '此月不符合收费资格，不能恢复收费'; end if;
  -- Repeated restore is a no-op and never changes money or creates a record.
  if v_fee.billing_cancelled_at is null then
    if exists(select 1 from public.activity_logs where owner_id=v_owner and entity_id=v_fee.id and action_type='monthly_fee_charge_restored') then return v_fee; end if;
    raise exception '此笔费用并非手动取消收费';
  end if;
  update public.monthly_fees set billing_cancelled_at=null where id=p_fee_id returning * into v_fee;
  perform public.phase5_write_activity(v_owner,'monthly_fee_charge_restored','monthly_fee',v_fee.id,to_char(v_fee.fee_month,'YYYY-MM') || ' 恢复收费');
  return v_fee;
end; $$;
revoke all on function public.cancel_monthly_fee_charge(uuid), public.restore_monthly_fee_charge(uuid) from public, anon;
grant execute on function public.cancel_monthly_fee_charge(uuid), public.restore_monthly_fee_charge(uuid) to authenticated;

-- Statement triggers acquire the same lock before direct metadata row locks.
-- They do not read/write business rows or generate fees.
create function public.lock_monthly_billing_statement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then perform public.lock_monthly_billing(auth.uid()); end if;
  return null;
end; $$;
revoke all on function public.lock_monthly_billing_statement() from public, anon, authenticated;
create trigger enrollments_monthly_billing_lock before insert or update or delete on public.enrollments
  for each statement execute function public.lock_monthly_billing_statement();
create trigger classes_monthly_billing_lock before update on public.classes
  for each statement execute function public.lock_monthly_billing_statement();

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
  perform public.lock_monthly_billing(p_owner_id);
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
  perform public.lock_monthly_billing(v_owner_id);
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
  perform public.lock_monthly_billing(v_owner_id);
  if p_actual_amount is null or p_actual_amount < 0 then
    raise exception 'Invalid monthly fee amount';
  end if;

  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  if v_fee.payment_status = 'unpaid' and (v_fee.billing_cancelled_at is not null
    or public.monthly_fee_inapplicable_reason(v_fee.enrollment_id,v_owner_id,v_fee.fee_month) is not null) then
    raise exception '此月收费已取消或不适用，请刷新核对';
  end if;
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
  perform public.lock_monthly_billing(v_owner_id);
  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  if v_fee.payment_status = 'unpaid' and (v_fee.billing_cancelled_at is not null
    or public.monthly_fee_inapplicable_reason(v_fee.enrollment_id,v_owner_id,v_fee.fee_month) is not null) then
    raise exception '此月收费已取消或不适用，请刷新核对';
  end if;
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
  perform public.lock_monthly_billing(v_owner_id);
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
  perform public.lock_monthly_billing(v_owner_id);
  select * into v_fee
  from public.monthly_fees
  where id = p_fee_id and owner_id = v_owner_id
  for update;

  if not found then raise exception 'Monthly fee not found'; end if;
  if v_fee.payment_status = 'unpaid' and (v_fee.billing_cancelled_at is not null
    or public.monthly_fee_inapplicable_reason(v_fee.enrollment_id,v_owner_id,v_fee.fee_month) is not null) then
    raise exception '此月收费已取消或不适用，请刷新核对';
  end if;
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
  perform public.lock_monthly_billing(v_owner_id);
  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment_id and owner_id = v_owner_id
  for update;

  if not found or v_enrollment.status <> 'active' then
    raise exception 'Active enrollment not found';
  end if;
  select name into v_student_name from public.students
  where id = v_enrollment.student_id and owner_id = v_owner_id;
  if p_end_date is null then raise exception 'End date required'; end if;
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
      and billing_cancelled_at is null
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
  perform public.lock_monthly_billing(v_owner_id);
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
  -- fee for the month. Keep that record and derive inapplicability because the
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
      -- Retain the original fee; the ended source month is now inapplicable.
      null;
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

create or replace function public.create_enrollment(
  p_student_id uuid,
  p_class_id uuid,
  p_join_date date
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.classes;
  v_result public.enrollments;
begin
  perform public.lock_monthly_billing(v_owner_id);
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.students
    where id = p_student_id and owner_id = v_owner_id
  ) then
    raise exception 'Student not found';
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id and owner_id = v_owner_id;

  if not found or v_class.status <> 'active' then
    raise exception 'Active class not found';
  end if;

  if p_join_date < v_class.start_date then
    raise exception 'Join date cannot be before class start date';
  end if;

  insert into public.enrollments (owner_id, student_id, class_id, join_date)
  values (v_owner_id, p_student_id, p_class_id, p_join_date)
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.end_enrollment(
  p_enrollment_id uuid,
  p_end_date date
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_enrollment public.enrollments;
begin
  perform public.lock_monthly_billing(v_owner_id);
  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment_id and owner_id = v_owner_id
  for update;

  if not found or v_enrollment.status <> 'active' then
    raise exception 'Active enrollment not found';
  end if;

  if p_end_date is null then raise exception 'End date required'; end if;
  if p_end_date < v_enrollment.join_date then
    raise exception 'End date cannot be before join date';
  end if;

  update public.enrollments
  set status = 'ended', end_date = p_end_date
  where id = p_enrollment_id
  returning * into v_enrollment;

  return v_enrollment;
end;
$$;

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
  perform public.lock_monthly_billing(v_owner_id);
  select * into v_class
  from public.classes
  where id = p_class_id and owner_id = v_owner_id
  for update;

  if not found or v_class.status <> 'active' then
    raise exception 'Active class not found';
  end if;

  if p_end_date is null then raise exception 'End date required'; end if;
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

  update public.classes
  set status = 'ended', end_date = p_end_date
  where id = p_class_id
  returning * into v_class;

  return v_class;
end;
$$;

-- R1: retain the original permanent-deletion contract, unify only lock order.
create or replace function public.ui51_permanently_delete_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_preview jsonb;
  v_expected_name text;
  v_child jsonb;
  v_paths jsonb := '[]'::jsonb;
  v_record record;
  v_enrollment_ids uuid[];
  v_makeup_ids uuid[];
  v_attendance_ids uuid[];
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  v_preview := public.ui51_preview_permanent_delete(p_entity_type, p_entity_id);
  v_expected_name := v_preview->>'entity_name';
  if p_confirmation_name is null or btrim(p_confirmation_name) <> v_expected_name then
    raise exception 'Confirmation name does not match';
  end if;

  -- Acquire the shared owner lock before ANY business row lock or deletion.
  -- The protected preview above has already checked ownership and confirmation.
  if p_entity_type in ('student', 'class', 'subject') then
    perform public.lock_monthly_billing(v_owner_id);
  end if;

  case p_entity_type
    when 'student' then
      select coalesce(array_agg(id), array[]::uuid[]) into v_enrollment_ids
      from public.enrollments where owner_id = v_owner_id and student_id = p_entity_id;
      select coalesce(array_agg(id), array[]::uuid[]) into v_makeup_ids
      from public.makeup_links where owner_id = v_owner_id and (student_id = p_entity_id or source_enrollment_id = any(v_enrollment_ids));
      select coalesce(array_agg(id), array[]::uuid[]) into v_attendance_ids
      from public.attendance_records where owner_id = v_owner_id and (student_id = p_entity_id or makeup_link_id = any(v_makeup_ids));
      select coalesce(jsonb_agg(signature_path order by signature_path), '[]'::jsonb) into v_paths
      from public.attendance_records where owner_id = v_owner_id and id = any(v_attendance_ids);
      delete from public.activity_logs where owner_id = v_owner_id and (
        entity_id = p_entity_id
        or entity_id = any(v_enrollment_ids)
        or entity_id in (select id from public.monthly_fees where owner_id = v_owner_id and student_id = p_entity_id)
        or entity_id in (select p.id from public.temporary_class_payments p join public.temporary_class_enrollments e on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id where p.owner_id = v_owner_id and e.student_id = p_entity_id)
      );
      delete from public.attendance_corrections where owner_id = v_owner_id and attendance_record_id = any(v_attendance_ids);
      delete from public.attendance_records where owner_id = v_owner_id and id = any(v_attendance_ids);
      delete from public.makeup_links where owner_id = v_owner_id and id = any(v_makeup_ids);
      delete from public.school_exam_scores where owner_id = v_owner_id and student_id = p_entity_id;
      delete from public.tuition_quiz_scores where owner_id = v_owner_id and student_id = p_entity_id;
      delete from public.monthly_fees where owner_id = v_owner_id and student_id = p_entity_id;
      delete from public.temporary_class_payments where owner_id = v_owner_id and temporary_class_enrollment_id in (select id from public.temporary_class_enrollments where owner_id = v_owner_id and student_id = p_entity_id);
      delete from public.temporary_class_enrollments where owner_id = v_owner_id and student_id = p_entity_id;
      update public.enrollments set transferred_from_enrollment_id = null where owner_id = v_owner_id and transferred_from_enrollment_id = any(v_enrollment_ids);
      delete from public.enrollments where owner_id = v_owner_id and id = any(v_enrollment_ids);
      delete from public.students where owner_id = v_owner_id and id = p_entity_id;

    when 'class' then
      v_child := public.ui51_delete_class_data(v_owner_id, p_entity_id);
      v_paths := coalesce(v_child->'signature_paths', '[]'::jsonb);

    when 'temporary_class' then
      v_child := public.ui51_delete_temporary_class_data(v_owner_id, p_entity_id);
      v_paths := coalesce(v_child->'signature_paths', '[]'::jsonb);

    when 'school_exam' then
      delete from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id;
      delete from public.school_exam_scores where owner_id = v_owner_id and exam_id = p_entity_id;
      delete from public.school_exams where owner_id = v_owner_id and id = p_entity_id;

    when 'tuition_quiz' then
      delete from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id;
      delete from public.tuition_quiz_scores where owner_id = v_owner_id and quiz_id = p_entity_id;
      delete from public.tuition_quizzes where owner_id = v_owner_id and id = p_entity_id;

    when 'subject' then
      for v_record in select id from public.classes where owner_id = v_owner_id and subject_id = p_entity_id loop
        v_child := public.ui51_delete_class_data(v_owner_id, v_record.id);
        v_paths := v_paths || coalesce(v_child->'signature_paths', '[]'::jsonb);
      end loop;
      for v_record in select id from public.temporary_classes where owner_id = v_owner_id and subject_id = p_entity_id loop
        v_child := public.ui51_delete_temporary_class_data(v_owner_id, v_record.id);
        v_paths := v_paths || coalesce(v_child->'signature_paths', '[]'::jsonb);
      end loop;
      delete from public.activity_logs where owner_id = v_owner_id and (
        entity_id = p_entity_id or entity_id in (select id from public.school_exams where owner_id = v_owner_id and subject_id = p_entity_id)
      );
      delete from public.school_exam_scores where owner_id = v_owner_id and exam_id in (select id from public.school_exams where owner_id = v_owner_id and subject_id = p_entity_id);
      delete from public.school_exams where owner_id = v_owner_id and subject_id = p_entity_id;
      delete from public.subjects where owner_id = v_owner_id and id = p_entity_id;

    else
      raise exception 'Unsupported permanent deletion type';
  end case;

  select coalesce(jsonb_agg(distinct value order by value), '[]'::jsonb) into v_paths
  from jsonb_array_elements_text(v_paths);
  return v_preview || jsonb_build_object('signature_paths', v_paths, 'deleted', true);
end;
$$;

notify pgrst, 'reload schema';
commit;
