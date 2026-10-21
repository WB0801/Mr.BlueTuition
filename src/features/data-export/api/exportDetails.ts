import type { MonthlyFee, TemporaryClassPayment, TuitionQuiz, TuitionQuizScore, SchoolExam, SchoolExamScore, Subject } from '../../../types/domain'
import { formatMalaysiaDateTime, toMalaysiaDateInput } from '../../../utils/format'
import { formatQuizPercentage } from '../../grades/quizScoreDisplay'
import { exportDateIncluded, exportMonthIncluded, type ExportSheet } from '../exportRules'
import { atEnrollmentDate, required, type ExportScope } from './dataExportService'
import type { ExportReader } from './exportReader'

const paymentLabels: Record<string,string> = {unpaid:'未缴',paid:'已缴',waived:'免缴'}
const receiptLabels: Record<string,string> = {not_applicable:'不适用',pending:'待处理',completed:'已处理'}
function amount(value: unknown): number {
  if (typeof value!=='number' || !Number.isFinite(value) || value<0) throw new Error('收费金额异常，未导出不完整文件。')
  return value
}
function numberOrBlank(value: unknown): number|null {
  if (value===null || value===undefined || value==='') return null
  if (typeof value!=='number' || !Number.isFinite(value)) throw new Error('成绩数值异常，请核对后重试。')
  return value
}
export async function buildFeeSheet(scope: ExportScope, read: ExportReader): Promise<ExportSheet> {
  const sheet: ExportSheet={name:'学费记录',headers:['类别','班级','学生','收费月份或上课日期','实际应缴金额','缴费状态','缴费时间','收据状态'],rows:[]}
  const monthly = await read<MonthlyFee>('monthly_fees',{column:'enrollment_id',ids:scope.enrollments.map(e=>e.id)})
  for (const fee of monthly) {
    const e = required(scope.enrollments.find(e=>e.id===fee.enrollment_id),'报读')
    if (e.student_id!==fee.student_id) throw new Error('月费学生与报读不匹配。')
    if (!exportMonthIncluded(fee.fee_month,scope.options)) continue
    sheet.rows.push(['常态班',required(scope.regular.find(c=>c.id===e.class_id),'班级').name,required(scope.students.get(e.student_id),'学生').name,fee.fee_month.slice(0,7),amount(fee.actual_amount),required(paymentLabels[fee.payment_status],'缴费状态'),fee.paid_at?formatMalaysiaDateTime(fee.paid_at):null,required(receiptLabels[fee.receipt_status],'收据状态')])
  }
  const temporary = await read<TemporaryClassPayment>('temporary_class_payments',{column:'temporary_class_enrollment_id',ids:scope.temporaryEnrollments.map(e=>e.id)})
  for (const fee of temporary) {
    const e = required(scope.temporaryEnrollments.find(e=>e.id===fee.temporary_class_enrollment_id),'临时班报名')
    const c = required(scope.temporary.find(c=>c.id===e.temporary_class_id),'临时班')
    const date = toMalaysiaDateInput(c.start_at)
    if (!exportDateIncluded(date,scope.options)) continue
    sheet.rows.push(['临时班',c.name,required(scope.students.get(e.student_id),'学生').name,date,amount(fee.amount),required(paymentLabels[fee.payment_status],'缴费状态'),fee.paid_at?formatMalaysiaDateTime(fee.paid_at):null,required(receiptLabels[fee.receipt_status],'收据状态')])
  }
  return sheet
}

export async function buildGradeSheets(scope: ExportScope, read: ExportReader): Promise<ExportSheet[]> {
  const sheets: ExportSheet[]=[]
  if (scope.options.details.includes('quizzes')) {
    const sheet: ExportSheet={name:'小考成绩',headers:['班级','小考名称','日期','学生','原始分数','满分','百分比'],rows:[]}
    const quizzes=(await read<TuitionQuiz>('tuition_quizzes',{column:'class_id',ids:scope.regular.map(c=>c.id)})).filter(q=>exportDateIncluded(q.quiz_date,scope.options))
    const scores=await read<TuitionQuizScore>('tuition_quiz_scores',{column:'quiz_id',ids:quizzes.map(q=>q.id)},{column:'enrollment_id',ids:scope.enrollments.map(e=>e.id)})
    for (const score of scores) {
      const q=required(quizzes.find(q=>q.id===score.quiz_id),'小考')
      const e=scope.enrollments.find(e=>e.id===score.enrollment_id && e.student_id===score.student_id && e.class_id===q.class_id && atEnrollmentDate(e,q.quiz_date))
      if (!e) continue
      sheet.rows.push([required(scope.regular.find(c=>c.id===q.class_id),'班级').name,q.name,q.quiz_date,required(scope.students.get(score.student_id),'学生').name,numberOrBlank(score.score),numberOrBlank(q.max_score),formatQuizPercentage(score.score,q.max_score)])
    }
    sheets.push(sheet)
  }
  if (scope.options.details.includes('school')) {
    const sheet: ExportSheet={name:'学校考试成绩',headers:['考试名称','科目','日期','学生','分数','满分'],rows:[]}
    const subjects=[...new Set([...scope.regular,...scope.temporary].map(c=>c.subject_id))]
    const exams=(await read<SchoolExam>('school_exams',{column:'subject_id',ids:subjects})).filter(q=>exportDateIncluded(q.exam_date,scope.options))
    const subjectNames=new Map((await read<Subject>('subjects',{column:'id',ids:exams.map(e=>e.subject_id)})).map(s=>[s.id,s.name]))
    const scores=await read<SchoolExamScore>('school_exam_scores',{column:'exam_id',ids:exams.map(e=>e.id)},{column:'student_id',ids:[...scope.students.keys()]})
    const pairs=new Set([
      ...scope.enrollments.map(e=>`${e.student_id}:${required(scope.regular.find(c=>c.id===e.class_id),'班级').subject_id}`),
      ...scope.temporaryEnrollments.map(e=>`${e.student_id}:${required(scope.temporary.find(c=>c.id===e.temporary_class_id),'临时班').subject_id}`),
    ])
    for (const score of scores) {
      const exam=required(exams.find(e=>e.id===score.exam_id),'学校考试')
      if (!pairs.has(`${score.student_id}:${exam.subject_id}`)) continue
      sheet.rows.push([exam.name,required(subjectNames.get(exam.subject_id),'科目'),exam.exam_date,required(scope.students.get(score.student_id),'学生').name,numberOrBlank(score.score),numberOrBlank(exam.max_score)])
    }
    sheets.push(sheet)
  }
  return sheets
}
