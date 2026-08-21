import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { formatDate } from '../../../utils/format'
import { GradeEntryTable } from '../components/GradeEntryTable'
import { GradeFlowSteps } from '../components/GradeFlowSteps'
import {
  deleteTuitionQuiz,
  getTuitionQuiz,
  listTuitionQuizRoster,
  listTuitionQuizScores,
  saveTuitionQuizScores,
} from '../api/gradesService'

export function TuitionQuizDetailPage() {
  const { quizId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [deleteError, setDeleteError] = useState('')
  const [flowStep, setFlowStep] = useState<2 | 3>(2)
  const isNewFlow = Boolean((location.state as { gradeFlow?: boolean } | null)?.gradeFlow)
  const quiz = useQuery({ queryKey: ['tuition-quiz', quizId], queryFn: () => getTuitionQuiz(quizId) })
  const roster = useQuery({ queryKey: ['tuition-quiz', quizId, 'roster'], queryFn: () => listTuitionQuizRoster(quizId) })
  const scores = useQuery({ queryKey: ['tuition-quiz', quizId, 'scores'], queryFn: () => listTuitionQuizScores(quizId) })
  const remove = useMutation({
    mutationFn: () => deleteTuitionQuiz(quizId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tuition-quizzes'] })
      navigate(`/grades/quizzes?classId=${quiz.data?.class_id ?? ''}`, { replace: true })
    },
  })

  if (quiz.isLoading || roster.isLoading || scores.isLoading) return <LoadingBlock />
  if (quiz.isError || !quiz.data || roster.isError || scores.isError) return <ErrorBlock message="小测资料载入失败。" />

  const initialScores = Object.fromEntries((scores.data ?? []).map((score) => [score.student_id, score.score]))

  async function handleDelete() {
    const count = scores.data?.length ?? 0
    if (!window.confirm(`删除此小测将同时删除 ${count} 笔学生成绩。确定删除吗？`)) return
    setDeleteError('')
    try { await remove.mutateAsync() } catch (caughtError) { setDeleteError(getErrorMessage(caughtError, '删除小测失败，请重试。')) }
  }

  return (
    <section>
      <PageHeader title={quiz.data.name} backTo={`/grades/quizzes?classId=${quiz.data.class_id}`} backLabel="补习班小测" />
      {isNewFlow && <GradeFlowSteps current={flowStep} kind="小测" />}
      <p className="grade-context">
        {quiz.data.class && <ContextLink backLabel="成绩" to={`/classes/${quiz.data.class.id}`}>{quiz.data.class.name}</ContextLink>}
        {' · '}{formatDate(quiz.data.quiz_date)} · 满分 {quiz.data.max_score}
      </p>
      {roster.data?.length === 0 ? <EmptyBlock message="小测日期当天没有有效报读学生。" /> : (
        <GradeEntryTable
          key={quizId}
          rows={roster.data ?? []}
          initialScores={initialScores}
          maxScore={quiz.data.max_score}
          studentBackLabel="小测"
          onSaved={() => setFlowStep(3)}
          onSave={async (payload) => {
            await saveTuitionQuizScores(quizId, payload)
            await queryClient.invalidateQueries({ queryKey: ['tuition-quiz', quizId, 'scores'] })
          }}
        />
      )}

      <details className="danger-panel">
        <summary>删除此小测</summary>
        <p className="impact-notice">删除此小测将同时删除 <strong>{scores.data?.length ?? 0}</strong> 笔学生成绩。</p>
        <button className="button button-danger" type="button" disabled={remove.isPending} onClick={handleDelete}>
          {remove.isPending ? '删除中…' : '永久删除小测'}
        </button>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
      </details>
    </section>
  )
}
