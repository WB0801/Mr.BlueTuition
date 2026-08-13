export interface Student {
  id: string
  owner_id: string
  name: string
  school_class: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface Subject {
  id: string
  owner_id: string
  name: string
  created_at: string
  updated_at: string
}

export type ClassStatus = 'active' | 'ended'

export interface TuitionClass {
  id: string
  owner_id: string
  subject_id: string
  name: string
  weekday: number
  start_time: string
  end_time: string
  monthly_fee: number
  start_date: string
  end_date: string | null
  status: ClassStatus
  created_at: string
  updated_at: string
  subject?: Pick<Subject, 'id' | 'name'> | null
  schedule_summary_rule_id?: string | null
}

export type EnrollmentStatus = 'active' | 'ended'

export interface Enrollment {
  id: string
  owner_id: string
  student_id: string
  class_id: string
  join_date: string
  end_date: string | null
  status: EnrollmentStatus
  created_at: string
  updated_at: string
}

export interface EnrollmentWithClass extends Enrollment {
  class: TuitionClass | null
}

export interface EnrollmentWithStudent extends Enrollment {
  student: Student | null
}

export interface EnrollmentDetails extends Enrollment {
  student: Student | null
  class: TuitionClass | null
}

export interface StudentInput {
  name: string
  school_class: string
  phone: string
}

export interface ClassInput {
  subject_id: string
  name: string
  weekday: number
  start_time: string
  end_time: string
  monthly_fee: number
  start_date: string
}

export type SessionType = 'regular' | 'extra'
export type SessionStatus = 'scheduled' | 'cancelled' | 'completed'

export interface ClassScheduleRule {
  id: string
  owner_id: string
  class_id: string
  schedule_slot_id: string
  weekday: number
  start_time: string
  end_time: string
  effective_from: string
  effective_to: string | null
  created_at: string
  updated_at: string
}

export interface ClassSession {
  id: string
  owner_id: string
  class_id: string
  schedule_rule_id: string | null
  session_type: SessionType
  schedule_week: string | null
  original_start_at: string
  original_end_at: string
  current_start_at: string
  current_end_at: string
  status: SessionStatus
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface ClassSessionWithClass extends ClassSession {
  class: (Pick<TuitionClass, 'id' | 'name' | 'status'> & {
    subject?: Pick<Subject, 'id' | 'name'> | null
  }) | null
}

export interface SessionScheduleChange {
  id: string
  owner_id: string
  session_id: string
  old_start_at: string
  old_end_at: string
  new_start_at: string
  new_end_at: string
  changed_at: string
}

export interface ScheduleChangePreview {
  affected_count: number
  manually_adjusted_count: number
}

export interface ScheduleChangeInput {
  weekday: number
  start_time: string
  end_time: string
  effective_from: string
}
