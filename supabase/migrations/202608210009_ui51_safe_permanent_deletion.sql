-- UI 5.1: explicit, owner-scoped permanent deletion previews and transactions.
-- This migration is additive. It does not delete existing business data.

begin;

create or replace function public.ui51_preview_permanent_delete(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_owner_id uuid := auth.uid();
  v_name text;
  v_counts jsonb;
begin
  if v_owner_id is null then raise exception 'Authentication required'; end if;

  case p_entity_type
    when 'student' then
      select name into v_name from public.students where id = p_entity_id and owner_id = v_owner_id;
      if not found then raise exception 'Student not found'; end if;
      select jsonb_build_object(
        'enrollments', (select count(*) from public.enrollments where owner_id = v_owner_id and student_id = p_entity_id),
        'related_classes', (select count(distinct class_id) from public.enrollments where owner_id = v_owner_id and student_id = p_entity_id),
        'attendance_records', (select count(*) from public.attendance_records where owner_id = v_owner_id and student_id = p_entity_id),
        'attendance_corrections', (select count(*) from public.attendance_corrections c join public.attendance_records r on r.id = c.attendance_record_id and r.owner_id = c.owner_id where c.owner_id = v_owner_id and r.student_id = p_entity_id),
        'makeup_links', (select count(*) from public.makeup_links where owner_id = v_owner_id and student_id = p_entity_id),
        'monthly_fees', (select count(*) from public.monthly_fees where owner_id = v_owner_id and student_id = p_entity_id),
        'school_exam_scores', (select count(*) from public.school_exam_scores where owner_id = v_owner_id and student_id = p_entity_id),
        'tuition_quiz_scores', (select count(*) from public.tuition_quiz_scores where owner_id = v_owner_id and student_id = p_entity_id),
        'temporary_enrollments', (select count(*) from public.temporary_class_enrollments where owner_id = v_owner_id and student_id = p_entity_id),
        'temporary_payments', (select count(*) from public.temporary_class_payments p join public.temporary_class_enrollments e on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id where p.owner_id = v_owner_id and e.student_id = p_entity_id),
        'signature_files', (select count(*) from public.attendance_records where owner_id = v_owner_id and student_id = p_entity_id),
        'activity_logs', (select count(*) from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id)
      ) into v_counts;

    when 'class' then
      select name into v_name from public.classes where id = p_entity_id and owner_id = v_owner_id;
      if not found then raise exception 'Class not found'; end if;
      select jsonb_build_object(
        'enrollments', (select count(*) from public.enrollments where owner_id = v_owner_id and class_id = p_entity_id),
        'students', (select count(distinct student_id) from public.enrollments where owner_id = v_owner_id and class_id = p_entity_id),
        'schedule_rules', (select count(*) from public.class_schedule_rules where owner_id = v_owner_id and class_id = p_entity_id),
        'sessions', (select count(*) from public.class_sessions where owner_id = v_owner_id and class_id = p_entity_id),
        'attendance_records', (select count(*) from public.attendance_records r join public.class_sessions s on s.id = r.session_id and s.owner_id = r.owner_id where r.owner_id = v_owner_id and s.class_id = p_entity_id),
        'monthly_fees', (select count(*) from public.monthly_fees f join public.enrollments e on e.id = f.enrollment_id and e.owner_id = f.owner_id where f.owner_id = v_owner_id and e.class_id = p_entity_id),
        'tuition_quizzes', (select count(*) from public.tuition_quizzes where owner_id = v_owner_id and class_id = p_entity_id),
        'tuition_quiz_scores', (select count(*) from public.tuition_quiz_scores s join public.tuition_quizzes q on q.id = s.quiz_id and q.owner_id = s.owner_id where s.owner_id = v_owner_id and q.class_id = p_entity_id),
        'signature_files', (select count(*) from public.attendance_records r join public.class_sessions s on s.id = r.session_id and s.owner_id = r.owner_id where r.owner_id = v_owner_id and s.class_id = p_entity_id),
        'transfer_links_detached', (select count(*) from public.enrollments successor join public.enrollments source on source.id = successor.transferred_from_enrollment_id and source.owner_id = successor.owner_id where successor.owner_id = v_owner_id and source.class_id = p_entity_id and successor.class_id <> p_entity_id),
        'activity_logs', (select count(*) from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id)
      ) into v_counts;

    when 'temporary_class' then
      select name into v_name from public.temporary_classes where id = p_entity_id and owner_id = v_owner_id;
      if not found then raise exception 'Temporary class not found'; end if;
      select jsonb_build_object(
        'temporary_enrollments', (select count(*) from public.temporary_class_enrollments where owner_id = v_owner_id and temporary_class_id = p_entity_id),
        'students', (select count(distinct student_id) from public.temporary_class_enrollments where owner_id = v_owner_id and temporary_class_id = p_entity_id),
        'temporary_payments', (select count(*) from public.temporary_class_payments p join public.temporary_class_enrollments e on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id where p.owner_id = v_owner_id and e.temporary_class_id = p_entity_id),
        'sessions', (select count(*) from public.class_sessions where owner_id = v_owner_id and temporary_class_id = p_entity_id),
        'attendance_records', (select count(*) from public.attendance_records r join public.class_sessions s on s.id = r.session_id and s.owner_id = r.owner_id where r.owner_id = v_owner_id and s.temporary_class_id = p_entity_id),
        'signature_files', (select count(*) from public.attendance_records r join public.class_sessions s on s.id = r.session_id and s.owner_id = r.owner_id where r.owner_id = v_owner_id and s.temporary_class_id = p_entity_id),
        'activity_logs', (select count(*) from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id)
      ) into v_counts;

    when 'subject' then
      select name into v_name from public.subjects where id = p_entity_id and owner_id = v_owner_id;
      if not found then raise exception 'Subject not found'; end if;
      select jsonb_build_object(
        'classes', (select count(*) from public.classes where owner_id = v_owner_id and subject_id = p_entity_id),
        'temporary_classes', (select count(*) from public.temporary_classes where owner_id = v_owner_id and subject_id = p_entity_id),
        'school_exams', (select count(*) from public.school_exams where owner_id = v_owner_id and subject_id = p_entity_id),
        'enrollments', (select count(*) from public.enrollments e join public.classes c on c.id = e.class_id and c.owner_id = e.owner_id where e.owner_id = v_owner_id and c.subject_id = p_entity_id),
        'students', (select count(distinct e.student_id) from public.enrollments e join public.classes c on c.id = e.class_id and c.owner_id = e.owner_id where e.owner_id = v_owner_id and c.subject_id = p_entity_id),
        'sessions', (select count(*) from public.class_sessions s left join public.classes c on c.id = s.class_id and c.owner_id = s.owner_id left join public.temporary_classes t on t.id = s.temporary_class_id and t.owner_id = s.owner_id where s.owner_id = v_owner_id and (c.subject_id = p_entity_id or t.subject_id = p_entity_id)),
        'attendance_records', (select count(*) from public.attendance_records r join public.class_sessions s on s.id = r.session_id and s.owner_id = r.owner_id left join public.classes c on c.id = s.class_id and c.owner_id = s.owner_id left join public.temporary_classes t on t.id = s.temporary_class_id and t.owner_id = s.owner_id where r.owner_id = v_owner_id and (c.subject_id = p_entity_id or t.subject_id = p_entity_id)),
        'monthly_fees', (select count(*) from public.monthly_fees f join public.enrollments e on e.id = f.enrollment_id and e.owner_id = f.owner_id join public.classes c on c.id = e.class_id and c.owner_id = e.owner_id where f.owner_id = v_owner_id and c.subject_id = p_entity_id),
        'school_exam_scores', (select count(*) from public.school_exam_scores s join public.school_exams e on e.id = s.exam_id and e.owner_id = s.owner_id where s.owner_id = v_owner_id and e.subject_id = p_entity_id),
        'tuition_quizzes', (select count(*) from public.tuition_quizzes q join public.classes c on c.id = q.class_id and c.owner_id = q.owner_id where q.owner_id = v_owner_id and c.subject_id = p_entity_id),
        'tuition_quiz_scores', (select count(*) from public.tuition_quiz_scores s join public.tuition_quizzes q on q.id = s.quiz_id and q.owner_id = s.owner_id join public.classes c on c.id = q.class_id and c.owner_id = q.owner_id where s.owner_id = v_owner_id and c.subject_id = p_entity_id),
        'temporary_enrollments', (select count(*) from public.temporary_class_enrollments e join public.temporary_classes t on t.id = e.temporary_class_id and t.owner_id = e.owner_id where e.owner_id = v_owner_id and t.subject_id = p_entity_id),
        'temporary_payments', (select count(*) from public.temporary_class_payments p join public.temporary_class_enrollments e on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id join public.temporary_classes t on t.id = e.temporary_class_id and t.owner_id = e.owner_id where p.owner_id = v_owner_id and t.subject_id = p_entity_id),
        'signature_files', (select count(*) from public.attendance_records r join public.class_sessions s on s.id = r.session_id and s.owner_id = r.owner_id left join public.classes c on c.id = s.class_id and c.owner_id = s.owner_id left join public.temporary_classes t on t.id = s.temporary_class_id and t.owner_id = s.owner_id where r.owner_id = v_owner_id and (c.subject_id = p_entity_id or t.subject_id = p_entity_id)),
        'activity_logs', (select count(*) from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id)
      ) into v_counts;

    when 'school_exam' then
      select name into v_name from public.school_exams where id = p_entity_id and owner_id = v_owner_id;
      if not found then raise exception 'School exam not found'; end if;
      select jsonb_build_object(
        'school_exam_scores', (select count(*) from public.school_exam_scores where owner_id = v_owner_id and exam_id = p_entity_id),
        'students', (select count(distinct student_id) from public.school_exam_scores where owner_id = v_owner_id and exam_id = p_entity_id),
        'activity_logs', (select count(*) from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id)
      ) into v_counts;

    when 'tuition_quiz' then
      select name into v_name from public.tuition_quizzes where id = p_entity_id and owner_id = v_owner_id;
      if not found then raise exception 'Tuition quiz not found'; end if;
      select jsonb_build_object(
        'tuition_quiz_scores', (select count(*) from public.tuition_quiz_scores where owner_id = v_owner_id and quiz_id = p_entity_id),
        'students', (select count(distinct student_id) from public.tuition_quiz_scores where owner_id = v_owner_id and quiz_id = p_entity_id),
        'activity_logs', (select count(*) from public.activity_logs where owner_id = v_owner_id and entity_id = p_entity_id)
      ) into v_counts;

    else
      raise exception 'Unsupported permanent deletion type';
  end case;

  return jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'entity_name', v_name,
    'counts', v_counts
  );
