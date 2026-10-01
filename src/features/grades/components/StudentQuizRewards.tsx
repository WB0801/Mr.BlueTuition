import { useQuery } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { Badge } from '../../../components/ui'
import { formatDate } from '../../../utils/format'
import { getStudentQuizRewardSummary } from '../api/gradesService'

export function StudentQuizRewards({ studentId, active = true }: { studentId: string; active?: boolean }) {
  const summary = useQuery({
    queryKey: ['quiz-rewards', 'student', studentId],
    queryFn: () => getStudentQuizRewardSummary(studentId),
    enabled: active,
  })
  if (summary.isLoading) return <LoadingBlock message="正在载入前三名累计…" />
  if (summary.isError) return <ErrorBlock message="前三名累计载入失败。" />

  const rows = [...(summary.data?.pending ?? []), ...(summary.data?.progress ?? [])]
  const historyByClass = new Map<string, number>()
  for (const claim of summary.data?.history ?? []) {
    if (claim.status === 'awarded') historyByClass.set(claim.class_id, (historyByClass.get(claim.class_id) ?? 0) + 1)
  }
  if (rows.length === 0 && historyByClass.size === 0) return null

  return (
    <section className="student-reward-summary" aria-labelledby="student-reward-heading">
      <div className="section-heading-row">
        <h3 id="student-reward-heading">前三名奖励累计</h3>
        <ContextLink backLabel="学生" to="/grades/rewards">查看奖励总览</ContextLink>
      </div>
      <div className="student-reward-list">
        {rows.map((row) => (
          <article className="student-reward-row" key={row.class_id}>
            <div>
              <ContextLink backLabel="学生" className="identity-link" to={`/classes/${row.class_id}`}>{row.class_name}</ContextLink>
              <span>累计 {row.unredeemed_count % 3 || 3}/3</span>
            </div>
            <div className="inline-badges">
              {(row.reward_count ?? 0) > 0 && <Badge tone="danger">待奖励 {row.reward_count}</Badge>}
              {(historyByClass.get(row.class_id) ?? 0) > 0 && <Badge tone="neutral">历史奖励 {historyByClass.get(row.class_id)}</Badge>}
            </div>
            <ul className="student-recent-ranking-list">
              {row.records.slice(-3).reverse().map((record) => (
                <li key={record.record_id}>{record.quiz_name} · {formatDate(record.quiz_date)} · 第 {record.rank} 名 · {record.score} 分</li>
              ))}
            </ul>
          </article>
        ))}
        {[...historyByClass.entries()].filter(([classId]) => !rows.some((row) => row.class_id === classId)).map(([classId, count]) => {
          const history = summary.data?.history.find((claim) => claim.class_id === classId)
          if (!history) return null
          return (
            <article className="student-reward-row" key={classId}>
              <ContextLink backLabel="学生" className="identity-link" to={`/classes/${classId}`}>{history.class_name}</ContextLink>
              <Badge tone="neutral">历史奖励 {count}</Badge>
            </article>
          )
        })}
      </div>
    </section>
  )
}
