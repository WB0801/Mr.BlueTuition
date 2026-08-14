-- Phase 4: attendance, private signatures, corrections, and cross-class
-- participation. Absence is never stored: it is derived from the roster and
-- the lack of a valid attendance record.

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null,
  session_id uuid not null,
  makeup_link_id uuid,
  client_request_id uuid not null,
  participation_type text not null
    check (participation_type in ('regular', 'makeup', 'extra')),
  signing_type text not null
    check (signing_type in ('checkin', 'backfill')),
  captured_at timestamptz not null,
  synced_at timestamptz not null,
  capture_source text not null check (capture_source in ('server', 'device_offline')),
  signature_path text not null check (btrim(signature_path) <> ''),
  signature_mime_type text not null default 'image/png'
    check (signature_mime_type = 'image/png'),
  signature_byte_size bigint check (signature_byte_size is null or signature_byte_size > 0),
  status text not null default 'valid' check (status in ('valid', 'voided')),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, client_request_id),
  unique (owner_id, signature_path),
  constraint attendance_records_student_owner_fk
    foreign key (student_id, owner_id)
    references public.students(id, owner_id)
    on delete restrict,
  constraint attendance_records_session_owner_fk
    foreign key (session_id, owner_id)
    references public.class_sessions(id, owner_id)
    on delete restrict,
  constraint attendance_records_status_time_check check (
    (status = 'valid' and voided_at is null)
    or
    (status = 'voided' and voided_at is not null)
  ),
  constraint attendance_records_capture_sync_check check (
    captured_at <= synced_at + interval '5 minutes'
  )
);

-- A voided fact remains forever, but only one valid signature may represent a
-- student in a Session at any moment.
create unique index attendance_records_one_valid_student_session
  on public.attendance_records (session_id, student_id)
  where status = 'valid';

create index attendance_records_session_status_idx
  on public.attendance_records (session_id, status);

create index attendance_records_student_captured_idx
  on public.attendance_records (student_id, captured_at desc);

create table public.makeup_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null,
  source_enrollment_id uuid not null,
  target_session_id uuid not null,
  source_session_id uuid,
  link_type text not null check (link_type in ('makeup', 'extra')),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (target_session_id, student_id),
  constraint makeup_links_student_owner_fk
    foreign key (student_id, owner_id)
    references public.students(id, owner_id)
    on delete restrict,
  constraint makeup_links_enrollment_owner_fk
    foreign key (source_enrollment_id, owner_id)
    references public.enrollments(id, owner_id)
    on delete restrict,
  constraint makeup_links_target_session_owner_fk
    foreign key (target_session_id, owner_id)
    references public.class_sessions(id, owner_id)
    on delete restrict,
  constraint makeup_links_source_session_owner_fk
    foreign key (source_session_id, owner_id)
    references public.class_sessions(id, owner_id)
    on delete restrict,
  constraint makeup_links_type_source_check check (
    (link_type = 'makeup' and source_session_id is not null)
    or
    (link_type = 'extra' and source_session_id is null)
  )
);

alter table public.attendance_records
  add constraint attendance_records_makeup_link_owner_fk
  foreign key (makeup_link_id, owner_id)
  references public.makeup_links(id, owner_id)
  on delete restrict;

alter table public.attendance_records
  add constraint attendance_records_participation_link_check check (
    (participation_type = 'regular' and makeup_link_id is null)
    or
    (participation_type in ('makeup', 'extra') and makeup_link_id is not null)
  );

create index makeup_links_target_session_idx
  on public.makeup_links (target_session_id, student_id);

create index makeup_links_source_session_idx
  on public.makeup_links (source_session_id, student_id)
  where source_session_id is not null;

create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  attendance_record_id uuid not null,
  correction_type text not null default 'voided' check (correction_type = 'voided'),
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (attendance_record_id, correction_type),
  constraint attendance_corrections_record_owner_fk
    foreign key (attendance_record_id, owner_id)
    references public.attendance_records(id, owner_id)
    on delete restrict
);

create index attendance_corrections_record_idx
  on public.attendance_corrections (attendance_record_id, corrected_at);

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute procedure public.set_updated_at();

alter table public.attendance_records enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.makeup_links enable row level security;

create policy "Users can read their own attendance records"
  on public.attendance_records for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own attendance corrections"
  on public.attendance_corrections for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can read their own makeup links"
  on public.makeup_links for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.attendance_records to authenticated;
grant select on public.attendance_corrections to authenticated;
grant select on public.makeup_links to authenticated;

revoke all on public.attendance_records from anon;
revoke all on public.attendance_corrections from anon;
revoke all on public.makeup_links from anon;

