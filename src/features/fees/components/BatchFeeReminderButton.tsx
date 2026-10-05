import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { currentMonthInMalaysia, formatFeeMonth, formatMoney } from '../../../utils/format'
import { loadBatchReminderCandidates, type BatchReminderScope } from '../api/batchFeeReminderService'
import { normalizeMalaysiaPhone } from '../reminderRules'
import { FeeReminderModal } from './FeeReminderModal'
import { FeeReminderPreview, type ReminderPreviewState } from './FeeReminderPreview'
import { usePwaUpdateGuard } from '../../settings/pwa/updateProtection'

type Outcome = 'pending' | 'processed' | 'skipped' | 'updated'
interface Batch { month: string; ids: string[]; outcomes: Outcome[]; index: number; scopeLabel: string }
interface Props { initialMonth: string; scope: Omit<BatchReminderScope, 'feeMonth'>; scopeLabel: string; available?: boolean }

export function BatchFeeReminderButton({ initialMonth, scope, scopeLabel, available = true }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'choose' | 'resume' | 'run'>('choose')
  const [batch, setBatch] = useState<Batch | null>(null)
  const [selectionScope, setSelectionScope] = useState({ initialMonth, scope, scopeLabel })
  const [confirm, setConfirm] = useState<'end' | 'new' | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [open])
  const close = () => { setOpen(false); setConfirm(null) }
  function choose() { setSelectionScope({ initialMonth, scope, scopeLabel }); setView('choose') }
  function advance(outcome: Outcome) {
    setBatch(current => current && { ...current, index: current.index + 1, outcomes: current.outcomes.map((value, index) => index === current.index ? outcome : value) })
  }
  const complete = batch && batch.index >= batch.ids.length
  usePwaUpdateGuard(!!batch && !complete, '请先结束本批次再更新；更新会清除本批次进度。')
  const counts = (outcome: Outcome) => batch?.outcomes.filter(value => value === outcome).length ?? 0
  function actions(state: ReminderPreviewState) {
    return <div className="fee-reminder-actions">
      {state === 'ready' && <button className="button button-primary" type="button" onClick={() => advance('processed')}>已处理，下一位</button>}
      {state === 'updated' && <button className="button button-primary" type="button" onClick={() => advance('updated')}>下一位</button>}
      <button className="button button-secondary" type="button" onClick={() => advance('skipped')}>跳过</button>
    </div>
  }
  return <>
    {available && <button ref={trigger} type="button" className="button button-secondary fee-reminder-trigger" onClick={() => { if (batch) setView('resume'); else choose(); setOpen(true) }}>批量提醒</button>}
    {open && <FeeReminderModal title="批量提醒" onClose={close}>
      {batch && <div className="batch-reminder-progress" aria-live="polite">
        <strong>{complete ? `共 ${batch.ids.length} 位` : `第 ${batch.index + 1} 位 / 共 ${batch.ids.length} 位`} · {formatFeeMonth(batch.month)}</strong>
        <p>已处理 {counts('processed')} · 待处理 {counts('pending')} · 跳过 {counts('skipped')} · 无需追缴 {counts('updated')}</p>
        <p>{batch.scopeLabel}</p>
      </div>}
      {confirm ? <div className="fee-reminder-body">
        <p>{confirm === 'end' ? '结束后将清除本批次进度。' : '重新选择将清除本批次进度。'}</p>
        <div className="fee-reminder-actions"><button className="button button-secondary" type="button" autoFocus onClick={() => setConfirm(null)}>取消</button><button className="button button-primary" type="button" onClick={() => { setBatch(null); setConfirm(null); if (confirm === 'end') close(); else choose() }}>{confirm === 'end' ? '确认结束' : '确认重新选择'}</button></div>
      </div> : null}
      <div hidden={!!confirm}>
        {view === 'choose' && <CandidateSelection key={`${selectionScope.initialMonth}:${JSON.stringify(selectionScope.scope)}`} {...selectionScope} onStart={(month, ids) => { setBatch({ month, ids, outcomes: ids.map(() => 'pending'), index: 0, scopeLabel: selectionScope.scopeLabel }); setView('run') }} />}
        {batch && view === 'resume' && <div className="fee-reminder-actions">
          {!complete && <button className="button button-primary" type="button" onClick={() => setView('run')}>继续本批次</button>}
          <button className="button button-secondary" type="button" onClick={() => setConfirm('new')}>重新选择</button>
        </div>}
        {batch && view === 'run' && !complete && <FeeReminderPreview key={`${batch.month}:${batch.index}`} studentId={batch.ids[batch.index]} month={batch.month} renderActions={actions} />}
        {batch && complete && <p role="status">本批次已处理完毕</p>}
        {batch && <button className="button button-text batch-reminder-end" type="button" onClick={() => setConfirm('end')}>结束本批次</button>}
      </div>
    </FeeReminderModal>}
  </>
}

