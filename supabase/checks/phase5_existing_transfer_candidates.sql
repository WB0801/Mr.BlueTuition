-- Read-only preflight for Phase 5. Run this before the migration.
--
-- A returned row is only a candidate: Phase 2 stored the dates but did not
-- store whether the teacher used the transfer action. Confirm each row with
-- the teacher before adding transferred_from_enrollment_id. An empty result
-- means no historical backfill is required.

select
  s.name as student_name,
  previous.id as previous_enrollment_id,
  previous_class.name as previous_class_name,
  previous.join_date as previous_join_date,
  previous.end_date as previous_end_date,
  successor.id as successor_enrollment_id,
  successor_class.name as successor_class_name,
  successor.join_date as successor_join_date,
  subject.name as subject_name
from public.enrollments previous
join public.enrollments successor
  on successor.owner_id = previous.owner_id
  and successor.student_id = previous.student_id
  and successor.class_id <> previous.class_id
  and successor.join_date = previous.end_date + 1
join public.students s
  on s.id = previous.student_id and s.owner_id = previous.owner_id
join public.classes previous_class
  on previous_class.id = previous.class_id
  and previous_class.owner_id = previous.owner_id
join public.classes successor_class
  on successor_class.id = successor.class_id
  and successor_class.owner_id = successor.owner_id
  and successor_class.subject_id = previous_class.subject_id
join public.subjects subject
  on subject.id = previous_class.subject_id
  and subject.owner_id = previous.owner_id
where previous.status = 'ended'
  and previous.end_date is not null
order by successor.join_date, s.name;
