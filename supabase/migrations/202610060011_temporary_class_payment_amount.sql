-- Individual one-off fees retain the original payment UUID and snapshot.
-- No schema/data backfill or change to existing RLS or payment/receipt RPCs.
begin;

create function public.update_temporary_class_payment_amount(
  p_payment_id uuid,
  p_temporary_class_id uuid,
  p_amount numeric
)
returns public.temporary_class_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_class public.temporary_classes;
  v_payment public.temporary_class_payments;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount < 0 or p_amount > 99999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Invalid temporary class payment amount';
  end if;

  -- Share the class lock with ending/default edits before taking the payment
  -- lock used by mark_temporary_class_payment_paid / undo / receipt operations.
  select tc.* into v_class
  from public.temporary_classes tc
  join public.temporary_class_enrollments e
    on e.temporary_class_id = tc.id and e.owner_id = tc.owner_id
  join public.temporary_class_payments p
    on p.temporary_class_enrollment_id = e.id and p.owner_id = e.owner_id
  where tc.id = p_temporary_class_id and tc.owner_id = v_owner_id
    and p.id = p_payment_id
  for update of tc;
  if not found or v_class.status <> 'active' then
    raise exception 'Active temporary class not found';
  end if;

  select p.* into v_payment
  from public.temporary_class_payments p
  join public.temporary_class_enrollments e
    on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id
  where p.id = p_payment_id and p.owner_id = v_owner_id
    and e.temporary_class_id = v_class.id
  for update of p;
  if not found then raise exception 'Temporary class payment not found'; end if;
  if v_payment.payment_status <> 'unpaid' then
    raise exception 'Only unpaid temporary class payments can be changed';
  end if;
  if v_payment.amount = p_amount then return v_payment; end if;

  update public.temporary_class_payments
  set amount = p_amount
  where id = v_payment.id and owner_id = v_owner_id and payment_status = 'unpaid'
  returning * into v_payment;

  perform public.phase5_write_activity(
    v_owner_id, 'temporary_class_payment_amount_changed', 'temporary_class_payment', v_payment.id,
    '临时班应缴金额修改为 RM' || trim(to_char(v_payment.amount, 'FM999999990.00'))
  );
  return v_payment;
end;
$$;

revoke all on function public.update_temporary_class_payment_amount(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.update_temporary_class_payment_amount(uuid, uuid, numeric) to authenticated;

commit;
