import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import type { GradeEntryRow } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import type { ScorePayload } from '../api/gradesService'
import { calculateGradeStats, parseScoreColumnPaste, scoreValuesEqual, validateScoreValue } from '../gradeEntry'

interface GradeEntryTableProps {
  rows: GradeEntryRow[]
  initialScores: Record<string, number>
  maxScore: number
  onSave: (scores: ScorePayload[]) => Promise<unknown>
  onSaved?: () => void
  studentBackLabel?: string
}

interface PastePlan {
  startIndex: number
  values: string[]
}

const leaveMessage = '成绩还有尚未保存的修改，确定离开吗？'

export function GradeEntryTable({
  rows,
  initialScores,
  maxScore,
  onSave,
  onSaved,
  studentBackLabel = '成绩',
}: GradeEntryTableProps) {
  const initialValues = useMemo(() => Object.fromEntries(
    rows.map((row) => [row.student_id, initialScores[row.student_id]?.toString() ?? '']),
  ), [initialScores, rows])
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initialValues)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pastePlan, setPastePlan] = useState<PastePlan | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const isDirty = !scoreValuesEqual(values, savedValues)
  const blocker = useBlocker(useCallback(() => isDirty, [isDirty]))
  const stats = calculateGradeStats(rows.map((row) => values[row.student_id] ?? ''), rows.length)

  useBeforeUnload(useCallback((event) => {
    if (!isDirty) return
    event.preventDefault()
    event.returnValue = leaveMessage
  }, [isDirty]))

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(leaveMessage)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  function focusRow(index: number) {
    const safeIndex = Math.max(0, Math.min(index, rows.length - 1))
    setActiveIndex(safeIndex)
    inputRefs.current[safeIndex]?.focus()
    inputRefs.current[safeIndex]?.select()
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, startIndex: number) {
    const text = event.clipboardData.getData('text')
    if (!text.includes('\n') && !text.includes('\r') && !text.includes('\t')) return
    event.preventDefault()
    const parsed = parseScoreColumnPaste(text, startIndex, rows.length, maxScore)
    if (!parsed.values) {
      setPastePlan(null)
      setError(parsed.error ?? '无法粘贴成绩。')
      return
    }
    setPastePlan({ startIndex, values: parsed.values })
    setError('')
    setSuccess('')
  }

  function applyPaste() {
    if (!pastePlan) return
    setValues((current) => {
      const next = { ...current }
      pastePlan.values.forEach((value, offset) => {
        next[rows[pastePlan.startIndex + offset].student_id] = value
      })
      return next
    })
    const lastIndex = pastePlan.startIndex + pastePlan.values.length - 1
    setActiveIndex(lastIndex)
    setSuccess(`已贴入 ${pastePlan.values.length} 笔，保存前仍可检查或修改。`)
    setPastePlan(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    focusRow(index + 1)
  }

  function focusNextBlank() {
    const nextIndex = rows.findIndex((row, index) => index > activeIndex && (values[row.student_id] ?? '').trim() === '')
    const firstBlank = rows.findIndex((row) => (values[row.student_id] ?? '').trim() === '')
    focusRow(nextIndex >= 0 ? nextIndex : firstBlank >= 0 ? firstBlank : activeIndex)
  }

  async function handleSave() {
    for (const row of rows) {
      const validationError = validateScoreValue(values[row.student_id] ?? '', maxScore)
      if (validationError) {
        setError(`${row.student_name}：${validationError}`)
        return
      }
    }

    const savingValues = { ...values }
    const payload = rows.map((row) => {
      const value = (savingValues[row.student_id] ?? '').trim()
      return {
        student_id: row.student_id,
        enrollment_id: row.enrollment_id,
        score: value === '' ? null : Number(value),
      }
    })

    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      await onSave(payload)
      setSavedValues(savingValues)
      setSuccess('成绩已保存。')
      onSaved?.()
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '成绩保存失败，请重试。'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="grade-entry-section">
      <div className="grade-stats" aria-label="成绩统计">
        <span>已录 <strong>{stats.recorded} / {stats.total}</strong></span>
        <span>平均 <strong>{formatStat(stats.average)}</strong></span>
        <span>最高 <strong>{formatStat(stats.highest)}</strong></span>
        <span>最低 <strong>{formatStat(stats.lowest)}</strong></span>
      </div>

      <div className="grade-entry-tools">
        <span>可从 Excel／Google Sheets 复制单列，贴到第一位学生的分数栏。</span>
        <button className="button button-text button-small" type="button" onClick={focusNextBlank}>前往下一位未录入</button>
      </div>

      {pastePlan && (
        <div className="paste-validation" role="status" aria-label="批量粘贴检查">
          <div>
            <strong>准备贴入 {pastePlan.values.length} 笔</strong>
            <span>从第 {pastePlan.startIndex + 1} 位开始，名单剩余 {rows.length - pastePlan.startIndex} 人。</span>
            {pastePlan.values.length !== rows.length - pastePlan.startIndex && <em>人数不符；确认后只更新这 {pastePlan.values.length} 位，其余保持不变。</em>}
          </div>
          <div className="inline-actions">
            <button className="button button-primary button-small" type="button" onClick={applyPaste}>确认贴入</button>
            <button className="button button-text button-small" type="button" onClick={() => setPastePlan(null)}>取消</button>
          </div>
        </div>
      )}

      <div className="grade-mobile-nav" aria-label="手机成绩导航">
        <span>{activeIndex + 1} / {rows.length}</span>
        <div>
          <button type="button" onClick={() => focusRow(activeIndex - 1)} disabled={activeIndex === 0}>上一位</button>
          <button type="button" onClick={() => focusRow(activeIndex + 1)} disabled={activeIndex === rows.length - 1}>下一位</button>
        </div>
      </div>

      <div className="grade-table-wrap">
        <table className="grade-entry-table">
          <thead><tr><th>学生</th><th>分数</th><th>状态</th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const value = values[row.student_id] ?? ''
              const validationError = validateScoreValue(value, maxScore)
              return (
                <tr className={activeIndex === index ? 'is-active' : ''} key={row.student_id}>
                  <td data-label="学生">
                    <ContextLink backLabel={studentBackLabel} className="grade-student-link" tabIndex={-1} to={`/students/${row.student_id}`}>{row.student_name}</ContextLink>
                    <small>{[row.school_class, row.phone].filter(Boolean).join(' · ') || '未填写学校班级与电话'}</small>
                  </td>
                  <td data-label="分数">
                    <label className="score-input-wrap">
                      <span className="sr-only">{row.student_name}成绩</span>
                      <input
                        ref={(element) => { inputRefs.current[index] = element }}
                        aria-invalid={Boolean(validationError)}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={maxScore}
                        step="any"
                        value={value}
                        onFocus={() => setActiveIndex(index)}
                        onChange={(event) => {
                          setValues((current) => ({ ...current, [row.student_id]: event.target.value }))
                          setError('')
                          setSuccess('')
                        }}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        onPaste={(event) => handlePaste(event, index)}
                      />
                      <span>/ {maxScore}</span>
                    </label>
                  </td>
                  <td data-label="状态" className={validationError ? 'score-row-error' : value.trim() === '' ? 'score-row-empty' : 'score-row-recorded'}>
                    {validationError ?? (value.trim() === '' ? '未录入' : '已输入')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <div className={`grade-save-bar ${isDirty ? 'is-dirty' : ''}`}>
        <span>{isDirty ? '尚未保存' : '成绩已同步'}</span>
        <button className="button button-primary" type="button" disabled={!isDirty || isSaving} onClick={handleSave}>
          {isSaving ? '保存中…' : '保存成绩'}
        </button>
      </div>
    </section>
  )
}

function formatStat(value: number | null) {
  if (value === null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
