import type { AttendanceRecord, ClassSession, MakeupLink } from '../../../types/domain'
import { formatMalaysiaDateTime, toMalaysiaDateInput, toMalaysiaTimeInput } from '../../../utils/format'
import { exportDateIncluded, type ExportSheet } from '../exportRules'
import { atEnrollmentDate, required, type ExportScope } from './dataExportService'
import type { ExportReader } from './exportReader'

export async function buildAttendanceSheet(scope: ExportScope, read: ExportReader, signal?: AbortSignal): Promise<ExportSheet> {
  const sheet: ExportSheet={name:'出席记录',headers:['班级','学生','课程日期','开始时间','结束时间','出席状态','签到时间','补签／补课','关联课程'],rows:[]}
  const sessions=[
    ...await read<ClassSession>('class_sessions',{column:'class_id',ids:scope.regular.map(c=>c.id)}),
    ...await read<ClassSession>('class_sessions',{column:'temporary_class_id',ids:scope.temporary.map(c=>c.id)}),
  ].filter(s=>exportDateIncluded(toMalaysiaDateInput(s.current_start_at),scope.options))
  const ids=sessions.map(s=>s.id)
  const students={column:'student_id',ids:[...scope.students.keys()]}
  const links=new Map([
    ...await read<MakeupLink>('makeup_links',{column:'source_session_id',ids},students),
    ...await read<MakeupLink>('makeup_links',{column:'target_session_id',ids},students),
  ].filter(l=>scope.students.has(l.student_id)).map(l=>[l.id,l]))
  // Only fetch off-scope sessions needed to explain an included record. Never
  // export these as separate rows or include their unrelated students.
  const relatedIds=[...new Set([...links.values()].flatMap(l=>[l.target_session_id,...(l.source_session_id?[l.source_session_id]:[])]))].filter(id=>!ids.includes(id))
  const related=await read<ClassSession>('class_sessions',{column:'id',ids:relatedIds})
  const allSessions=new Map([...sessions,...related].map(s=>[s.id,s]))
  const attendance=(await read<AttendanceRecord>('attendance_records',{column:'session_id',ids:[...allSessions.keys()]},students)).filter(a=>a.status==='valid'&&scope.students.has(a.student_id))
  const records=new Map<string,AttendanceRecord>()
  for (const a of attendance) {
    const key=`${a.session_id}:${a.student_id}`
    if (records.has(key)) throw new Error('发现重复有效签到，无法核对导出。')
    records.set(key,a)
  }
  const displaySession=(id: string) => {
    const session=allSessions.get(id)
    return session ? formatMalaysiaDateTime(session.current_start_at) : '课程资料无法核实'
  }
  for (const session of sessions) {
    signal?.throwIfAborted()
    const date=toMalaysiaDateInput(session.current_start_at)
    const regular=scope.regular.find(c=>c.id===session.class_id), temporary=scope.temporary.find(c=>c.id===session.temporary_class_id)
    const klass=required(regular??temporary,'课程班级')
    const roster=new Map<string,MakeupLink|null>()
    if (session.session_type==='temporary') {
      for (const e of scope.temporaryEnrollments) if (e.temporary_class_id===session.temporary_class_id && e.status!=='cancelled') roster.set(e.student_id,null)
    } else {
      for (const e of scope.enrollments) if (e.class_id===session.class_id&&atEnrollmentDate(e,date)) roster.set(e.student_id,null)
      for (const l of links.values()) {
        // A target guest is in this export only through a selected source
        // enrollment, not simply because the student attends another selected class.
        if (l.target_session_id===session.id && !roster.has(l.student_id)
          && !scope.allEnrollments.some(e=>e.class_id===session.class_id&&e.student_id===l.student_id&&atEnrollmentDate(e,date))
          && scope.enrollments.some(e=>e.id===l.source_enrollment_id&&e.student_id===l.student_id)) roster.set(l.student_id,l)
      }
    }
    for (const [studentId,guest] of roster) {
      const a=records.get(`${session.id}:${studentId}`)
      const madeUp=[...links.values()].filter(l=>l.student_id===studentId&&l.source_session_id===session.id&&l.link_type==='makeup' && allSessions.get(l.target_session_id)?.status!=='cancelled' && records.has(`${l.target_session_id}:${studentId}`)).sort((a,b)=>required(records.get(`${b.target_session_id}:${studentId}`),'签到').captured_at.localeCompare(required(records.get(`${a.target_session_id}:${studentId}`),'签到').captured_at))[0]
      const state=session.status==='cancelled'?'停课，不计缺席':a?(a.signing_type==='backfill'?'已补签':'已签到'):date<scope.today?(madeUp&&!guest?'缺席 · 已补课':'缺席'):date===scope.today?'尚未签到':'尚未点名'
      const association=guest ? (guest.link_type==='makeup' ? `原课：${guest.source_session_id?displaySession(guest.source_session_id):'无法核实'}；实际补课：${displaySession(session.id)}` : '额外参与课程') : (!a&&madeUp?`原课：${displaySession(session.id)}；实际补课：${displaySession(madeUp.target_session_id)}`:null)
      sheet.rows.push([klass.name,required(scope.students.get(studentId),'学生').name,date,toMalaysiaTimeInput(session.current_start_at),toMalaysiaTimeInput(session.current_end_at),state,a?formatMalaysiaDateTime(a.captured_at):null,[a?.signing_type==='backfill'?'补签':null,guest?.link_type==='makeup'?'补课':guest?.link_type==='extra'?'额外参与':null].filter(Boolean).join('、')||null,association])
    }
  }
  return sheet
}
