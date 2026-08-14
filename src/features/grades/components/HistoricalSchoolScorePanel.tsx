import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import { listSchoolExamHistoricalCandidates, saveSchoolExamScores } from '../api/gradesService'
import { validateScoreValue } from '../gradeEntry'

interface HistoricalSchoolScorePanelProps {
  examId: string
  maxScore: number
  existingScores: Record<string, number>
}

export function HistoricalSchoolScorePanel({ examId, maxScore, existingScores }: HistoricalSchoolScorePanelProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [score, setScore] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const candidates = useQuery({
    queryKey: ['school-exam', examId, 'historical-candidates', search.trim()],
    queryFn: () => listSchoolExamHistoricalCandidates(examId, search),
    enabled: search.trim().length > 0,
  })
  const selectedStudent = candidates.data?.find((student) => student.student_id === selectedStudentId)

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStudent) return
    const validationError = validateScoreValue(score, maxScore)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      await saveSchoolExamScores(examId, [{
        student_id: selectedStudent.student_id,
        score: score.trim() === '' ? null : Number(score),
      }])
      await queryClient.invalidateQueries({ queryKey: ['school-exam', examId, 'scores'] })
      setSuccess(score.trim() === '' ? '这位学生的成绩记录已清除。' : '历史成绩已保存。')
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '历史成绩保存失败，请重试。'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <details className="action-panel historical-score-panel">
      <summary>补录插班前成绩</summary>
      <p className="muted compact-copy">搜索考试当天尚未加入、但曾经报读这个科目的学生。</p>
      <label className="search-field historical-score-search">
        <span className="sr-only">搜索学生姓名</span>
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setSelectedStudentId('')
            setScore('')
            setError('')
            setSuccess('')
          }}
          placeholder="输入学生姓名"
        />
      </label>
      {candidates.isLoading && <LoadingBlock message="正在搜索学生…" />}
      {candidates.isError && <ErrorBlock message="历史学生搜索失败。" />}
      {search.trim() && !candidates.isLoading && candidates.data?.length === 0 && <EmptyBlock message="找不到符合条件的历史学生。" />}
      {!selectedStudent && (
        <div className="historical-candidate-list">
          {candidates.data?.map((student) => (
            <button
              type="button"
              key={student.student_id}
              onClick={() => {
                setSelectedStudentId(student.student_id)
                setScore(existingScores[student.student_id]?.toString() ?? '')
                setError('')
                setSuccess('')
              }}
            >
              <strong>{student.student_name}</strong>
              <span>{[student.school_class, student.phone].filter(Boolean).join(' · ') || '没有学校班级与电话'}</span>
            </button>
          ))}
        </div>
      )}
      {selectedStudent && (
        <form className="historical-score-form" onSubmit={handleSave}>
          <div>
            <strong>{selectedStudent.student_name}</strong>
            <span>{[selectedStudent.school_class, selectedStudent.phone].filter(Boolean).join(' · ') || '没有学校班级与电话'}</span>
          </div>
          <label className="field">
            <span>成绩</span>
            <div className="score-input-wrap">
              <input type="number" inputMode="decimal" min="0" max={maxScore} step="any" value={score} onChange={(event) => setScore(event.target.value)} />
              <span>/ {maxScore}</span>
            </div>
          </label>
          <div className="inline-actions">
            <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? '保存中…' : '保存成绩'}</button>
            <button className="button button-text" type="button" onClick={() => { setSelectedStudentId(''); setScore('') }}>返回搜索结果</button>
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
    </details>
  )
}
