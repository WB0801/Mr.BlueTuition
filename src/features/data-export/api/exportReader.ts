import { requireSupabase } from '../../../lib/requireSupabase'
import { readAllPages } from '../../../utils/readAllPages'
import { ExportPreparationError } from '../exportRules'

// Deliberately no RPC / Storage / page hooks. Explicit fields, owner and UUID scope.
export const exportColumns = {
  classes: 'id,name,subject_id,status,start_date,end_date',
  temporary_classes: 'id,name,subject_id,status,start_at,end_at',
  enrollments: 'id,student_id,class_id,status,join_date,end_date',
  temporary_class_enrollments: 'id,temporary_class_id,student_id,status,joined_at',
  students: 'id,name,school_class,phone',
  subjects: 'id,name',
  class_sessions: 'id,class_id,temporary_class_id,session_type,current_start_at,current_end_at,status',
  attendance_records: 'id,student_id,session_id,makeup_link_id,participation_type,signing_type,captured_at,status',
  makeup_links: 'id,student_id,source_enrollment_id,target_session_id,source_session_id,link_type',
  tuition_quizzes: 'id,class_id,name,quiz_date,max_score',
  tuition_quiz_scores: 'id,quiz_id,student_id,enrollment_id,score',
  school_exams: 'id,subject_id,name,exam_date,max_score',
  school_exam_scores: 'id,exam_id,student_id,score',
  monthly_fees: 'id,student_id,enrollment_id,fee_month,actual_amount,payment_status,paid_at,receipt_status',
  temporary_class_payments: 'id,temporary_class_enrollment_id,amount,payment_status,paid_at,receipt_status',
} as const
export type ExportTable = keyof typeof exportColumns
const tableLabels: Record<ExportTable,string>={classes:'常态班',temporary_classes:'临时班',enrollments:'报读',temporary_class_enrollments:'临时班报名',students:'学生',subjects:'科目',class_sessions:'已存课程',attendance_records:'出席记录',makeup_links:'补课关联',tuition_quizzes:'小考',tuition_quiz_scores:'小考成绩',school_exams:'学校考试',school_exam_scores:'学校考试成绩',monthly_fees:'常态班学费',temporary_class_payments:'临时班费用'}

export function createExportReader(ownerId: string, signal?: AbortSignal) {
  if (!ownerId) throw new ExportPreparationError('无法确认目前登录账户。')
  return async function read<T extends {id:string}>(table: ExportTable, scope?: { column: string; ids: string[] }, restriction?: {column:string;ids:string[]}): Promise<T[]> {
    signal?.throwIfAborted()
    if ((scope && !scope.ids.length)||(restriction&&!restriction.ids.length)) return []
    const partition = (ids: string[]) => {const unique=[...new Set(ids)];return Array.from({length:Math.ceil(unique.length/50)},(_,i)=>unique.slice(i*50,i*50+50))}
    const chunks = scope ? partition(scope.ids) : [null]
    const bounds = restriction ? partition(restriction.ids) : [null]
    const rows: T[] = []
    for (const ids of chunks) {
      for (const boundedIds of bounds) {
      rows.push(...await readAllPages<T>(async (from,to) => {
        let query = requireSupabase().from(table).select(exportColumns[table]).eq('owner_id',ownerId).order('id')
        if (scope && ids) query = query.in(scope.column,ids)
        if (restriction && boundedIds) query = query.in(restriction.column,boundedIds)
        if (signal) query = query.abortSignal(signal)
        const {data,error} = await query.range(from,to)
        if (error) throw new ExportPreparationError(`读取${tableLabels[table]}失败，请重试。`, {cause:error})
        return (data ?? []) as unknown as T[]
      },signal))
      }
    }
    return rows
  }
}
export type ExportReader = ReturnType<typeof createExportReader>
