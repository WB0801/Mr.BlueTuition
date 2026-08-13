export interface Student {
  id: string
  owner_id: string
  name: string
  school_class: string
  phone: string
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
