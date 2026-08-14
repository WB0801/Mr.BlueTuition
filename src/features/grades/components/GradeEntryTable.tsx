import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import type { GradeEntryRow } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import {
  calculateGradeStats,
  parseScoreColumnPaste,
  scoreValuesEqual,
  validateScoreValue,
} from '../gradeEntry'
import type { ScorePayload } from '../api/gradesService'

interface GradeEntryTableProps {
  rows: GradeEntryRow[]
  initialScores: Record<string, number>
  maxScore: number
  onSave: (scores: ScorePayload[]) => Promise<unknown>
}

const leaveMessage = '成绩还有尚未保存的修改，确定离开吗？'

export function GradeEntryTable({ rows, initialScores, maxScore, onSave }: GradeEntryTableProps) {
  const initialValues = useMemo(() => Object.fromEntries(
    rows.map((row) => [row.student_id, initialScores[row.student_id]?.toString() ?? '']),
  ), [initialScores, rows])
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initialValues)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
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

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, startIndex: number) {
    const text = event.clipboardData.getData('text')
    if (!text.includes('\n') && !text.includes('\r') && !text.includes('\t')) return
    event.preventDefault()
    const parsed = parseScoreColumnPaste(text, startIndex, rows.length, maxScore)
    if (!parsed.values) {
      setError(parsed.error ?? '无法粘贴成绩。')
      return
    }

    setValues((current) => {
      const next = { ...current }
      parsed.values?.forEach((value, offset) => {
        next[rows[startIndex + offset].student_id] = value.trim()
      })
      return next
    })
    setError('')
    setSuccess('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    inputRefs.current[index + 1]?.focus()
    inputRefs.current[index + 1]?.select()
  }

  async function handleSave() {
    for (const row of rows) {
      const validationError = validateScoreValue(values[row.student_id] ?? '', maxScore)
      if (validationError) {
        setError(`${row.student_name}：${validationError}`)
        return
      }
    }

    const payload = rows.map((row) => {
      const value = (values[row.student_id] ?? '').trim()
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
      setSavedValues({ ...values })
      setSuccess('成绩已保存。')
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

      <div className="grade-table-wrap">
        <table className="grade-entry-table">
          <thead><tr><th>学生</th><th>成绩</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.student_id}>
                <td>
                  <strong>{row.student_name}</strong>
                  {(row.school_class || row.phone) && (
                    <small>{[row.school_class, row.phone].filter(Boolean).join(' · ')}</small>
                  )}
                </td>
                <td>
                  <label className="score-input-wrap">
                    <span className="sr-only">{row.student_name}成绩</span>
                    <input
                      ref={(element) => { inputRefs.current[index] = element }}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={maxScore}
                      step="any"
                      value={values[row.student_id] ?? ''}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <div className="grade-save-bar">
        <span>{isDirty ? '有尚未保存的修改' : '成绩已同步'}</span>
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
