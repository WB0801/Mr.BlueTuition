import type { Student } from '../../../types/domain'

interface StudentIdentityProps {
  student: Pick<Student, 'name' | 'school_class' | 'phone'>
}

export function StudentIdentity({ student }: StudentIdentityProps) {
  const schoolClass = student.school_class || '学校班级未填写'
  const phone = student.phone || '电话未填写'

  return (
    <span className="student-identity">
      <strong>{student.name}</strong>
      <span>{schoolClass} · {phone}</span>
    </span>
  )
}