function CandidateSelection({ initialMonth, scope, scopeLabel, onStart }: Omit<Props, 'available'> & { onStart: (month: string, ids: string[]) => void }) {
  const id = useId()
  const [monthInput, setMonthInput] = useState(initialMonth.slice(0, 7))
  const [selected, setSelected] = useState<string[]>([])
  usePwaUpdateGuard(selected.length > 0, '请先开始或取消提醒名单选择，再更新。')
  const [preparing, setPreparing] = useState(false)
  usePwaUpdateGuard(preparing, '正在准备提醒清单，请稍后更新。')
  const [updated, setUpdated] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput) ? `${monthInput}-01` : ''
  const query = useQuery({ queryKey: ['batch-reminder-candidates', id, month, scope], queryFn: ({ signal }) => loadBatchReminderCandidates({ ...scope, feeMonth: month }, signal), enabled: !!month, retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const candidates = query.isSuccess && !query.isFetching ? query.data : []
  const selectedCandidates = candidates.filter(item => selected.includes(item.studentId))
  async function start() {
    const ids = selectedCandidates.map(item => item.studentId)
    setPreparing(true)
    setUpdated(false)
    try {
      const fresh = await query.refetch({ throwOnError: true })
      const eligible = new Set(fresh.data?.map(item => item.studentId))
      const validIds = ids.filter(value => eligible.has(value))
      if (alive.current) {
        if (validIds.length) onStart(month, validIds)
        else { setSelected([]); setUpdated(true) }
      }
    } catch { /* Query error is displayed; never start from an old snapshot. */ }
    finally { if (alive.current) setPreparing(false) }
  }
  return <div className="fee-reminder-body">
    <label className="field"><span>提醒月份</span><input type="month" value={monthInput} max={currentMonthInMalaysia().slice(0, 7)} disabled={preparing} onChange={event => { setMonthInput(event.target.value); setSelected([]); setUpdated(false) }} /></label>
    <p>{scopeLabel}</p>
    {updated && <p role="status">状态已更新：所选学生已不在本月提醒范围，请重新选择。</p>}
    {!month && <p role="status">请选择一个提醒月份。</p>}
    {month && query.isFetching && <p role="status">正在核对候选名单…</p>}
    {month && query.isError && <div role="alert"><p className="form-error">候选名单读取失败，请重试。</p><button className="button button-secondary" type="button" onClick={() => void query.refetch()}>重试</button></div>}
    {month && query.isSuccess && !query.isFetching && !candidates.length && <p role="status">此范围没有需要追缴的学生。</p>}
    {candidates.length > 0 && <>
      <label className="checkbox-row batch-reminder-select-all"><input type="checkbox" disabled={preparing} checked={selectedCandidates.length === candidates.length} onChange={event => setSelected(event.target.checked ? candidates.map(item => item.studentId) : [])} />全选符合条件的学生</label>
      <ul className="batch-reminder-candidates">{candidates.map(item => <li key={item.studentId}><label>
        <input type="checkbox" disabled={preparing} checked={selected.includes(item.studentId)} onChange={event => setSelected(current => event.target.checked ? [...current, item.studentId] : current.filter(value => value !== item.studentId))} />
        <span><strong>{item.name}</strong><span>{item.phone || '缺少号码'}{!normalizeMalaysiaPhone(item.phone) && ' · 需核对'}</span></span><strong>{formatMoney(item.amount)}</strong>
      </label></li>)}</ul>
    </>}
    <button className="button button-primary" type="button" disabled={!selectedCandidates.length || preparing || query.isFetching || query.isError} onClick={() => void start()}>{preparing ? '正在准备…' : '开始提醒'}</button>
  </div>
}
