-- One enrollment cancellation / externally completed full refund. No historical
-- row rewrites or signature backfill. Install before the dependent frontend.
begin;

alter table public.temporary_class_enrollments
  add column cancelled_at timestamptz,
  add column cancel_request_id uuid,
  drop constraint temporary_class_enrollments_status_check,
  drop constraint temporary_class_enrollments_class_student_unique,
  add constraint temporary_enrollment_cancellation_check check (
    (status in ('active', 'ended') and cancelled_at is null and cancel_request_id is null)
    or (status = 'cancelled' and cancelled_at is not null and cancel_request_id is not null)
  );
create unique index temporary_enrollment_not_cancelled_unique
  on public.temporary_class_enrollments(temporary_class_id, student_id)
  where status <> 'cancelled';
create unique index temporary_enrollment_cancel_request_unique
  on public.temporary_class_enrollments(owner_id, cancel_request_id)
  where cancel_request_id is not null;

alter table public.temporary_class_payments
  add column refunded_amount numeric(10,2),
  add column refunded_at timestamptz,
  add constraint temporary_payment_refund_check check (
    (refunded_amount is null and refunded_at is null)
    or (refunded_amount is not null and refunded_at is not null
      and payment_status = 'paid' and refunded_amount = amount)
  );
-- New signatures only. Existing records deliberately remain unbound.
alter table public.attendance_records
  add column temporary_class_enrollment_id uuid,
  add constraint attendance_temporary_enrollment_owner_fk
    foreign key(temporary_class_enrollment_id,owner_id)
    references public.temporary_class_enrollments(id,owner_id) on delete restrict;

-- All temporary mutations use this order, shared with class ending and joining:
-- class -> session -> enrollment -> original payment. Never trust a client owner.
create function public.phase12_lock_payment(p_payment_id uuid, p_allow_cancelled boolean default false)
returns public.temporary_class_enrollments
language plpgsql security definer set search_path = '' as $$
declare v_class_id uuid; v_enrollment public.temporary_class_enrollments;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select e.temporary_class_id into v_class_id
  from public.temporary_class_payments p
  join public.temporary_class_enrollments e on e.id=p.temporary_class_enrollment_id and e.owner_id=p.owner_id
  where p.id=p_payment_id and p.owner_id=auth.uid();
  if not found then raise exception 'Temporary class payment not found'; end if;
  perform 1 from public.temporary_classes where id=v_class_id and owner_id=auth.uid() for update;
  perform 1 from public.class_sessions where temporary_class_id=v_class_id and owner_id=auth.uid() for update;
  select e.* into v_enrollment from public.temporary_class_enrollments e
  join public.temporary_class_payments p on p.temporary_class_enrollment_id=e.id and p.owner_id=e.owner_id
  where p.id=p_payment_id and e.owner_id=auth.uid() for update of e;
  perform 1 from public.temporary_class_payments where id=p_payment_id and owner_id=auth.uid() for update;
  if v_enrollment.status='cancelled' and not p_allow_cancelled then
    raise exception 'Temporary enrollment cancelled; refresh to view cancellation history';
  end if;
  return v_enrollment;
end; $$;

