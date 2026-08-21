import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate } from '../../../utils/format'
import { listClasses } from '../../classes/api/classesService'
import {
  deleteSchoolExam,
  getSchoolExam,
  listSchoolExamHistoricalCandidates,
  listSchoolExamRoster,
  listSchoolExamScores,
} from '../api/gradesService'
import { calculateGradeStats } from '../gradeEntry'
import { HistoricalSchoolScorePanel } from '../components/HistoricalSchoolScorePanel'
import { GradeFlowSteps } from '../components/GradeFlowSteps'

export function SchoolExamDetailPage() {
  const { examId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [deleteError, setDeleteError] = useState('')
  const isNewFlow = Boolean((location.state as { gradeFlow?: boolean } | null)?.gradeFlow)
  const exam = useQuery({ queryKey: ['school-exam', examId], queryFn: () => getSchoolExam(examId) })
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => listClasses() })
  const roster = useQuery({ queryKey: ['school-exam', examId, 'roster'], queryFn: () => listSchoolExamRoster(examId) })
  const historicalCandidates = useQuery({
    queryKey: ['school-exam', examId, 'historical-candidate-count'],
    queryFn: () => listSchoolExamHistoricalCandidates(examId, ''),
  })
  const scores = useQuery({ queryKey: ['school-exam', examId, 'scores'], queryFn: () => listSchoolExamScores(examId) })
  const remove = useMutation({
    mutationFn: () => deleteSchoolExam(examId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['school-exams'] })
      navigate('/grades/school', { replace: true })
    },
  })

  if (exam.isLoading || classes.isLoading || roster.isLoading || historicalCandidates.isLoading || scores.isLoading) return <LoadingBlock />
  if (exam.isError || !exam.data || classes.isError || roster.isError || historicalCandidates.isError || scores.isError) return <ErrorBlock message="考试资料载入失败。" />

  const subjectClasses = classes.data?.filter((item) => item.subject_id === exam.data.subject_id) ?? []
  const scoreMap = new Map(scores.data?.map((score) => [score.student_id, score.score]))
  const stats = calculateGradeStats(
    (scores.data ?? []).map((score) => String(score.score)),
    (roster.data?.length ?? 0) + (historicalCandidates.data?.length ?? 0),
  )

  async function handleDelete() {
    const count = scores.data?.length ?? 0
    if (!window.confirm(`删除此考试将同时删除 ${count} 笔学生成绩。确定删除吗？`)) return
    setDeleteError('')
    try { await remove.mutateAsync() } catch (caughtError) { setDeleteError(getErrorMessage(caughtError, '删除考试失败，请重试。')) }
  }

  return (
    <section>
      <PageHeader title={exam.data.name} backTo="/grades/school" backLabel="学校考试" />
      {isNewFlow && <GradeFlowSteps current={2} />}
      <p className="grade-context">{formatDate(exam.data.exam_date)} · {exam.data.subject?.name} · 满分 {exam.data.max_score}</p>
      <div className="grade-stats" aria-label="整场考试统计">
        <span>已录 <strong>{stats.recorded} / {stats.total}</strong></span>
        <span>平均 <strong>{formatStat(stats.average)}</strong></span>
        <span>最高 <strong>{formatStat(stats.highest)}</strong></span>
        <span>最低 <strong>{formatStat(stats.lowest)}</strong></span>
      </div>

      <section className="content-section">
        <h2>按班录入</h2>
        {subjectClasses.length === 0 && <EmptyBlock message="这个科目目前没有常态班。" />}
        <div className="record-list">
          {subjectClasses.map((tuitionClass) => {
            const classRoster = roster.data?.filter((row) => row.class_id === tuitionClass.id) ?? []
            const recorded = classRoster.filter((row) => scoreMap.has(row.student_id)).length
            return (
              <ContextLink backLabel="考试" state={isNewFlow ? { gradeFlow: true } : undefined} className="record-card" to={`/grades/school/${examId}/classes/${tuitionClass.id}`} key={tuitionClass.id}>
                <span className="record-main">
                  <strong>{tuitionClass.name}</strong>
                  <span className="record-meta">已录 {recorded} / {classRoster.length}</span>
                </span>
                <span className="chevron" aria-hidden="true">›</span>
              </ContextLink>
            )
          })}
        </div>
      </section>

      <HistoricalSchoolScorePanel
        examId={examId}
        maxScore={exam.data.max_score}
        existingScores={Object.fromEntries((scores.data ?? []).map((score) => [score.student_id, score.score]))}
      />

      <details className="danger-panel">
        <summary>删除此考试</summary>
        <p className="impact-notice">删除此考试将同时删除 <strong>{scores.data?.length ?? 0}</strong> 笔学生成绩。</p>
        <button className="button button-danger" type="button" disabled={remove.isPending} onClick={handleDelete}>
          {remove.isPending ? '删除中…' : '永久删除考试'}
        </button>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
      </details>
    </section>
  )
}

function formatStat(value: number | null) {
  if (value === null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