end;
$$;

create or replace function public.ui51_delete_class_data(p_owner_id uuid, p_class_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_session_ids uuid[];
  v_enrollment_ids uuid[];
  v_makeup_ids uuid[];
  v_attendance_ids uuid[];
  v_paths jsonb;
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_session_ids
  from public.class_sessions where owner_id = p_owner_id and class_id = p_class_id;
  select coalesce(array_agg(id), array[]::uuid[]) into v_enrollment_ids
  from public.enrollments where owner_id = p_owner_id and class_id = p_class_id;
  select coalesce(array_agg(id), array[]::uuid[]) into v_makeup_ids
  from public.makeup_links
  where owner_id = p_owner_id
    and (target_session_id = any(v_session_ids) or source_session_id = any(v_session_ids) or source_enrollment_id = any(v_enrollment_ids));
  select coalesce(array_agg(id), array[]::uuid[]) into v_attendance_ids
  from public.attendance_records
  where owner_id = p_owner_id and (session_id = any(v_session_ids) or makeup_link_id = any(v_makeup_ids));
  select coalesce(jsonb_agg(signature_path order by signature_path), '[]'::jsonb) into v_paths
  from public.attendance_records where owner_id = p_owner_id and id = any(v_attendance_ids);

  delete from public.activity_logs
  where owner_id = p_owner_id and (
    entity_id = p_class_id
    or entity_id = any(v_session_ids)
    or entity_id = any(v_enrollment_ids)
    or entity_id in (select id from public.monthly_fees where owner_id = p_owner_id and enrollment_id = any(v_enrollment_ids))
    or entity_id in (select id from public.tuition_quizzes where owner_id = p_owner_id and class_id = p_class_id)
  );
  delete from public.attendance_corrections where owner_id = p_owner_id and attendance_record_id = any(v_attendance_ids);
  delete from public.attendance_records where owner_id = p_owner_id and id = any(v_attendance_ids);
  delete from public.makeup_links where owner_id = p_owner_id and id = any(v_makeup_ids);
  delete from public.session_schedule_changes where owner_id = p_owner_id and session_id = any(v_session_ids);
  delete from public.tuition_quiz_scores
  where owner_id = p_owner_id and (enrollment_id = any(v_enrollment_ids) or quiz_id in (select id from public.tuition_quizzes where owner_id = p_owner_id and class_id = p_class_id));
  delete from public.tuition_quizzes where owner_id = p_owner_id and class_id = p_class_id;
  delete from public.monthly_fees where owner_id = p_owner_id and enrollment_id = any(v_enrollment_ids);
  update public.enrollments set transferred_from_enrollment_id = null
  where owner_id = p_owner_id and transferred_from_enrollment_id = any(v_enrollment_ids);
  delete from public.enrollments where owner_id = p_owner_id and id = any(v_enrollment_ids);
  delete from public.class_sessions where owner_id = p_owner_id and id = any(v_session_ids);
  update public.classes set schedule_summary_rule_id = null where owner_id = p_owner_id and id = p_class_id;
  delete from public.class_schedule_rules where owner_id = p_owner_id and class_id = p_class_id;
  delete from public.classes where owner_id = p_owner_id and id = p_class_id;
  return jsonb_build_object('signature_paths', v_paths);
end;
$$;

create or replace function public.ui51_delete_temporary_class_data(p_owner_id uuid, p_temporary_class_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_session_ids uuid[];
  v_enrollment_ids uuid[];
  v_makeup_ids uuid[];
  v_attendance_ids uuid[];
  v_paths jsonb;
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_session_ids
  from public.class_sessions where owner_id = p_owner_id and temporary_class_id = p_temporary_class_id;
  select coalesce(array_agg(id), array[]::uuid[]) into v_enrollment_ids
  from public.temporary_class_enrollments where owner_id = p_owner_id and temporary_class_id = p_temporary_class_id;
  select coalesce(array_agg(id), array[]::uuid[]) into v_makeup_ids
  from public.makeup_links
  where owner_id = p_owner_id and (target_session_id = any(v_session_ids) or source_session_id = any(v_session_ids));
  select coalesce(array_agg(id), array[]::uuid[]) into v_attendance_ids
  from public.attendance_records
  where owner_id = p_owner_id and (session_id = any(v_session_ids) or makeup_link_id = any(v_makeup_ids));
  select coalesce(jsonb_agg(signature_path order by signature_path), '[]'::jsonb) into v_paths
  from public.attendance_records where owner_id = p_owner_id and id = any(v_attendance_ids);

  delete from public.activity_logs
  where owner_id = p_owner_id and (
    entity_id = p_temporary_class_id
    or entity_id = any(v_session_ids)
    or entity_id = any(v_enrollment_ids)
    or entity_id in (select id from public.temporary_class_payments where owner_id = p_owner_id and temporary_class_enrollment_id = any(v_enrollment_ids))
  );
  delete from public.attendance_corrections where owner_id = p_owner_id and attendance_record_id = any(v_attendance_ids);
  delete from public.attendance_records where owner_id = p_owner_id and id = any(v_attendance_ids);
  delete from public.makeup_links where owner_id = p_owner_id and id = any(v_makeup_ids);
  delete from public.session_schedule_changes where owner_id = p_owner_id and session_id = any(v_session_ids);
  delete from public.class_sessions where owner_id = p_owner_id and id = any(v_session_ids);
  delete from public.temporary_class_payments where owner_id = p_owner_id and temporary_class_enrollment_id = any(v_enrollment_ids);
  delete from public.temporary_class_enrollments where owner_id = p_owner_id and id = any(v_enrollment_ids);
  delete from public.temporary_classes where owner_id = p_owner_id and id = p_temporary_class_id;
  return jsonb_build_object('signature_paths', v_paths);
end;
$$;

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

revoke all on function public.ui51_preview_permanent_delete(text, uuid) from public, anon;
revoke all on function public.ui51_permanently_delete_entity(text, uuid, text) from public, anon;
revoke all on function public.ui51_delete_class_data(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ui51_delete_temporary_class_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ui51_preview_permanent_delete(text, uuid) to authenticated;
grant execute on function public.ui51_permanently_delete_entity(text, uuid, text) to authenticated;

-- Storage object removal continues to use the official Storage API. The
-- owner-prefix check prevents one user from removing another user's files.
create policy "Users can delete their own private signatures"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'signatures'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

commit;
