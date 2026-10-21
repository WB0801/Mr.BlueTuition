import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../components/shared/PageHeader'
import { useAuth } from '../auth/authContext'
import { usePwaUpdateGuard } from '../settings/pwa/updateProtection'
import { listExportClasses, prepareDataExport } from './api/dataExportService'
import { createExportWorkbook, downloadExportWorkbook } from './exportWorkbook'
import { exportErrorMessage, validateExportOptions, type ExportDetail } from './exportRules'

const detailLabels: [ExportDetail,string][]=[['attendance','出席记录'],['quizzes','小考成绩'],['school','学校考试成绩'],['fees','学费记录']]

export function DataExportPage() {
  const {user}=useAuth()
  const [params]=useSearchParams()
  const classId=params.get('classId')??''
  const [includeTemporary,setIncludeTemporary]=useState(false),[selection,setSelection]=useState<string[]|null>(null)
  const [history,setHistory]=useState(false),[details,setDetails]=useState<ExportDetail[]>([])
  const [limited,setLimited]=useState(false),[start,setStart]=useState(''),[end,setEnd]=useState('')
  const regularQuery=useQuery({queryKey:['data-export-classes',user?.id,'regular'],queryFn:({signal})=>listExportClasses(user!.id,'regular',signal),enabled:!!user?.id})
  const temporaryQuery=useQuery({queryKey:['data-export-classes',user?.id,'temporary'],queryFn:({signal})=>listExportClasses(user!.id,'temporary',signal),enabled:!!user?.id&&includeTemporary})
  const regular=regularQuery.data??[],temporary=includeTemporary?(temporaryQuery.data??[]):[]
  const loading=regularQuery.isPending||(includeTemporary&&temporaryQuery.isPending)
  const classError=regularQuery.isError||(includeTemporary&&temporaryQuery.isError)?'班级读取失败，请重试。':''
  const [preparing,setPreparing]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('')
  const operation=useRef<AbortController|null>(null),button=useRef<HTMLButtonElement>(null)
  const restoreFocus=useRef(false)
  useLayoutEffect(()=>{
    if(!preparing&&restoreFocus.current){restoreFocus.current=false;button.current?.focus({preventScroll:true})}
  },[preparing])
  const selected=selection??(classId?regular.filter(c=>c.id===classId).map(c=>c.key):regular.map(c=>c.key))
  usePwaUpdateGuard(preparing,'导出正在准备，请完成或取消准备后再更新。')
  const blocker=useBlocker(preparing)
  useEffect(()=>{
    if(blocker.state==='blocked') blocker.reset()
  },[blocker])
  useBeforeUnload(useCallback((event:BeforeUnloadEvent)=>{if(preparing){event.preventDefault();event.returnValue=''}},[preparing]))
  useEffect(()=>{
    document.title='导出资料 · 蓝老师补习班'
    return ()=>{operation.current?.abort();operation.current=null}
  },[])
  function toggle(key:string,checked:boolean) {
    setSelection(checked?[...new Set([...selected,key])]:selected.filter(k=>k!==key));setError('');setStatus('')
  }
  function cancel() {
    operation.current?.abort();operation.current=null;restoreFocus.current=true;setPreparing(false);setStatus('已取消准备。');setError('')
  }
  async function prepare() {
    if(operation.current || !user?.id) return
    const dated=limited&&details.length>0
    if(dated&&(!start||!end)){setError('请填写开始和结束日期。');return}
    const snapshot={classKeys:[...selected],history,details:[...details],start:dated?start:'',end:dated?end:''}
    try {validateExportOptions(snapshot)} catch(e) {setError(exportErrorMessage(e,'请选择有效范围。'));return}
    const controller=new AbortController();operation.current=controller
    setPreparing(true);setError('');setStatus('正在准备…')
    try {
      const data=await prepareDataExport(user.id,snapshot,text=>{if(operation.current===controller&&!controller.signal.aborted)setStatus(text)},controller.signal)
      controller.signal.throwIfAborted()
      setStatus('正在建立 Excel 文件…')
      const bytes=await createExportWorkbook(data,controller.signal)
      controller.signal.throwIfAborted()
      if(operation.current!==controller)return
      downloadExportWorkbook(bytes,data.fileName)
      setStatus(`已准备并交给浏览器下载：${data.sheets.map(s=>`${s.name} ${s.rows.length}笔`).join('、')}。`)
    } catch(e) {
      if(operation.current===controller&&!controller.signal.aborted){setStatus('');setError(exportErrorMessage(e,'导出失败，请重试。'))}
    } finally {
      if(operation.current===controller){operation.current=null;restoreFocus.current=true;setPreparing(false)}
    }
  }
  const choices=[...regular,...temporary]
  return <section className="management-page data-export-page">
    <PageHeader title="导出资料" backTo="/settings" backLabel="设置" />
    <div className="export-controls" aria-busy={preparing}>
      <fieldset disabled={preparing}>
        <legend>班级范围</legend>
        <div className="export-choice-row">
          <button type="button" className="button button-secondary" disabled={loading||!!classError} onClick={()=>setSelection(choices.map(c=>c.key))}>全选班级</button>
          <button type="button" className="button button-secondary" onClick={()=>setSelection([])}>取消全选</button>
          <label className="export-check"><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/>包含历史报读</label>
        </div>
        <h2>常态班</h2>
        {loading&&<p role="status">正在读取班级…</p>}
        {!loading&&!regular.length&&!classError&&<p className="field-hint">没有常态班。</p>}
        <div className="export-class-list">{regular.map(c=><label className="export-check" key={c.key}><input type="checkbox" checked={selected.includes(c.key)} onChange={e=>toggle(c.key,e.target.checked)}/><span>常态班：{c.name}{c.status==='ended'?'（已结束）':''}</span></label>)}</div>
        <label className="export-check"><input type="checkbox" checked={includeTemporary} onChange={e=>{setSelection(selected.filter(k=>!k.startsWith('temporary:')));setIncludeTemporary(e.target.checked)}}/>纳入临时班</label>
        {includeTemporary&&<><h2>临时班</h2><div className="export-class-list">{temporary.map(c=><label className="export-check" key={c.key}><input type="checkbox" checked={selected.includes(c.key)} onChange={e=>toggle(c.key,e.target.checked)}/><span>临时班：{c.name}{c.status==='ended'?'（已结束）':''}</span></label>)}</div>{!loading&&!temporary.length&&!classError&&<p className="field-hint">没有临时班。</p>}</>}
        {classId&&!loading&&!regular.some(c=>c.id===classId)&&<p role="alert" className="form-error">来源班级已不可用，请选择班级。</p>}
        {classError&&<div role="alert" className="form-error">{classError}<button type="button" className="button button-secondary" onClick={()=>{void regularQuery.refetch();if(includeTemporary)void temporaryQuery.refetch()}}>重试读取班级</button></div>}
      </fieldset>
      <fieldset disabled={preparing}>
        <legend>导出内容</legend>
        <label className="export-check"><input type="checkbox" checked disabled/>学生名单</label>
        <div className="export-detail-list">{detailLabels.map(([id,label])=><label className="export-check" key={id}><input type="checkbox" checked={details.includes(id)} onChange={e=>setDetails(e.target.checked?[...details,id]:details.filter(d=>d!==id))}/>{label}</label>)}</div>
      </fieldset>
      {details.length>0&&<fieldset disabled={preparing}>
        <legend>明细日期范围</legend>
        <label className="export-check"><input type="radio" name="export-date" checked={!limited} onChange={()=>setLimited(false)}/>全部已存记录</label>
        <label className="export-check"><input type="radio" name="export-date" checked={limited} onChange={()=>setLimited(true)}/>指定日期</label>
        {limited&&<div className="form-grid"><label className="field"><span>开始日期</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field"><span>结束日期</span><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}
        <p className="field-hint">日期只筛选明细，不改变学生名单。出席按实际课程日期，成绩按考试日期；月费按相交收费月份，临时班费用按上课日期，不按缴费时间。</p>
      </fieldset>}
      {error&&<p role="alert" className="form-error">{error}</p>}
      {status&&<p role="status" className="export-status">{status}</p>}
      <div className="form-actions"><button ref={button} type="button" className="button button-primary" disabled={preparing||loading||!!classError||!selected.length} onClick={()=>void prepare()}>{preparing?'准备中…':error?'重试导出':'准备并下载'}</button>{preparing&&<button type="button" className="button button-secondary" onClick={cancel}>取消准备</button>}</div>
    </div>
  </section>
}
