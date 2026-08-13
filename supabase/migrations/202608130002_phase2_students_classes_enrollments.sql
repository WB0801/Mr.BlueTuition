-- Phase 2: students, subjects, regular classes, and enrollment history.

create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  school_class text not null check (btrim(school_class) <> ''),
  phone text not null check (btrim(phone) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index subjects_owner_name_unique
  on public.subjects (owner_id, lower(btrim(name)));

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid not null,
  name text not null check (btrim(name) <> ''),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  monthly_fee numeric(10, 2) not null check (monthly_fee >= 0),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint classes_subject_owner_fk
    foreign key (subject_id, owner_id)
    references public.subjects(id, owner_id)
    on delete restrict,
  constraint classes_time_order_check check (end_time > start_time),
  constraint classes_status_dates_check check (
    (status = 'active' and end_date is null)
    or
    (status = 'ended' and end_date is not null and end_date >= start_date)
  )
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null,
  class_id uuid not null,
  join_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint enrollments_student_owner_fk
    foreign key (student_id, owner_id)
    references public.students(id, owner_id)
    on delete restrict,
  constraint enrollments_class_owner_fk
    foreign key (class_id, owner_id)
    references public.classes(id, owner_id)
    on delete restrict,
  constraint enrollments_status_dates_check check (
    (status = 'active' and end_date is null)
    or
    (status = 'ended' and end_date is not null and end_date >= join_date)
  )
);

create unique index enrollments_one_active_student_class
  on public.enrollments (student_id, class_id)
  where status = 'active';

create index students_owner_name_idx on public.students (owner_id, name);
create index classes_owner_status_idx on public.classes (owner_id, status, start_date);
create index enrollments_student_status_idx on public.enrollments (student_id, status);
create index enrollments_class_status_idx on public.enrollments (class_id, status);

create trigger students_set_updated_at
  before update on public.students
  for each row execute procedure public.set_updated_at();

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute procedure public.set_updated_at();

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute procedure public.set_updated_at();

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute procedure public.set_updated_at();

alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;

create policy "Users can read their own students"
  on public.students for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own students"
  on public.students for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own students"
  on public.students for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can read their own subjects"
  on public.subjects for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own subjects"
  on public.subjects for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own subjects"
  on public.subjects for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can read their own classes"
  on public.classes for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own classes"
  on public.classes for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own classes"
  on public.classes for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can read their own enrollments"
  on public.enrollments for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update on public.students to authenticated;
grant select, insert, update on public.subjects to authenticated;
grant select, insert, update on public.classes to authenticated;
grant select on public.enrollments to authenticated;

revoke all on public.students from anon;
revoke all on public.subjects from anon;
revoke all on public.classes from anon;
revoke all on public.enrollments from anon;

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
  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment_id and owner_id = v_owner_id
  for update;

  if not found or v_enrollment.status <> 'active' then
    raise exception 'Active enrollment not found';
  end if;

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

  if p_transfer_date < v_old.join_date or p_transfer_date < v_new_class.start_date then
    raise exception 'Invalid transfer date';
  end if;

  update public.enrollments
  set status = 'ended', end_date = p_transfer_date
  where id = v_old.id;

  insert into public.enrollments (owner_id, student_id, class_id, join_date)
  values (v_owner_id, v_old.student_id, p_new_class_id, p_transfer_date)
  returning * into v_new;

  return v_new;
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

  update public.classes
  set status = 'ended', end_date = p_end_date
  where id = p_class_id
  returning * into v_class;

  return v_class;
end;
$$;

revoke all on function public.create_enrollment(uuid, uuid, date) from public, anon;
revoke all on function public.end_enrollment(uuid, date) from public, anon;
revoke all on function public.transfer_enrollment(uuid, uuid, date) from public, anon;
revoke all on function public.end_class(uuid, date) from public, anon;

grant execute on function public.create_enrollment(uuid, uuid, date) to authenticated;
grant execute on function public.end_enrollment(uuid, date) to authenticated;
grant execute on function public.transfer_enrollment(uuid, uuid, date) to authenticated;
grant execute on function public.end_class(uuid, date) to authenticated;

insert into public.subjects (owner_id, name)
select id, '会计学' from public.profiles
on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), '蓝老师'));

  insert into public.subjects (owner_id, name)
  values (new.id, '会计学')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
