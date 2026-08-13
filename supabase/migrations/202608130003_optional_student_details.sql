-- Phase 2 acceptance fix: only the student name is required.

alter table public.students
  alter column school_class drop not null,
  alter column phone drop not null;

alter table public.students
  drop constraint if exists students_school_class_check,
  drop constraint if exists students_phone_check;

alter table public.students
  add constraint students_school_class_check
    check (school_class is null or btrim(school_class) <> ''),
  add constraint students_phone_check
    check (phone is null or btrim(phone) <> '');
