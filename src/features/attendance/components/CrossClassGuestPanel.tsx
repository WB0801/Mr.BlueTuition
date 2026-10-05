import { useDeferredValue, useEffect, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CrossClassCandidate } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { formatDateTime } from '../../../utils/format'
import { SearchInput } from '../../../components/ui'
import { useContextDataBusy } from '../../../components/contextual/contextDataState'
import { usePwaUpdateGuard } from '../../settings/pwa/updateProtection'
import { addSessionGuests, listMakeupSourceSessions, searchCrossClassCandidates, type SessionGuestRequest, type SessionGuestResult } from '../api/attendanceService'

type Selection = { candidate: CrossClassCandidate; linkType: 'makeup' | 'extra'; sourceSessionId: string }
type GuestDraft = { search: string; selected: Record<string, Selection>; results: SessionGuestResult[]; error: string; sharedSource: string; applicationNotice: string }

export function CrossClassGuestPanel({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient()
  const draftKey = ['attendance', sessionId, 'guest-draft']
  const [draft] = useState(() => queryClient.getQueryData<GuestDraft>(draftKey))
  const [search, setSearch] = useState(draft?.search ?? '')
  const deferredSearch = useDeferredValue(search.trim())
  const [selected, setSelected] = useState<Record<string, Selection>>(draft?.selected ?? {})
  usePwaUpdateGuard(Object.keys(selected).length > 0, '请先完成补课处理或取消选择，再更新；失败项尚未处理。')
  const [results, setResults] = useState<SessionGuestResult[]>(draft?.results ?? [])
  const [busy, setBusy] = useState(false)
  useContextDataBusy(busy)
  const [error, setError] = useState(draft?.error ?? '')
  const [sharedSource, setSharedSource] = useState(draft?.sharedSource ?? '')
  const [applicationNotice, setApplicationNotice] = useState(draft?.applicationNotice ?? '')
  useEffect(() => {
    queryClient.setQueryData<GuestDraft>(['attendance', sessionId, 'guest-draft'], { search, selected, results, error, sharedSource, applicationNotice })
  }, [queryClient, sessionId, search, selected, results, error, sharedSource, applicationNotice])
  const candidates = useQuery({
    queryKey: ['attendance', sessionId, 'cross-class-candidates', deferredSearch],
    queryFn: () => searchCrossClassCandidates(sessionId, deferredSearch),
  })
  const selections = Object.values(selected)
  const sources = useQueries({ queries: selections.map((item) => ({
    queryKey: ['attendance', sessionId, 'makeup-sources', item.candidate.source_enrollment_id],
    queryFn: () => listMakeupSourceSessions(sessionId, item.candidate.source_enrollment_id),
    enabled: item.linkType === 'makeup',
  })) })
  const sharedChoices = new Map<string, { className: string; startAt: string; count: number }>()
  selections.forEach((item, index) => {
    if (item.linkType !== 'makeup') return
    sources[index]?.data?.forEach((source) => {
      const existing = sharedChoices.get(source.session_id)
      sharedChoices.set(source.session_id, { className: source.class_name, startAt: source.session_start_at, count: (existing?.count ?? 0) + 1 })
    })
  })
  const makeupCount = selections.filter((item) => item.linkType === 'makeup').length
  function applySharedSource() {
    const applicable = selections.filter((item, index) => item.linkType === 'makeup' && !sources[index]?.isError && sources[index]?.data?.some((source) => source.session_id === sharedSource))
    const ids = new Set(applicable.map((item) => item.candidate.source_enrollment_id))
    setSelected((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, ids.has(id) ? { ...item, sourceSessionId: sharedSource } : item])))
    const skipped = selections.filter((item) => item.linkType === 'makeup' && !ids.has(item.candidate.source_enrollment_id)).map((item) => item.candidate.student_name)
    setApplicationNotice(`已应用 ${applicable.length} 人${skipped.length ? `；未应用：${skipped.join('、')}（课程不符合条件或资格未能读取，原选择不变）` : '；可逐人修改'}`)
  }
  const ready = selections.length > 0 && selections.every((item) => item.linkType === 'extra' || item.sourceSessionId)

  function toggle(candidate: CrossClassCandidate) {
    setSelected((current) => {
      const next = { ...current }
      if (next[candidate.source_enrollment_id]) delete next[candidate.source_enrollment_id]
      else {
        Object.entries(next).forEach(([id, value]) => { if (value.candidate.student_id === candidate.student_id) delete next[id] })
        next[candidate.source_enrollment_id] = { candidate, linkType: 'makeup', sourceSessionId: '' }
      }
      return next
    })
  }

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    const requests: SessionGuestRequest[] = selections.map(({ candidate, linkType, sourceSessionId }) => ({
      enrollmentId: candidate.source_enrollment_id, studentId: candidate.student_id, studentName: candidate.student_name,
      linkType, sourceSessionId: linkType === 'makeup' ? sourceSessionId : null,
      ...(results.some((result) => result.enrollmentId === candidate.source_enrollment_id && result.uncertain) ? { verifyBeforeRetry: true } : {}),
    }))
    try {
      const outcome = await addSessionGuests(sessionId, requests)
      setResults(outcome)
      setSelected((current) => {
        const remaining = { ...current }
        outcome.filter((item) => item.success).forEach((item) => { delete remaining[item.enrollmentId] })
        return remaining
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', sessionId, 'roster'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', sessionId, 'cross-class-candidates'] }),
      ])
    } catch (caught) { setError(getErrorMessage(caught, '无法完成操作，请检查名单中的加入结果。')) }
    finally { setBusy(false) }
  }

  return <div className="compact-form cross-class-form">
    <SearchInput aria-label="搜索其他班学生" placeholder="部分姓名也可搜索" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} />
    {candidates.isLoading && <p role="status">读取符合条件的学生…</p>}
    {candidates.isError && <p className="form-error" role="alert">名单载入失败。<button type="button" onClick={() => void candidates.refetch()}>重试</button></p>}
    {candidates.data?.length === 0 && <p className="search-note">没有符合条件的学生。</p>}
    {candidates.data?.length === 30 && <p className="search-note">显示前 30 项，请搜索姓名缩小范围。</p>}
    <div className="guest-candidates">
      {candidates.data?.map((item) => <label className="guest-candidate" key={item.source_enrollment_id}>
        <input type="checkbox" checked={Boolean(selected[item.source_enrollment_id])} disabled={busy || results.some((result) => result.success && result.studentId === item.student_id)} onChange={() => toggle(item)} />
        <span className="student-identity"><strong>{item.student_name}</strong><span>{item.source_class_name} · {[item.school_class, item.phone].filter(Boolean).join(' · ') || '无其他资料'}</span></span>
      </label>)}
    </div>
    {selections.length > 0 && <section className="guest-selections" aria-label="所选学生与原缺席课程">
      <h3>已选 {selections.length} 人</h3>
      <p className="field-hint">原课仍记缺席；提交前逐人核验，加入后须签名。</p>
      {makeupCount > 1 && <div className="shared-makeup-source">
        <label className="field"><span>共同原缺席课程</span><select value={sharedSource} disabled={busy} onChange={(event) => setSharedSource(event.target.value)}>
          <option value="">选择共同课程</option>
          {[...sharedChoices].map(([id, choice]) => <option value={id} key={id}>{choice.className} · {formatDateTime(choice.startAt)}（{choice.count}/{makeupCount} 人符合）</option>)}
        </select></label>
        <button className="button button-secondary" type="button" disabled={busy || !sharedChoices.has(sharedSource)} onClick={applySharedSource}>应用给符合条件者</button>
        {applicationNotice && <p className="field-hint" role="status">{applicationNotice}</p>}
      </div>}
      {selections.map((item) => <GuestSelection key={item.candidate.source_enrollment_id} sessionId={sessionId} selection={item} busy={busy}
        onChange={(value) => setSelected((current) => ({ ...current, [item.candidate.source_enrollment_id]: value }))}
        onRemove={() => toggle(item.candidate)} />)}
      <button className="button button-primary" type="button" disabled={!ready || busy} onClick={() => void submit()}>{busy ? '正在逐人加入…' : `加入所选 ${selections.length} 人`}</button>
    </section>}
    {results.length > 0 && <div className="guest-results" role="status">
      <strong>已加入 {results.filter((item) => item.success).length} 人 · 未加入 {results.filter((item) => !item.success && !item.uncertain).length} 人{results.some((item) => item.uncertain) && ` · 待确认 ${results.filter((item) => item.uncertain).length} 人`}</strong>
      <ul>{results.map((item) => <li key={item.enrollmentId} className={item.success ? 'form-success' : 'form-error'}>{item.studentName}：{item.success ? '已加入，请在点名名单中签名' : item.error}</li>)}</ul>
      {results.some((item) => !item.success) && <p>未成功者留在选择区；核对后只重试这些学生。</p>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}

function GuestSelection({ sessionId, selection, busy, onChange, onRemove }: {
  sessionId: string; selection: Selection; busy: boolean; onChange: (value: Selection) => void; onRemove: () => void
}) {
  const { candidate, linkType, sourceSessionId } = selection
  const sources = useQuery({
    queryKey: ['attendance', sessionId, 'makeup-sources', candidate.source_enrollment_id],
    queryFn: () => listMakeupSourceSessions(sessionId, candidate.source_enrollment_id), enabled: linkType === 'makeup',
  })
  return <fieldset className="guest-selection" disabled={busy}>
    <legend>{candidate.student_name} · {candidate.source_class_name}</legend>
    <div className="inline-actions">
      <label><input type="radio" name={`type-${candidate.source_enrollment_id}`} checked={linkType === 'makeup'} onChange={() => onChange({ ...selection, linkType: 'makeup', sourceSessionId: '' })} /> 补原缺席课程</label>
      <label><input type="radio" name={`type-${candidate.source_enrollment_id}`} checked={linkType === 'extra'} onChange={() => onChange({ ...selection, linkType: 'extra', sourceSessionId: '' })} /> 额外参加</label>
      <button className="button button-text" type="button" onClick={onRemove}>移除</button>
    </div>
    {linkType === 'makeup' && <label className="field"><span>{candidate.student_name}的原缺席课程</span>
      <select value={sourceSessionId} disabled={sources.isLoading || sources.isError} onChange={(event) => onChange({ ...selection, sourceSessionId: event.target.value })}>
        <option value="">{sources.isLoading ? '读取中…' : '请选择原缺席课程'}</option>
        {sources.data?.map((source) => <option value={source.session_id} key={source.session_id}>{source.class_name} · {formatDateTime(source.session_start_at)}</option>)}
      </select>
    </label>}
    {linkType === 'makeup' && sources.isError && <p className="form-error" role="alert">原缺席课程载入失败。<button type="button" onClick={() => void sources.refetch()}>重试</button></p>}
    {linkType === 'makeup' && sources.data?.length === 0 && <p className="search-note">没有符合规则的缺席课程，可移除学生或选择额外参加。</p>}
  </fieldset>
}
