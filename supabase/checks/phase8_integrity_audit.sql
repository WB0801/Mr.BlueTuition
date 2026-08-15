-- Phase 8 production read-only integrity audit. This query does not modify data.
with integrity as (
  select
    (select count(*) from public.enrollments e left join public.students s on s.id = e.student_id and s.owner_id = e.owner_id where s.id is null) as broken_enrollment_students,
    (select count(*) from public.enrollments e left join public.classes c on c.id = e.class_id and c.owner_id = e.owner_id where c.id is null) as broken_enrollment_classes,
    (select count(*) from public.class_schedule_rules r left join public.classes c on c.id = r.class_id and c.owner_id = r.owner_id where c.id is null) as broken_schedule_rules,
    (select count(*) from public.class_sessions s left join public.classes c on c.id = s.class_id and c.owner_id = s.owner_id where s.session_type in ('regular', 'extra') and c.id is null) as broken_regular_sessions,
    (select count(*) from public.class_sessions s left join public.temporary_classes tc on tc.id = s.temporary_class_id and tc.owner_id = s.owner_id where s.session_type = 'temporary' and tc.id is null) as broken_temporary_sessions,
    (select count(*) from public.session_schedule_changes ch left join public.class_sessions s on s.id = ch.session_id and s.owner_id = ch.owner_id where s.id is null) as broken_schedule_changes,
    (select count(*) from public.attendance_records ar left join public.students s on s.id = ar.student_id and s.owner_id = ar.owner_id where s.id is null) as broken_attendance_students,
    (select count(*) from public.attendance_records ar left join public.class_sessions s on s.id = ar.session_id and s.owner_id = ar.owner_id where s.id is null) as broken_attendance_sessions,
    (select count(*) from public.attendance_records ar left join storage.objects o on o.bucket_id = 'signatures' and o.name = ar.signature_path where o.id is null) as missing_signature_files,
    (select count(*) from storage.objects o left join public.attendance_records ar on ar.signature_path = o.name where o.bucket_id = 'signatures' and ar.id is null) as orphan_signature_files,
    (select count(*) from public.attendance_corrections ac left join public.attendance_records ar on ar.id = ac.attendance_record_id and ar.owner_id = ac.owner_id where ar.id is null) as broken_attendance_corrections,
    (select count(*) from public.makeup_links ml left join public.enrollments e on e.id = ml.source_enrollment_id and e.owner_id = ml.owner_id where e.id is null) as broken_makeup_enrollments,
    (select count(*) from public.monthly_fees mf left join public.enrollments e on e.id = mf.enrollment_id and e.owner_id = mf.owner_id where e.id is null) as broken_monthly_fees,
    (select count(*) from public.school_exam_scores sc left join public.school_exams ex on ex.id = sc.exam_id and ex.owner_id = sc.owner_id where ex.id is null) as broken_school_scores,
    (select count(*) from public.tuition_quiz_scores sc left join public.tuition_quizzes q on q.id = sc.quiz_id and q.owner_id = sc.owner_id where q.id is null) as broken_quiz_scores,
    (select count(*) from public.temporary_class_enrollments e left join public.temporary_classes tc on tc.id = e.temporary_class_id and tc.owner_id = e.owner_id where tc.id is null) as broken_temporary_enrollments,
    (select count(*) from public.temporary_class_payments p left join public.temporary_class_enrollments e on e.id = p.temporary_class_enrollment_id and e.owner_id = p.owner_id where e.id is null) as broken_temporary_payments
), receipts as (
  select
    (select count(*) from public.monthly_fees where payment_status = 'paid' and receipt_status = 'pending') as pending_monthly_receipts,
    (select count(*) from public.temporary_class_payments where payment_status = 'paid' and receipt_status = 'pending') as pending_temporary_receipts,
    (select count(*) from public.receipt_queue where receipt_status = 'pending') as unified_pending_receipts
), security as (
  select count(*) as rls_enabled_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array[
      'profiles', 'students', 'subjects', 'classes', 'enrollments',
      'class_schedule_rules', 'class_sessions', 'session_schedule_changes',
      'attendance_records', 'attendance_corrections', 'makeup_links',
      'monthly_fees', 'activity_logs', 'school_exams', 'school_exam_scores',
      'tuition_quizzes', 'tuition_quiz_scores', 'temporary_classes',
      'temporary_class_enrollments', 'temporary_class_payments'
    ])
    and c.relrowsecurity
)
select * from integrity cross join receipts cross join security;

