import { useDeferredValue, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CrossClassCandidate } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { formatDateTime } from '../../../utils/format'
import {
  addSessionGuest,
  listMakeupSourceSessions,
  searchCrossClassCandidates,
} from '../api/attendanceService'

interface CrossClassGuestPanelProps {
  sessionId: string
}

export function CrossClassGuestPanel({ sessionId }: CrossClassGuestPanelProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [candidate, setCandidate] = useState<CrossClassCandidate | null>(null)
  const [linkType, setLinkType] = useState<'makeup' | 'extra'>('makeup')
  const [sourceSessionId, setSourceSessionId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const candidates = useQuery({
    queryKey: ['attendance', sessionId, 'cross-class-candidates', deferredSearch],
    queryFn: () => searchCrossClassCandidates(sessionId, deferredSearch),
    enabled: deferredSearch.length > 0 && candidate === null,
  })
  const sourceSessions = useQuery({
    queryKey: ['attendance', sessionId, 'makeup-sources', candidate?.source_enrollment_id],
    queryFn: () => listMakeupSourceSessions(sessionId, candidate!.source_enrollment_id),
    enabled: Boolean(candidate) && linkType === 'makeup',
  })
  const addGuest = useMutation({
    mutationFn: () => addSessionGuest(
      sessionId,
      candidate!.source_enrollment_id,
      linkType,
      linkType === 'makeup' ? sourceSessionId : null,
    ),
    onSuccess: async () => {
      setError('')
      setSuccess('学生已加入这堂课程，请让学生在名单中签名。')
      setCandidate(null)
      setSearch('')
      setSourceSessionId('')
      await queryClient.invalidateQueries({ queryKey: ['attendance', sessionId, 'roster'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '加入补课学生失败，请重试。')),
  })

  function selectCandidate(item: CrossClassCandidate) {
    setCandidate(item)
    setSourceSessionId('')
    setError('')
    setSuccess('')
  }

  function changeType(nextType: 'makeup' | 'extra') {
    setLinkType(nextType)
    setSourceSessionId('')
    setError('')
  }

  return (
    <div className="compact-form cross-class-form">
      {!candidate ? (
        <>
          <label className="field">
            <span>搜索其他班学生</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setSuccess('')
              }}
              placeholder="输入学生姓名"
            />
          </label>
          {candidates.isLoading && <p className="search-note">搜索中…</p>}
          {candidates.isError && <p className="form-error">搜索失败，请重试。</p>}
          {deferredSearch && candidates.data?.length === 0 && <p className="search-note">找不到可加入的其他班学生。</p>}
          <div className="search-results embedded-results">
            {candidates.data?.map((item) => (
              <div className="search-result search-result-action" key={item.source_enrollment_id}>
                <span className="student-identity">
                  <strong>{item.student_name}</strong>
                  <span>{item.source_class_name} · {[item.school_class, item.phone].filter(Boolean).join(' · ') || '无其他资料'}</span>
                </span>
                <button className="button button-secondary button-small" type="button" onClick={() => selectCandidate(item)}>
                  选择
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="selected-student-card">
            <span><strong>{candidate.student_name}</strong><small>来自：{candidate.source_class_name}</small></span>
            <button className="button button-text button-small" type="button" onClick={() => setCandidate(null)}>重选</button>
          </div>
          <fieldset className="choice-group">
            <legend>参加方式</legend>
            <label><input type="radio" checked={linkType === 'makeup'} onChange={() => changeType('makeup')} /> 补原本缺席课程</label>
            <label><input type="radio" checked={linkType === 'extra'} onChange={() => changeType('extra')} /> 不关联某堂课（额外参加）</label>
          </fieldset>
          {linkType === 'makeup' && (
            <fieldset className="choice-group">
              <legend>补哪一堂？</legend>
              {sourceSessions.isLoading && <p className="search-note">读取缺席课程…</p>}
              {sourceSessions.isError && <p className="form-error">缺席课程载入失败。</p>}
              {sourceSessions.data?.length === 0 && <p className="search-note">目前没有可关联的缺席课程。</p>}
              {sourceSessions.data?.map((source) => (
                <label key={source.session_id}>
                  <input
                    type="radio"
                    name="source-session"
                    value={source.session_id}
                    checked={sourceSessionId === source.session_id}
                    onChange={() => setSourceSessionId(source.session_id)}
                  />
                  {formatDateTime(source.session_start_at)}
                </label>
              ))}
            </fieldset>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            className="button button-primary"
            type="button"
            disabled={addGuest.isPending || (linkType === 'makeup' && !sourceSessionId)}
            onClick={() => addGuest.mutate()}
          >
            {addGuest.isPending ? '加入中…' : '加入这堂课程'}
          </button>
        </>
      )}
      {success && <p className="form-success" role="status">{success}</p>}
    </div>
  )
}
