import type { Student } from '../../../types/domain'

interface StudentIdentityProps {
  student: Pick<Student, 'name' | 'school_class' | 'phone'>
}

export function StudentIdentity({ student }: StudentIdentityProps) {
  return (
    <span className="student-identity">
      <strong>{student.name}</strong>
      <span>{student.school_class} · {student.phone}</span>
    </span>
  )
}
