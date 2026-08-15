export interface BackupTableDefinition {
  name: string
  columns: readonly string[]
}

export const BACKUP_TABLES = [
  { name: 'students', columns: ['id', 'owner_id', 'name', 'school_class', 'phone', 'created_at', 'updated_at'] },
  { name: 'subjects', columns: ['id', 'owner_id', 'name', 'created_at', 'updated_at'] },
  { name: 'classes', columns: ['id', 'owner_id', 'subject_id', 'name', 'weekday', 'start_time', 'end_time', 'monthly_fee', 'start_date', 'end_date', 'status', 'created_at', 'updated_at', 'schedule_summary_rule_id'] },
  { name: 'enrollments', columns: ['id', 'owner_id', 'student_id', 'class_id', 'join_date', 'end_date', 'status', 'created_at', 'updated_at', 'transferred_from_enrollment_id'] },
  { name: 'class_schedule_rules', columns: ['id', 'owner_id', 'class_id', 'schedule_slot_id', 'weekday', 'start_time', 'end_time', 'effective_from', 'effective_to', 'created_at', 'updated_at'] },
  { name: 'class_sessions', columns: ['id', 'owner_id', 'class_id', 'temporary_class_id', 'schedule_rule_id', 'session_type', 'schedule_week', 'original_start_at', 'original_end_at', 'current_start_at', 'current_end_at', 'status', 'cancelled_at', 'created_at', 'updated_at'] },
  { name: 'session_schedule_changes', columns: ['id', 'owner_id', 'session_id', 'old_start_at', 'old_end_at', 'new_start_at', 'new_end_at', 'changed_at'] },
  { name: 'attendance_records', columns: ['id', 'owner_id', 'student_id', 'session_id', 'makeup_link_id', 'client_request_id', 'participation_type', 'signing_type', 'captured_at', 'synced_at', 'capture_source', 'signature_path', 'signature_mime_type', 'signature_byte_size', 'status', 'voided_at', 'created_at', 'updated_at'] },
  { name: 'attendance_corrections', columns: ['id', 'owner_id', 'attendance_record_id', 'correction_type', 'corrected_at', 'created_at'] },
  { name: 'makeup_links', columns: ['id', 'owner_id', 'student_id', 'source_enrollment_id', 'target_session_id', 'source_session_id', 'link_type', 'created_at'] },
  { name: 'monthly_fees', columns: ['id', 'owner_id', 'student_id', 'enrollment_id', 'fee_month', 'normal_amount', 'actual_amount', 'payment_status', 'paid_at', 'receipt_status', 'receipt_completed_at', 'created_at', 'updated_at'] },
  { name: 'school_exams', columns: ['id', 'owner_id', 'subject_id', 'year', 'exam_date', 'name', 'max_score', 'created_at', 'updated_at'] },
  { name: 'school_exam_scores', columns: ['id', 'owner_id', 'exam_id', 'student_id', 'score', 'created_at', 'updated_at'] },
  { name: 'tuition_quizzes', columns: ['id', 'owner_id', 'class_id', 'name', 'quiz_date', 'max_score', 'created_at', 'updated_at'] },
  { name: 'tuition_quiz_scores', columns: ['id', 'owner_id', 'quiz_id', 'student_id', 'enrollment_id', 'score', 'created_at', 'updated_at'] },
  { name: 'temporary_classes', columns: ['id', 'owner_id', 'subject_id', 'name', 'start_at', 'end_at', 'fee_amount', 'status', 'created_at', 'updated_at'] },
  { name: 'temporary_class_enrollments', columns: ['id', 'owner_id', 'temporary_class_id', 'student_id', 'joined_at', 'status', 'created_at'] },
  { name: 'temporary_class_payments', columns: ['id', 'owner_id', 'temporary_class_enrollment_id', 'amount', 'payment_status', 'paid_at', 'receipt_status', 'receipt_completed_at', 'created_at', 'updated_at'] },
  { name: 'activity_logs', columns: ['id', 'owner_id', 'action_type', 'entity_type', 'entity_id', 'description', 'created_at'] },
] as const satisfies readonly BackupTableDefinition[]

export type BackupTableName = (typeof BACKUP_TABLES)[number]['name']
export type BackupRecord = Record<string, unknown>
export type BackupTableData = Record<BackupTableName, BackupRecord[]>
