import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareDataExport, listExportClasses } from './dataExportService'

const db = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, requests: [] as { table: string; columns: string; filters: [string,string,unknown][] }[], cap: 2, fail: '', aborted: false }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({ from(table: string) {
  let columns = '', from = 0, to = 199
  const filters: [string,string,unknown][] = []
  const q = {
    select(s: string) { columns = s; return q }, eq(k: string,v: unknown) { filters.push(['eq',k,v]); return q },
    in(k: string,v: unknown[]) { filters.push(['in',k,v]); return q }, order() { return q },
    range(a: number,b: number) { from=a;to=b;return q }, abortSignal() { return q },
    then(resolve: (v: unknown) => unknown) {
      db.requests.push({table,columns,filters})
      const rows = (db.rows[table] ?? []).filter(r => filters.every(([op,k,v]) => op==='eq' ? r[k]===v : (v as unknown[]).includes(r[k])))
      return Promise.resolve(resolve({ data: rows.slice(from,Math.min(to+1,from+db.cap)), error: db.fail===table && from>0 ? new Error('页中失败') : null }))
    },
  }; return q
} }) }))

const owner = 'owner-fixture'
const base = { owner_id: owner }
const regular = (id: string, extra = {}) => ({ ...base, id, name: '同名班', subject_id: 'math', status: 'active', start_date: '2025-01-01', end_date: null, ...extra })
const enrollment = (id: string, student_id: string, class_id = 'c1', extra = {}) => ({ ...base, id, student_id, class_id, status: 'active', join_date: '2026-01-01', end_date: null, ...extra })
const options = { classKeys: ['regular:c1'], history: false, details: [] as ('attendance'|'quizzes'|'school'|'fees')[], start: '', end: '' }
const now = new Date('2026-10-20T16:00:00Z')
beforeEach(() => {
  db.requests=[];db.cap=2;db.fail=''
  db.rows = {
    classes: [regular('c1'),regular('c2'),regular('old',{status:'ended',end_date:'2025-12-31'})],
    students: ['s1','s2','s3'].map(id=>({...base,id,name:'同名学生',school_class:'高一',phone:'012-3456789'})),
    enrollments: [enrollment('e1','s1'),enrollment('e2','s2'),enrollment('future','s3','c1',{join_date:'2026-10-22'}),enrollment('past','s1','c1',{status:'ended',join_date:'2025-01-01',end_date:'2025-12-31'}),enrollment('other','s1','c2'),enrollment('old-e','s3','old',{status:'ended',join_date:'2025-01-01',end_date:'2025-12-31'})],
  }
})
describe('read-only export scope and completeness', () => {
  it('default roster has exactly four columns, full capped pages and no optional reads, storage or RPC', async () => {
    const result = await prepareDataExport(owner,options,()=>{},undefined,now)
    expect(result.sheets.map(s=>s.name)).toEqual(['学生名单'])
    expect(result.sheets[0].headers).toEqual(['补习班班级','学生姓名','学校班级','电话'])
    expect(result.sheets[0].rows).toEqual([['同名班','同名学生','高一','012-3456789'],['同名班','同名学生','高一','012-3456789']])
    expect([...new Set(db.requests.map(r=>r.table))].sort()).toEqual(['classes','enrollments','students'])
    expect(db.requests.every(r=>r.columns!=='*' && r.filters.some(([op,k,v])=>op==='eq'&&k==='owner_id'&&v===owner))).toBe(true)
  })
  it('deduplicates same class/student not names, retains multiple classes and ended enrollments only when selected', async () => {
    const result = await prepareDataExport(owner,{...options,history:true,classKeys:['regular:c1','regular:c2','regular:old']},()=>{},undefined,now)
    expect(result.sheets[0].rows).toHaveLength(4)
    const choices = await listExportClasses(owner,'regular')
    expect(choices.map(c=>c.key)).toEqual(['regular:c1','regular:c2','regular:old'])
  })
  it('fails closed on a later page and retries cleanly; aborted export never starts another read', async () => {
    db.fail='enrollments'
    await expect(prepareDataExport(owner,options,()=>{},undefined,now)).rejects.toThrow()
    db.fail='';expect((await prepareDataExport(owner,options,()=>{},undefined,now)).sheets[0].rows).toHaveLength(2)
    const controller=new AbortController();controller.abort();const count=db.requests.length
    await expect(prepareDataExport(owner,options,()=>{},controller.signal,now)).rejects.toThrow()
    expect(db.requests).toHaveLength(count)
  })
  it('never mixes foreign owner rows and refuses missing selected identities', async () => {
    db.rows.students[0].owner_id='other'
    await expect(prepareDataExport(owner,options,()=>{},undefined,now)).rejects.toThrow(/关联|资料/)
  })
  it('quiz zero is numeric, blanks stay missing, percentages reuse display rule; no other class or enrollment', async () => {
    db.rows.tuition_quizzes=[{...base,id:'q',class_id:'c1',name:'小考',quiz_date:'2026-10-21',max_score:3}]
    db.rows.tuition_quiz_scores=[{...base,id:'a',quiz_id:'q',student_id:'s1',enrollment_id:'e1',score:1},{...base,id:'b',quiz_id:'q',student_id:'s2',enrollment_id:'e2',score:0},{...base,id:'c',quiz_id:'q',student_id:'s1',enrollment_id:'other',score:2}]
    const result=await prepareDataExport(owner,{...options,details:['quizzes']},()=>{},undefined,now)
    expect(result.sheets[1].rows).toEqual([['同名班','小考','2026-10-21','同名学生',1,3,'33.3%'],['同名班','小考','2026-10-21','同名学生',0,3,'0%']])
    expect(db.requests.find(r=>r.table==='tuition_quiz_scores')!.filters).toContainEqual(['in','enrollment_id',['e1','e2']])
  })
  it('school scores follow selected student/subject pairs and deduplicate, not all subjects of a student', async () => {
    db.rows.subjects=[{...base,id:'math',name:'数学'},{...base,id:'english',name:'英文'}]
    db.rows.school_exams=[{...base,id:'ex',subject_id:'math',name:'期末',exam_date:'2026-10-21',max_score:100},{...base,id:'wrong',subject_id:'english',name:'英文期末',exam_date:'2026-10-21',max_score:100}]
    db.rows.school_exam_scores=[{...base,id:'sx',exam_id:'ex',student_id:'s1',score:0},{...base,id:'bad',exam_id:'wrong',student_id:'s1',score:90}]
    const result=await prepareDataExport(owner,{...options,classKeys:['regular:c1','regular:c2'],details:['school']},()=>{},undefined,now)
    expect(result.sheets[1].rows).toEqual([['期末','数学','2026-10-21','同名学生',0,100]])
    expect(db.requests.find(r=>r.table==='school_exam_scores')!.filters).toContainEqual(['in','student_id',['s1','s2']])
  })
  it('uses original monthly snapshots/waived/zero and temporary IDs/amount without paid-month filtering', async () => {
    db.rows.temporary_classes=[{...base,id:'c1',name:'同名班',subject_id:'math',status:'ended',start_at:'2026-10-31T16:00:00Z',end_at:'2026-10-31T17:00:00Z'}]
    db.rows.temporary_class_enrollments=[{...base,id:'te',temporary_class_id:'c1',student_id:'s1',status:'ended',joined_at:'2026-10-01T00:00:00Z'}]
    db.rows.temporary_class_payments=[{...base,id:'tp',temporary_class_enrollment_id:'te',amount:25.5,payment_status:'paid',paid_at:'2026-12-31T16:00:00Z',receipt_status:'completed'}]
    db.rows.monthly_fees=[{...base,id:'m',student_id:'s1',enrollment_id:'e1',fee_month:'2026-11-01',actual_amount:0,payment_status:'waived',paid_at:null,receipt_status:'not_applicable'}]
    const result=await prepareDataExport(owner,{...options,history:true,classKeys:['regular:c1','temporary:c1'],details:['fees'],start:'2026-11-01',end:'2026-11-01'},()=>{},undefined,now)
    expect(result.sheets[0].rows).toHaveLength(3)
    expect(result.sheets[1].rows).toEqual([['常态班','同名班','同名学生','2026-11',0,'免缴',null,'不适用'],['临时班','同名班','同名学生','2026-11-01',25.5,'已缴','2027/1/1 00:00','已处理']])
  })
  it('reads more than 1000 rows and batches UUIDs without truncation or duplicate roster identities',async()=>{
    db.cap=137
    db.rows.enrollments=Array.from({length:1107},(_,i)=>enrollment('e'+i,'s'+i))
    db.rows.students=Array.from({length:1107},(_,i)=>({...base,id:'s'+i,name:'虚构'+i,school_class:null,phone:i%2?'012-0000000':'+60 (12) 000-0000'}))
    const result=await prepareDataExport(owner,options,()=>{},undefined,now)
    expect(result.sheets[0].rows).toHaveLength(1107)
    expect(db.requests.filter(r=>r.table==='students').every(r=>(r.filters.find(([op])=>op==='in')![2] as string[]).length<=50)).toBe(true)
  })
  it('current means Malaysia today plus both class and enrollment date/status, not status alone',async()=>{
    db.rows.enrollments=[enrollment('midnight','s1','c1',{join_date:'2026-10-21'}),enrollment('ended','s2','c1',{end_date:'2026-10-20'}),enrollment('future','s3','c1',{join_date:'2026-10-22'})]
    expect((await prepareDataExport(owner,options,()=>{},undefined,now)).sheets[0].rows).toHaveLength(1)
    db.rows.classes[0].start_date='2026-10-22'
    expect((await prepareDataExport(owner,options,()=>{},undefined,now)).sheets[0].rows).toHaveLength(0)
  })
  it('keeps blanks separate from actual zero and invalid maximums never acquire a percentage',async()=>{
    db.rows.tuition_quizzes=[{...base,id:'q',class_id:'c1',name:'小考',quiz_date:'2026-10-21',max_score:0}]
    db.rows.tuition_quiz_scores=[{...base,id:'a',quiz_id:'q',student_id:'s1',enrollment_id:'e1',score:null},{...base,id:'b',quiz_id:'q',student_id:'s2',enrollment_id:'e2',score:0}]
    const result=await prepareDataExport(owner,{...options,details:['quizzes']},()=>{},undefined,now)
    expect(result.sheets[1].rows.map(r=>r.slice(4))).toEqual([[null,0,null],[0,0,null]])
  })
  it('date filter changes detail only, with quiz endpoints and zero-row selected sheets retained',async()=>{
    db.rows.tuition_quizzes=[{...base,id:'q',class_id:'c1',name:'小考',quiz_date:'2026-10-21',max_score:20}]
    db.rows.tuition_quiz_scores=[{...base,id:'a',quiz_id:'q',student_id:'s1',enrollment_id:'e1',score:14}]
    const a=await prepareDataExport(owner,{...options,details:['quizzes','fees'],start:'2026-10-21',end:'2026-10-21'},()=>{},undefined,now)
    const b=await prepareDataExport(owner,{...options,details:['quizzes'],start:'2026-10-22',end:'2026-10-22'},()=>{},undefined,now)
    expect(a.sheets[1].rows).toHaveLength(1);expect(b.sheets[1].rows).toEqual([])
    expect(b.sheets[0].rows).toEqual(a.sheets[0].rows);expect(a.sheets[2].headers).toContain('实际应缴金额')
  })
  it('derives attendance from existing dated eligibility, valid signatures and verified makeup, never a generated roster RPC',async()=>{
    db.rows.enrollments=[enrollment('e1','s1')]
    const s=(id:string,date:string,status='scheduled',class_id='c1')=>({...base,id,class_id,temporary_class_id:null,session_type:'regular',current_start_at:date+'T06:00:00Z',current_end_at:date+'T08:00:00Z',status})
    db.rows.class_sessions=[s('source','2026-10-20'),s('today','2026-10-21'),s('future','2026-10-22'),s('stop','2026-10-19','cancelled'),s('backfill','2026-10-18'),s('madeup','2026-10-21','scheduled','c2')]
    db.rows.makeup_links=[{...base,id:'ml',student_id:'s1',source_enrollment_id:'e1',source_session_id:'source',target_session_id:'madeup',link_type:'makeup'}]
    db.rows.attendance_records=[{...base,id:'ar',student_id:'s1',session_id:'madeup',status:'valid',participation_type:'makeup',makeup_link_id:'ml',signing_type:'checkin',captured_at:'2026-10-21T06:05:00Z'},{...base,id:'bf',student_id:'s1',session_id:'backfill',status:'valid',participation_type:'regular',makeup_link_id:null,signing_type:'backfill',captured_at:'2026-10-21T06:06:00Z'}]
    const result=await prepareDataExport(owner,{...options,details:['attendance']},()=>{},undefined,now)
    expect(result.sheets[1].rows.map(r=>r[5])).toEqual(['缺席 · 已补课','尚未签到','尚未点名','停课，不计缺席','已补签'])
    expect(result.sheets[1].rows[0][8]).toBe('原课：2026/10/20 14:00；实际补课：2026/10/21 14:00')
    expect(result.sheets[1].rows).toHaveLength(5)
    expect(db.requests.every(r=>!r.columns.includes('signature'))).toBe(true)
    expect(db.requests.filter(r=>['attendance_records','makeup_links'].includes(r.table)).every(r=>r.filters.some(([op,k,ids])=>op==='in'&&k==='student_id'&&(ids as string[]).join(',')==='s1'))).toBe(true)
  })
  it('guest target and source are distinct absent/present rows, never two attendances, and unknown relationships are not guessed',async()=>{
    db.rows.enrollments=[enrollment('e1','s1')]
    db.rows.class_sessions=['c1','c2'].map((class_id,i)=>({...base,id:'ss'+i,class_id,session_type:'regular',status:'scheduled',current_start_at:'2026-10-19T06:00:00Z',current_end_at:'2026-10-19T08:00:00Z'}))
    db.rows.makeup_links=[{...base,id:'ml',student_id:'s1',source_enrollment_id:'e1',source_session_id:'ss0',target_session_id:'ss1',link_type:'makeup'}]
    db.rows.attendance_records=[{...base,id:'ar',student_id:'s1',session_id:'ss1',status:'valid',participation_type:'makeup',makeup_link_id:'ml',signing_type:'checkin',captured_at:'2026-10-19T06:00:00Z'}]
    const result=await prepareDataExport(owner,{...options,classKeys:['regular:c1','regular:c2'],details:['attendance']},()=>{},undefined,now)
    expect(result.sheets[1].rows.map(r=>r[5])).toEqual(['缺席 · 已补课','已签到'])
    expect(result.sheets[1].rows[1][7]).toBe('补课')
  })
  it('does not reinterpret an unselected historical regular enrollment as a guest in another selected class',async()=>{
    db.rows.enrollments=[enrollment('e1','s1'),enrollment('old-target','s1','c2',{status:'ended',join_date:'2026-01-01',end_date:'2026-09-30'})]
    db.rows.class_sessions=[{...base,id:'target',class_id:'c2',session_type:'regular',status:'scheduled',current_start_at:'2026-09-01T06:00:00Z',current_end_at:'2026-09-01T08:00:00Z'}]
    db.rows.makeup_links=[{...base,id:'ml',student_id:'s1',source_enrollment_id:'e1',source_session_id:'source',target_session_id:'target',link_type:'makeup'}]
    const result=await prepareDataExport(owner,{...options,classKeys:['regular:c1','regular:c2'],details:['attendance']},()=>{},undefined,now)
    expect(result.sheets[1].rows).toEqual([])
  })
})