create function public.cancel_temporary_class_enrollment(
  p_enrollment_id uuid, p_payment_id uuid, p_expected_status text,
  p_expected_amount numeric, p_refund_confirmed boolean, p_client_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_e public.temporary_class_enrollments; v_p public.temporary_class_payments;
begin
  v_e := public.phase12_lock_payment(p_payment_id, true);
  if v_e.id <> p_enrollment_id then raise exception 'Enrollment does not match payment'; end if;
  if p_client_request_id is null then raise exception 'Cancellation request ID required'; end if;
  -- Exact retries return the committed fact, without another audit/refund write.
  if v_e.status='cancelled' then
    if v_e.cancel_request_id=p_client_request_id then
      select * into v_p from public.temporary_class_payments where id=p_payment_id and owner_id=auth.uid();
      return to_jsonb(v_e)||jsonb_build_object('payment',to_jsonb(v_p));
    end if;
    raise exception 'Temporary enrollment already cancelled';
  end if;
  if not exists(select 1 from public.temporary_classes where id=v_e.temporary_class_id
    and owner_id=auth.uid() and status='active') then raise exception 'Only an open temporary class can be cancelled'; end if;
  select * into v_p from public.temporary_class_payments where id=p_payment_id and owner_id=auth.uid();
  if p_expected_status is distinct from v_p.payment_status or p_expected_amount is distinct from v_p.amount then
    raise exception 'Payment changed; verify latest status and amount before cancelling';
  end if;
  if exists(select 1 from public.attendance_records a join public.class_sessions s
    on s.id=a.session_id and s.owner_id=a.owner_id where a.owner_id=auth.uid()
    and a.student_id=v_e.student_id and s.temporary_class_id=v_e.temporary_class_id) then
    raise exception 'Existing attendance or signature history prevents cancellation';
  end if;
  if v_p.payment_status='paid' then
    if p_refund_confirmed is distinct from true then raise exception 'Confirm the external full refund first'; end if;
    -- Amount is derived exclusively from the locked server row, not the snapshot.
    update public.temporary_class_payments set refunded_amount=v_p.amount, refunded_at=now()
      where id=v_p.id and owner_id=auth.uid();
  end if;
  update public.temporary_class_enrollments set status='cancelled', cancelled_at=now(), cancel_request_id=p_client_request_id
    where id=v_e.id and owner_id=auth.uid() returning * into v_e;
  perform public.phase5_write_activity(auth.uid(),'temporary_enrollment_cancelled','temporary_class_enrollment',v_e.id,
    case when v_p.payment_status='paid' then '已记录外部全额退费 RM'||v_p.amount::text||'，取消临时班报名' else '取消未缴费的临时班报名' end);
  select * into v_p from public.temporary_class_payments where id=p_payment_id and owner_id=auth.uid();
  return to_jsonb(v_e)||jsonb_build_object('payment',to_jsonb(v_p));
end; $$;

-- Preserve the existing business implementations; deny every client access to
-- the old bodies. Original public RPC names now always acquire the same locks.
alter function public.mark_temporary_class_payment_paid(uuid) rename to phase12_original_mark_paid;
alter function public.undo_temporary_class_payment(uuid) rename to phase12_original_undo_payment;
alter function public.update_temporary_class_payment_amount(uuid,uuid,numeric) rename to phase12_original_payment_amount;
alter function public.complete_receipts(text[]) rename to phase12_original_complete_receipts;
alter function public.restore_receipt(text) rename to phase12_original_restore_receipt;
alter function public.record_attendance(uuid,uuid,text,uuid,timestamptz,boolean) rename to phase12_original_record_attendance;
alter function public.get_session_attendance_roster(uuid) rename to phase12_original_roster;

create function public.mark_temporary_class_payment_paid(p_payment_id uuid)
returns public.temporary_class_payments language plpgsql security definer set search_path='' as $$
begin perform public.phase12_lock_payment(p_payment_id); return public.phase12_original_mark_paid(p_payment_id); end; $$;
create function public.undo_temporary_class_payment(p_payment_id uuid)
returns public.temporary_class_payments language plpgsql security definer set search_path='' as $$
begin perform public.phase12_lock_payment(p_payment_id); return public.phase12_original_undo_payment(p_payment_id); end; $$;
create function public.update_temporary_class_payment_amount(p_payment_id uuid,p_temporary_class_id uuid,p_amount numeric)
returns public.temporary_class_payments language plpgsql security definer set search_path='' as $$
declare v_e public.temporary_class_enrollments;
begin
  v_e:=public.phase12_lock_payment(p_payment_id);
  if v_e.temporary_class_id<>p_temporary_class_id then raise exception 'Temporary class payment not found'; end if;
  return public.phase12_original_payment_amount(p_payment_id,p_temporary_class_id,p_amount);
end; $$;

create function public.phase12_lock_receipts(p_keys text[]) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  -- Lock all classes in UUID order BEFORE any payment: multi-class receipts
  -- cannot form a reversed lock cycle with another batch or class operation.
  for v_id in select distinct e.temporary_class_id from public.temporary_class_payments p
    join public.temporary_class_enrollments e on e.id=p.temporary_class_enrollment_id and e.owner_id=p.owner_id
    where p.owner_id=auth.uid() and ('temporary_class_payment:'||p.id::text)=any(p_keys)
    order by e.temporary_class_id loop
    perform 1 from public.temporary_classes where id=v_id and owner_id=auth.uid() for update;
  end loop;
  for v_id in select p.id from public.temporary_class_payments p
    where p.owner_id=auth.uid() and ('temporary_class_payment:'||p.id::text)=any(p_keys) order by p.id loop
    perform public.phase12_lock_payment(v_id);
  end loop;
end; $$;
create function public.complete_receipts(p_receipt_keys text[]) returns integer
language plpgsql security definer set search_path='' as $$
begin perform public.phase12_lock_receipts(p_receipt_keys); return public.phase12_original_complete_receipts(p_receipt_keys); end; $$;
create function public.restore_receipt(p_receipt_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_key text:=p_receipt_key;
begin
  -- Match the original UUID parser, not just its canonical text spelling.
  if p_receipt_key like 'temporary_class_payment:%' then
    v_key:='temporary_class_payment:'||(substring(p_receipt_key from length('temporary_class_payment:')+1)::uuid)::text;
  end if;
  perform public.phase12_lock_receipts(array[v_key]);
  return public.phase12_original_restore_receipt(v_key);
end; $$;

-- One signature only: an optional 7th parameter, NOT a 6/7 argument overload.
-- Old normal-class requests and successful idempotent retries keep working.
-- Unbound old temporary requests fail closed, with the pending blob untouched.
create function public.record_attendance(
  p_session_id uuid,p_student_id uuid,p_signature_path text,p_client_request_id uuid,
  p_captured_at timestamptz,p_use_device_captured_at boolean,
  p_temporary_class_enrollment_id uuid default null
) returns public.attendance_records language plpgsql security definer set search_path='' as $$
declare v_s public.class_sessions; v_e public.temporary_class_enrollments;
  v_payment_id uuid; v_result public.attendance_records;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.attendance_records where owner_id=auth.uid() and client_request_id=p_client_request_id) then
    return public.phase12_original_record_attendance(p_session_id,p_student_id,p_signature_path,p_client_request_id,p_captured_at,p_use_device_captured_at);
  end if;
  select * into v_s from public.class_sessions where id=p_session_id and owner_id=auth.uid();
  if v_s.session_type='temporary' then
    if p_temporary_class_enrollment_id is null then
      raise exception 'Temporary signature requires its original enrollment ID; keep the local signature and use the updated application';
    end if;
    select p.id into v_payment_id from public.temporary_class_payments p
    join public.temporary_class_enrollments e on e.id=p.temporary_class_enrollment_id and e.owner_id=p.owner_id
    where e.id=p_temporary_class_enrollment_id and e.owner_id=auth.uid()
      and e.student_id=p_student_id and e.temporary_class_id=v_s.temporary_class_id;
    if not found then raise exception 'Temporary signature enrollment does not match this student/session'; end if;
    v_e:=public.phase12_lock_payment(v_payment_id);
    if v_e.id<>p_temporary_class_enrollment_id then raise exception 'Temporary signature enrollment mismatch'; end if;
  elsif p_temporary_class_enrollment_id is not null then
    raise exception 'Regular attendance cannot use a temporary enrollment';
  end if;
  v_result:=public.phase12_original_record_attendance(p_session_id,p_student_id,p_signature_path,p_client_request_id,p_captured_at,p_use_device_captured_at);
  if v_s.session_type='temporary' then
    update public.attendance_records set temporary_class_enrollment_id=v_e.id
      where id=v_result.id and owner_id=auth.uid() returning * into v_result;
  end if;
  return v_result;
end; $$;

-- Keep the roster's existing 15-column return contract. DISTINCT removes old
-- cancelled enrollment duplicates after a new enrollment for the same student.
create function public.get_session_attendance_roster(p_session_id uuid)
returns table(student_id uuid,student_name text,school_class text,phone text,
  participation_type text,makeup_link_id uuid,source_session_id uuid,
  attendance_record_id uuid,captured_at timestamptz,synced_at timestamptz,
  capture_source text,signing_type text,signature_path text,made_up_session_id uuid,made_up_at timestamptz)
language sql stable security definer set search_path='' as $$
  select distinct r.* from public.phase12_original_roster(p_session_id) r
  join public.class_sessions s on s.id=p_session_id and s.owner_id=auth.uid()
  where s.session_type<>'temporary' or exists(select 1 from public.temporary_class_enrollments e
    where e.owner_id=auth.uid() and e.temporary_class_id=s.temporary_class_id
      and e.student_id=r.student_id and e.status<>'cancelled')
  order by r.student_name,r.school_class nulls last,r.student_id;
$$;

-- Append metadata without changing original columns/types. Pending refunded
-- receipts are not queued; completed originals remain verifiable history.
create or replace view public.receipt_queue with(security_invoker=true) as
select 'monthly_fee:'||mf.id::text as receipt_key,'monthly_fee'::text as source_type,
  mf.id as source_id,mf.owner_id,mf.student_id,s.name as student_name,s.school_class,s.phone,c.name as source_name,
  mf.actual_amount as amount,mf.payment_status,mf.receipt_status,mf.paid_at,mf.receipt_completed_at,mf.fee_month as receipt_period,
  null::timestamptz as cancelled_at,null::numeric(10,2) as refunded_amount,null::timestamptz as refunded_at
from public.monthly_fees mf join public.students s on s.id=mf.student_id and s.owner_id=mf.owner_id
join public.enrollments e on e.id=mf.enrollment_id and e.owner_id=mf.owner_id
join public.classes c on c.id=e.class_id and c.owner_id=e.owner_id where mf.payment_status='paid'
union all
select 'temporary_class_payment:'||p.id::text,'temporary_class_payment',p.id,p.owner_id,e.student_id,
  s.name,s.school_class,s.phone,tc.name,p.amount,p.payment_status,p.receipt_status,p.paid_at,p.receipt_completed_at,
  date_trunc('month',p.paid_at at time zone 'Asia/Kuala_Lumpur')::date,e.cancelled_at,p.refunded_amount,p.refunded_at
from public.temporary_class_payments p
join public.temporary_class_enrollments e on e.id=p.temporary_class_enrollment_id and e.owner_id=p.owner_id
join public.temporary_classes tc on tc.id=e.temporary_class_id and tc.owner_id=e.owner_id
join public.students s on s.id=e.student_id and s.owner_id=e.owner_id
where p.payment_status='paid' and (e.status<>'cancelled' or p.receipt_status='completed');

-- No direct table-write grants and no changes to owner policies or Storage.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'phase12_%' or p.proname in (
      'cancel_temporary_class_enrollment','mark_temporary_class_payment_paid','undo_temporary_class_payment',
      'update_temporary_class_payment_amount','complete_receipts','restore_receipt','record_attendance','get_session_attendance_roster')) loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  end loop;
end; $$;
grant execute on function public.cancel_temporary_class_enrollment(uuid,uuid,text,numeric,boolean,uuid),
  public.mark_temporary_class_payment_paid(uuid),public.undo_temporary_class_payment(uuid),
  public.update_temporary_class_payment_amount(uuid,uuid,numeric),public.complete_receipts(text[]),
  public.restore_receipt(text),public.record_attendance(uuid,uuid,text,uuid,timestamptz,boolean,uuid),
  public.get_session_attendance_roster(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
