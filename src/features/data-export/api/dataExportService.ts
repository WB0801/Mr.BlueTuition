import type { Enrollment, Student, TuitionClass, TemporaryClass, TemporaryClassEnrollment } from '../../../types/domain'
import { formatMalaysiaDateTime, toMalaysiaDateInput } from '../../../utils/format'
import { exportFileName, validateExportOptions, type ExportClass, type ExportData, type ExportOptions } from '../exportRules'
import { createExportReader, type ExportReader } from './exportReader'
import { buildFeeSheet, buildGradeSheets } from './exportDetails'
import { buildAttendanceSheet } from './exportAttendance'

export interface ExportScope {
  regular: TuitionClass[]
  temporary: TemporaryClass[]
  enrollments: Enrollment[]
  allEnrollments: Enrollment[]
  temporaryEnrollments: TemporaryClassEnrollment[]
  students: Map<string,Student>
  options: ExportOptions
  today: string
}
export function atEnrollmentDate(e: Enrollment, date: string) { return e.join_date <= date && (!e.end_date || e.end_date >= date) }
export function required<T>(item: T | undefined, label: string): T {
  if (!item) throw new Error(`${label}关联资料不完整，请刷新后重试。`)
  return item
}
export async function listExportClasses(owner: string, kind: 'regular'|'temporary', signal?: AbortSignal): Promise<ExportClass[]> {
  const rows = await createExportReader(owner,signal)<{id:string;name:string;status:string}>(kind==='regular'?'classes':'temporary_classes')
  return rows.map(c=>({id:c.id,key:`${kind}:${c.id}`,kind,name:c.name,status:c.status}))
}

async function loadScope(read: ExportReader, options: ExportOptions, today: string): Promise<ExportScope> {
  const ids = (kind: string) => options.classKeys.filter(k=>k.startsWith(kind+':')).map(k=>k.split(':')[1])
  const regular = await read<TuitionClass>('classes',{column:'id',ids:ids('regular')})
  const temporary = await read<TemporaryClass>('temporary_classes',{column:'id',ids:ids('temporary')})
  if (regular.length !== new Set(ids('regular')).size || temporary.length !== new Set(ids('temporary')).size) throw new Error('所选班级资料已变化，请重新选择。')
  const allEnrollments = await read<Enrollment>('enrollments',{column:'class_id',ids:regular.map(c=>c.id)})
  const enrollments = allEnrollments.filter(e=> e.join_date <= today && (options.history || (e.status==='active' && atEnrollmentDate(e,today) && regular.some(c=>c.id===e.class_id && c.status==='active' && c.start_date<=today && (!c.end_date||c.end_date>=today)))))
  const allTemporary = await read<TemporaryClassEnrollment>('temporary_class_enrollments',{column:'temporary_class_id',ids:temporary.map(c=>c.id)})
  const temporaryEnrollments = allTemporary.filter(e=>options.history || (e.status==='active' && temporary.some(c=>c.id===e.temporary_class_id&&c.status==='active')))
  const studentIds = [...new Set([...enrollments,...temporaryEnrollments].map(e=>e.student_id))]
  const students = new Map((await read<Student>('students',{column:'id',ids:studentIds})).map(s=>[s.id,s]))
  for (const id of studentIds) required(students.get(id),'学生')
  return {regular,temporary,enrollments,allEnrollments,temporaryEnrollments,students,options,today}
}

export async function prepareDataExport(owner: string, input: ExportOptions, progress: (text:string)=>void = ()=>{}, signal?: AbortSignal, now = new Date()): Promise<ExportData> {
  const options = structuredClone(input) // A fixed selection, not the mutable page controls.
  validateExportOptions(options)
  const read = createExportReader(owner,signal)
  progress('正在读取班级与学生名单…')
  const scope = await loadScope(read,options,toMalaysiaDateInput(now.toISOString()))
  const roster = new Map<string,(string|null)[]>()
  for (const [kind,classes,enrollments] of [
    ['regular',scope.regular,scope.enrollments.map(e=>({classId:e.class_id,studentId:e.student_id}))],
    ['temporary',scope.temporary,scope.temporaryEnrollments.map(e=>({classId:e.temporary_class_id,studentId:e.student_id}))],
  ] as const) {
    for (const e of enrollments) {
      const c = required(classes.find(c=>c.id===e.classId),'班级'), s = required(scope.students.get(e.studentId),'学生')
      roster.set(`${kind}:${c.id}:${s.id}`,[c.name,s.name,s.school_class,s.phone])
    }
  }
  const sheets: ExportData['sheets'] = [{name:'学生名单',headers:['补习班班级','学生姓名','学校班级','电话'],rows:[...roster.values()]}]
  if (options.details.includes('attendance')) { progress('正在读取已存课程与出席…'); sheets.push(await buildAttendanceSheet(scope,read,signal)) }
  if (options.details.includes('quizzes') || options.details.includes('school')) { progress('正在读取成绩…'); sheets.push(...await buildGradeSheets(scope,read)) }
  if (options.details.includes('fees')) { progress('正在读取原始收费记录…'); sheets.push(await buildFeeSheet(scope,read)) }
  signal?.throwIfAborted()
  const names = [...scope.regular.map(c=>c.name),...scope.temporary.map(c=>`临时班：${c.name}`)]
  const range = `${names.join('、')}（${options.history?'包含历史报读':'当前有效报读'}）`
  return {sheets,range,dateScope:options.start?`${options.start} 至 ${options.end}`:'全部已存记录',exportedAt:formatMalaysiaDateTime(now.toISOString()),fileName:exportFileName(names.length===1?names[0]:'所选'+names.length+'个班级',now)}
}
