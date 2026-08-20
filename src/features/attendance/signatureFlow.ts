export function findNextUnsignedStudentId(
  entries: Array<{ student_id: string; attendance_record_id: string | null }>,
  currentStudentId: string,
) {
  return entries.find((entry) => entry.student_id !== currentStudentId && !entry.attendance_record_id)?.student_id ?? null
}
