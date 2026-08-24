import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { Badge } from '../../../components/ui'
import type { TuitionQuiz, TuitionQuizRosterEntry, TuitionQuizScore } from '../../../types/domain'
import { getErrorMessage } from '../../../utils/errors'
import { confirmTuitionQuizTopThree, previewTuitionQuizTopThree } from '../api/gradesService'
import { calculateQuizTopThree } from '../quizRanking'

interface QuizTopThreeSectionProps {
  quiz: TuitionQuiz
  roster: TuitionQuizRosterEntry[]
  scores: TuitionQuizScore[]
}

export function QuizTopThreeSection({ quiz, roster, scores }: QuizTopThreeSectionProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [allowIncomplete, setAllowIncomplete] = useState(false)
  const [allowAwardedImpact, setAllowAwardedImpact] = useState(false)
  const [success, setSuccess] = useState('')
  const preview = useQuery({
    queryKey: ['tuition-quiz', quiz.id, 'top-three'],
    queryFn: () => previewTuitionQuizTopThree(quiz.id),
  })
  const scoreByStudent = useMemo(() => new Map(scores.map((score) => [score.student_id, score.score])), [scores])
  const localCandidates = useMemo(() => calculateQuizTopThree(roster.map((student) => ({
    class_id: quiz.class_id,
    student_id: student.student_id,
    student_name: student.student_name,
    enrollment_id: student.enrollment_id,
    score: scoreByStudent.get(student.student_id),
  })), quiz.max_score), [quiz.class_id, quiz.max_score, roster, scoreByStudent])
  const confirm = useMutation({
    mutationFn: () => confirmTuitionQuizTopThree(quiz.id, {
      allowIncomplete,
      allowAwardedHistoryImpact: allowAwardedImpact,
    }),
    onSuccess: async (result) => {
      setConfirming(false)
      setAllowIncomplete(false)
      setAllowAwardedImpact(false)
      setSuccess(result.confirmed ? '本次前三名已经记录。' : '')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tuition-quiz', quiz.id, 'top-three'] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-rewards'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-quiz-reward-count'] }),
      ])
    },
  })

  const data = preview.data
  const candidates = data?.candidates ?? localCandidates.map((item) => ({ ...item, unredeemed_after: 1 }))
  const hasMissing = (data?.missing_students.length ?? roster.length - scores.length) > 0
  const hasAwardedImpact = (data?.awarded_history_impact ?? 0) > 0
  const needsReconfirmation = data?.needs_reconfirmation ?? false
  const differences = data?.differences
  const differenceCount = (differences?.added.length ?? 0) + (differences?.removed.length ?? 0) + (differences?.changed.length ?? 0)

  return (
    <section className="content-section quiz-ranking-section" aria-labelledby="quiz-ranking-heading">
      <div className="section-heading-row">
        <div>
          <h2 id="quiz-ranking-heading">本次前三名</h2>
          <p className="section-meta">{quiz.class?.name ?? '本班'}</p>
        </div>
        <div className="inline-actions">
          {data?.confirmed
            ? <Badge tone={needsReconfirmation ? 'danger' : 'neutral'}>{needsReconfirmation ? '需要重新确认' : '已记录'}</Badge>
            : <Badge tone="neutral">尚未记录</Badge>}
          <ContextLink backLabel="小测" className="button button-text" to={`/grades/rewards?classId=${quiz.class_id}`}>前三名奖励</ContextLink>
        </div>
      </div>

      {preview.isLoading && <LoadingBlock message="正在计算已保存成绩的排名…" />}
      {preview.isError && <ErrorBlock message="前三名预览载入失败；目前不能确认排行榜。" />}
      {needsReconfirmation && <p className="form-warning" role="status">成绩已变更，排行榜需要重新确认。确认前不会静默改变累计记录。</p>}
      {hasMissing && (
        <div className="quiz-ranking-warning">
          <strong>仍有 {data?.missing_students.length ?? Math.max(0, roster.length - scores.length)} 位学生未输入成绩。</strong>
          <span>空白不会当作 0，也不会参与排名。</span>
          {data?.missing_students.length ? <span>{data.missing_students.map((student) => student.student_name).join('、')}</span> : null}
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="empty-inline">目前没有可参与排名的已保存成绩。</p>
      ) : (
        <div className="quiz-ranking-list" role="list" aria-label="本次前三名预览">
          {candidates.map((candidate) => (
            <div className="quiz-ranking-row" role="listitem" key={candidate.student_id}>
              <span className="quiz-rank-number">第 {candidate.rank} 名</span>
              <ContextLink backLabel="小测" className="identity-link" to={`/students/${candidate.student_id}`}>{candidate.student_name}</ContextLink>
              <strong>{candidate.score} 分</strong>
              {data?.confirmed && !needsReconfirmation
                ? <span>累计 {candidate.unredeemed_after % 3 || 3}/3{candidate.unredeemed_after >= 3 ? ' · 本次后待奖励' : ''}</span>
                : <span>确认后才计入累计</span>}
            </div>
          ))}
        </div>
      )}

      {needsReconfirmation && differenceCount > 0 && (
        <div className="ranking-difference" aria-label="排行榜变化">
          <strong>重新计算差异</strong>
          <div>
            {(differences?.added.length ?? 0) > 0 && <span>新增：{differences?.added.map((entry) => `${entry.student_name}（第${entry.rank}名，${entry.score}分）`).join('、')}</span>}
            {(differences?.removed.length ?? 0) > 0 && <span>移除：{differences?.removed.map((entry) => `${entry.student_name}（原第${entry.rank}名，${entry.score}分）`).join('、')}</span>}
            {(differences?.changed.length ?? 0) > 0 && <span>变化：{differences?.changed.map((entry) => `${entry.student_name}（第${entry.old_rank}名 ${entry.old_score}分 → 第${entry.new_rank}名 ${entry.new_score}分）`).join('、')}</span>}
          </div>
        </div>
      )}
      {hasAwardedImpact && needsReconfirmation && (
        <p className="danger-message">这次修改涉及 {data?.awarded_history_impact} 份已发放奖励。奖励历史与当时三笔快照会保留；重新确认只更新当前排行榜记录。</p>
      )}
      {success && <p className="form-success" role="status">{success}</p>}
      {confirm.isError && <p className="form-error" role="alert">{getErrorMessage(confirm.error, '排行榜确认失败，资料没有写入。')}</p>}

      {!confirming ? (
        <button
          className="button button-primary"
          type="button"
          disabled={preview.isLoading || preview.isError || candidates.length === 0}
          onClick={() => { setConfirming(true); setSuccess('') }}
        >
          {needsReconfirmation ? '重新计算排行榜' : data?.confirmed ? '重新确认本次前三名' : '确认本次前三名'}
        </button>
      ) : (
        <div className="ranking-confirm-panel">
          <strong>{needsReconfirmation ? '确认更新当前排行榜？' : `确认新增 ${candidates.length} 笔前三名记录？`}</strong>
          {hasMissing && (
            <label className="checkbox-row">
              <input type="checkbox" checked={allowIncomplete} onChange={(event) => setAllowIncomplete(event.target.checked)} />
              我已检查空白成绩，仍然确认当前排名
            </label>
          )}
          {hasAwardedImpact && needsReconfirmation && (
            <label className="checkbox-row danger-message">
              <input type="checkbox" checked={allowAwardedImpact} onChange={(event) => setAllowAwardedImpact(event.target.checked)} />
              我了解已发奖励历史会保留，只更新当前排行榜
            </label>
          )}
          <div className="inline-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={confirm.isPending || (hasMissing && !allowIncomplete) || (hasAwardedImpact && needsReconfirmation && !allowAwardedImpact)}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending ? '确认中…' : '确认写入排行榜'}
            </button>
            <button className="button button-text" type="button" disabled={confirm.isPending} onClick={() => setConfirming(false)}>取消</button>
          </div>
        </div>
      )}
    </section>
  )
}
