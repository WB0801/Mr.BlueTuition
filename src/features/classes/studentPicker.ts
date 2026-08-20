export function filterEligibleStudents<T extends { id: string; name: string; school_class: string | null; phone: string | null }>(
  students: T[],
  enrolledStudentIds: string[],
  search: string,
) {
  const enrolled = new Set(enrolledStudentIds)
  const keyword = search.trim().toLocaleLowerCase()
  return students.filter((student) => {
    if (enrolled.has(student.id)) return false
    if (!keyword) return true
    return [student.name, student.school_class, student.phone]
      .some((value) => value?.toLocaleLowerCase().includes(keyword))
  })
}