-- Private signature files. The first path segment is always the authenticated
-- owner's UUID. There is deliberately no update or delete policy: a saved
-- signature image can be viewed but never overwritten or removed by the app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 2097152, array['image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload their own private signatures"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signatures'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Users can read their own private signatures"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signatures'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

-- The Session roster is calculated for its current Malaysia calendar date.
-- No absent rows are persisted. A completed makeup is also derived from a
-- valid signature in the target Session.
create or replace function public.get_session_attendance_roster(
  p_session_id uuid
)
returns table (
  student_id uuid,
  student_name text,
  school_class text,
  phone text,
  participation_type text,
  makeup_link_id uuid,
  source_session_id uuid,
  attendance_record_id uuid,
  captured_at timestamptz,
  synced_at timestamptz,
  capture_source text,
  signing_type text,
  signature_path text,
  made_up_session_id uuid,
  made_up_at timestamptz
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
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id;

  if not found then
    raise exception 'Session not found';
  end if;

  if v_session.status = 'cancelled' then
    return;
  end if;

  v_session_date := (v_session.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;

  return query
  with roster as (
    select distinct
      e.student_id,
      'regular'::text as participation_type,
      null::uuid as makeup_link_id,
      null::uuid as source_session_id
    from public.enrollments e
    where e.owner_id = v_owner_id
      and e.class_id = v_session.class_id
      and e.join_date <= v_session_date
      and (e.end_date is null or e.end_date >= v_session_date)

    union all

    select
      ml.student_id,
      ml.link_type,
      ml.id,
      ml.source_session_id
    from public.makeup_links ml
    where ml.owner_id = v_owner_id
      and ml.target_session_id = v_session.id
      and not exists (
        select 1 from public.enrollments target_enrollment
        where target_enrollment.owner_id = v_owner_id
          and target_enrollment.student_id = ml.student_id
          and target_enrollment.class_id = v_session.class_id
          and target_enrollment.join_date <= v_session_date
          and (target_enrollment.end_date is null or target_enrollment.end_date >= v_session_date)
      )
  )
  select
    s.id,
    s.name,
    s.school_class,
    s.phone,
    roster.participation_type,
    roster.makeup_link_id,
    roster.source_session_id,
    ar.id,
    ar.captured_at,
    ar.synced_at,
    ar.capture_source,
    ar.signing_type,
    ar.signature_path,
    made_up.target_session_id,
    made_up.target_start_at
  from roster
  join public.students s
    on s.id = roster.student_id and s.owner_id = v_owner_id
  left join public.attendance_records ar
    on ar.owner_id = v_owner_id
    and ar.session_id = v_session.id
    and ar.student_id = roster.student_id
    and ar.status = 'valid'
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
    where ml.owner_id = v_owner_id
      and ml.link_type = 'makeup'
      and ml.source_session_id = v_session.id
      and ml.student_id = roster.student_id
    order by target_attendance.captured_at desc
    limit 1
  ) made_up on roster.participation_type = 'regular' and ar.id is null
  order by s.name, s.school_class nulls last, s.id;
end;
$$;

create or replace function public.list_cross_class_candidates(
  p_target_session_id uuid,
  p_search text default ''
)
returns table (
  source_enrollment_id uuid,
  student_id uuid,
  student_name text,
  school_class text,
  phone text,
  source_class_id uuid,
  source_class_name text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target public.class_sessions;
  v_target_date date;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_target
  from public.class_sessions
  where id = p_target_session_id and owner_id = v_owner_id;

  if not found or v_target.status <> 'scheduled' then
    raise exception 'Scheduled target session not found';
  end if;

  v_target_date := (v_target.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;

  return query
  select
    e.id,
    s.id,
    s.name,
    s.school_class,
    s.phone,
    c.id,
    c.name
  from public.enrollments e
  join public.students s on s.id = e.student_id and s.owner_id = e.owner_id
  join public.classes c on c.id = e.class_id and c.owner_id = e.owner_id
  where e.owner_id = v_owner_id
    and e.class_id <> v_target.class_id
    and c.subject_id = (
      select target_class.subject_id
      from public.classes target_class
      where target_class.id = v_target.class_id and target_class.owner_id = v_owner_id
    )
    and e.join_date <= v_target_date
    and (e.end_date is null or e.end_date >= v_target_date)
    and (btrim(coalesce(p_search, '')) = '' or s.name ilike '%' || btrim(p_search) || '%')
    and not exists (
      select 1 from public.enrollments target_enrollment
      where target_enrollment.owner_id = v_owner_id
        and target_enrollment.student_id = e.student_id
        and target_enrollment.class_id = v_target.class_id
        and target_enrollment.join_date <= v_target_date
        and (target_enrollment.end_date is null or target_enrollment.end_date >= v_target_date)
    )
    and not exists (
      select 1 from public.makeup_links existing_link
      where existing_link.owner_id = v_owner_id
        and existing_link.target_session_id = v_target.id
        and existing_link.student_id = e.student_id
    )
  order by s.name, c.name
  limit 30;
end;
$$;

create or replace function public.list_makeup_source_sessions(
  p_target_session_id uuid,
  p_source_enrollment_id uuid
)
returns table (
  session_id uuid,
  session_start_at timestamptz,
  class_name text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target public.class_sessions;
  v_enrollment public.enrollments;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_target
  from public.class_sessions
  where id = p_target_session_id and owner_id = v_owner_id;

  select * into v_enrollment
  from public.enrollments
  where id = p_source_enrollment_id and owner_id = v_owner_id;

  if v_target.id is null or v_target.status <> 'scheduled' then
    raise exception 'Scheduled target session not found';
  end if;

  if v_enrollment.id is null or v_enrollment.class_id = v_target.class_id then
    raise exception 'Cross-class enrollment not found';
  end if;

  if not exists (
    select 1
    from public.classes source_class
    join public.classes target_class
      on target_class.owner_id = source_class.owner_id
      and target_class.subject_id = source_class.subject_id
    where source_class.id = v_enrollment.class_id
      and source_class.owner_id = v_owner_id
      and target_class.id = v_target.class_id
  ) then
    raise exception 'Cross-class enrollment must use the same subject';
  end if;

  return query
  select source.id, source.current_start_at, c.name
  from public.class_sessions source
  join public.classes c on c.id = source.class_id and c.owner_id = source.owner_id
  where source.owner_id = v_owner_id
    and source.class_id = v_enrollment.class_id
    and source.session_type = 'regular'
    and source.status in ('scheduled', 'completed')
    and source.current_start_at < v_target.current_start_at
    and (source.current_start_at at time zone 'Asia/Kuala_Lumpur')::date >= v_enrollment.join_date
    and (
      v_enrollment.end_date is null
      or (source.current_start_at at time zone 'Asia/Kuala_Lumpur')::date <= v_enrollment.end_date
    )
    and not exists (
      select 1 from public.attendance_records source_attendance
      where source_attendance.owner_id = v_owner_id
        and source_attendance.session_id = source.id
        and source_attendance.student_id = v_enrollment.student_id
        and source_attendance.status = 'valid'
    )
    and not exists (
      select 1
      from public.makeup_links completed_link
      join public.attendance_records completed_attendance
        on completed_attendance.owner_id = completed_link.owner_id
        and completed_attendance.session_id = completed_link.target_session_id
        and completed_attendance.student_id = completed_link.student_id
        and completed_attendance.status = 'valid'
      where completed_link.owner_id = v_owner_id
        and completed_link.link_type = 'makeup'
        and completed_link.source_session_id = source.id
        and completed_link.student_id = v_enrollment.student_id
    )
  order by source.current_start_at desc
  limit 20;
end;
$$;

create or replace function public.add_session_guest(
  p_target_session_id uuid,
  p_source_enrollment_id uuid,
  p_link_type text,
  p_source_session_id uuid default null
)
returns public.makeup_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target public.class_sessions;
  v_source public.class_sessions;
  v_enrollment public.enrollments;
  v_target_date date;
  v_source_date date;
  v_result public.makeup_links;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_link_type not in ('makeup', 'extra') then
    raise exception 'Invalid participation type';
  end if;

  if (p_link_type = 'makeup' and p_source_session_id is null)
     or (p_link_type = 'extra' and p_source_session_id is not null) then
    raise exception 'Source session does not match participation type';
  end if;

  select * into v_target
  from public.class_sessions
  where id = p_target_session_id and owner_id = v_owner_id
  for update;

  if not found or v_target.status <> 'scheduled' then
    raise exception 'Scheduled target session not found';
  end if;

  select * into v_enrollment
  from public.enrollments
  where id = p_source_enrollment_id and owner_id = v_owner_id;

  if not found or v_enrollment.class_id = v_target.class_id then
    raise exception 'Cross-class enrollment not found';
  end if;

  if not exists (
    select 1
    from public.classes source_class
    join public.classes target_class
      on target_class.owner_id = source_class.owner_id
      and target_class.subject_id = source_class.subject_id
    where source_class.id = v_enrollment.class_id
      and source_class.owner_id = v_owner_id
      and target_class.id = v_target.class_id
  ) then
    raise exception 'Cross-class enrollment must use the same subject';
  end if;

  v_target_date := (v_target.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;

  if not (
    v_enrollment.join_date <= v_target_date
    and (v_enrollment.end_date is null or v_enrollment.end_date >= v_target_date)
  ) then
    raise exception 'Enrollment is not effective on target session date';
  end if;

  if exists (
    select 1 from public.enrollments target_enrollment
    where target_enrollment.owner_id = v_owner_id
      and target_enrollment.student_id = v_enrollment.student_id
      and target_enrollment.class_id = v_target.class_id
      and target_enrollment.join_date <= v_target_date
      and (target_enrollment.end_date is null or target_enrollment.end_date >= v_target_date)
  ) then
    raise exception 'Student is already in the target Session roster';
  end if;

  if p_link_type = 'makeup' then
    select * into v_source
    from public.class_sessions
    where id = p_source_session_id and owner_id = v_owner_id;

    if not found
       or v_source.class_id <> v_enrollment.class_id
       or v_source.session_type <> 'regular'
       or v_source.status not in ('scheduled', 'completed')
       or v_source.current_start_at >= v_target.current_start_at then
      raise exception 'Eligible source Session not found';
    end if;

    v_source_date := (v_source.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;
    if v_source_date < v_enrollment.join_date
       or (v_enrollment.end_date is not null and v_source_date > v_enrollment.end_date) then
      raise exception 'Enrollment was not effective for source Session';
    end if;

    if exists (
      select 1 from public.attendance_records source_attendance
      where source_attendance.owner_id = v_owner_id
        and source_attendance.session_id = v_source.id
        and source_attendance.student_id = v_enrollment.student_id
        and source_attendance.status = 'valid'
    ) then
      raise exception 'Student already attended the source Session';
    end if;

    if exists (
      select 1
      from public.makeup_links completed_link
      join public.attendance_records completed_attendance
        on completed_attendance.owner_id = completed_link.owner_id
        and completed_attendance.session_id = completed_link.target_session_id
        and completed_attendance.student_id = completed_link.student_id
        and completed_attendance.status = 'valid'
      where completed_link.owner_id = v_owner_id
        and completed_link.link_type = 'makeup'
        and completed_link.source_session_id = v_source.id
        and completed_link.student_id = v_enrollment.student_id
    ) then
      raise exception 'Source Session has already been made up';
    end if;
  end if;

  insert into public.makeup_links (
    owner_id,
    student_id,
    source_enrollment_id,
    target_session_id,
    source_session_id,
    link_type
  )
  values (
    v_owner_id,
    v_enrollment.student_id,
    v_enrollment.id,
    v_target.id,
    p_source_session_id,
    p_link_type
  )
  returning * into v_result;

  return v_result;
end;
$$;

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
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_existing
  from public.attendance_records
  where owner_id = v_owner_id and client_request_id = p_client_request_id;

  if found then
    if v_existing.session_id <> p_session_id
       or v_existing.student_id <> p_student_id
       or v_existing.signature_path <> p_signature_path then
      raise exception 'Idempotency key does not match attendance request';
    end if;
    return v_existing;
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id and owner_id = v_owner_id
  for update;

  if not found or v_session.status not in ('scheduled', 'completed') then
    raise exception 'Session is not available for attendance';
  end if;

  v_session_date := (v_session.current_start_at at time zone 'Asia/Kuala_Lumpur')::date;
  if (v_synced_at at time zone 'Asia/Kuala_Lumpur')::date < v_session_date then
    raise exception 'Future Session cannot be signed';
  end if;

  if p_captured_at is null then
    raise exception 'Captured time is required';
  end if;

  -- A normal immediate submission uses the trusted server instant. A retry
  -- after local retention keeps the device capture instant and separately
  -- records the server synchronization instant.
  if coalesce(p_use_device_captured_at, false)
     or p_captured_at < v_synced_at - interval '2 minutes' then
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

  if p_signature_path <> v_expected_path then
    raise exception 'Invalid signature path';
  end if;

  select nullif(metadata->>'size', '')::bigint into v_signature_size
  from storage.objects
  where bucket_id = 'signatures' and name = p_signature_path;

  if not found then
    raise exception 'Signature file has not been uploaded';
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.owner_id = v_owner_id
      and e.student_id = p_student_id
      and e.class_id = v_session.class_id
      and e.join_date <= v_session_date
      and (e.end_date is null or e.end_date >= v_session_date)
  ) then
    v_participation_type := 'regular';
  else
    select * into v_link
    from public.makeup_links
    where owner_id = v_owner_id
      and target_session_id = v_session.id
      and student_id = p_student_id;

    if not found then
      raise exception 'Student is not in this Session roster';
    end if;

    v_participation_type := v_link.link_type;
  end if;

  if exists (
    select 1 from public.attendance_records existing_valid
    where existing_valid.owner_id = v_owner_id
      and existing_valid.session_id = v_session.id
      and existing_valid.student_id = p_student_id
      and existing_valid.status = 'valid'
  ) then
    raise exception 'Student already has a valid attendance record';
  end if;

  v_signing_type := case
    when (v_captured_at at time zone 'Asia/Kuala_Lumpur')::date > v_session_date then 'backfill'
    else 'checkin'
  end;

  insert into public.attendance_records (
    owner_id,
    student_id,
    session_id,
    makeup_link_id,
    client_request_id,
    participation_type,
    signing_type,
    captured_at,
    synced_at,
    capture_source,
    signature_path,
    signature_byte_size
  )
  values (
    v_owner_id,
    p_student_id,
    v_session.id,
    v_link.id,
    p_client_request_id,
    v_participation_type,
    v_signing_type,
    v_captured_at,
    v_synced_at,
    v_capture_source,
    p_signature_path,
    v_signature_size
  )
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.void_attendance_record(
  p_attendance_record_id uuid
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_record public.attendance_records;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_record
  from public.attendance_records
  where id = p_attendance_record_id and owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'Attendance record not found';
  end if;

  if v_record.status = 'voided' then
    return v_record;
  end if;

  update public.attendance_records
  set status = 'voided', voided_at = now()
  where id = v_record.id
  returning * into v_record;

  insert into public.attendance_corrections (
    owner_id,
    attendance_record_id,
    correction_type,
    corrected_at
  )
  values (v_owner_id, v_record.id, 'voided', v_record.voided_at);

  return v_record;
end;
$$;

-- A Session with a valid signature cannot later be stopped or rescheduled.
-- Full-day stopping locks the whole date, preserves Sessions with valid
-- attendance, and atomically stops every other eligible Session.
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

  if exists (
    select 1 from public.attendance_records
    where owner_id = v_owner_id and session_id = v_session.id and status = 'valid'
  ) then
    raise exception 'Session with valid attendance cannot be stopped';
  end if;

  update public.class_sessions
  set status = 'cancelled', cancelled_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
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

  if exists (
    select 1 from public.attendance_records
    where owner_id = v_owner_id and session_id = v_session.id and status = 'valid'
  ) then
    raise exception 'Session with valid attendance cannot be rescheduled';
  end if;

  if p_new_end_at <= p_new_start_at then
    raise exception 'New end time must be after start time';
  end if;

  if p_new_start_at = v_session.current_start_at
     and p_new_end_at = v_session.current_end_at then
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
  where id = v_session.id
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

  perform public.ensure_class_sessions(p_session_date, p_session_date);

  -- Serialize against record_attendance(), which locks the same Session row.
  -- This prevents a signature from racing with an all-day stop.
  perform 1
  from public.class_sessions session
  where session.owner_id = v_owner_id
    and session.status = 'scheduled'
    and (session.current_start_at at time zone 'Asia/Kuala_Lumpur')::date = p_session_date
  for update;

  update public.class_sessions
  set status = 'cancelled', cancelled_at = now()
  where owner_id = v_owner_id
    and status = 'scheduled'
    and (current_start_at at time zone 'Asia/Kuala_Lumpur')::date = p_session_date
    and not exists (
      select 1 from public.attendance_records attendance
      where attendance.owner_id = v_owner_id
        and attendance.session_id = class_sessions.id
        and attendance.status = 'valid'
    );

  get diagnostics v_stopped = row_count;
  return v_stopped;
end;
$$;

revoke all on function public.get_session_attendance_roster(uuid) from public, anon;
revoke all on function public.list_cross_class_candidates(uuid, text) from public, anon;
revoke all on function public.list_makeup_source_sessions(uuid, uuid) from public, anon;
revoke all on function public.add_session_guest(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.record_attendance(uuid, uuid, text, uuid, timestamptz, boolean) from public, anon;
revoke all on function public.void_attendance_record(uuid) from public, anon;

grant execute on function public.get_session_attendance_roster(uuid) to authenticated;
grant execute on function public.list_cross_class_candidates(uuid, text) to authenticated;
grant execute on function public.list_makeup_source_sessions(uuid, uuid) to authenticated;
grant execute on function public.add_session_guest(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.record_attendance(uuid, uuid, text, uuid, timestamptz, boolean) to authenticated;
grant execute on function public.void_attendance_record(uuid) to authenticated;
