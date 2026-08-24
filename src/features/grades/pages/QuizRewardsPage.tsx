import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Badge } from '../../../components/ui'
import type { QuizRewardHistoryEntry, QuizRewardProgressSummary } from '../../../types/domain'
import { formatDate, formatDateTime } from '../../../utils/format'
import { getErrorMessage } from '../../../utils/errors'
import { listClasses } from '../../classes/api/classesService'
import { listQuizRewardOverview, markQuizRewardAwarded, reverseQuizReward } from '../api/gradesService'
import { GradesTabs } from '../components/GradesTabs'
import { oldestThree } from '../quizRanking'

type RewardTab = 'pending' | 'progress' | 'history'

export function QuizRewardsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (['pending', 'progress', 'history'].includes(searchParams.get('rewardTab') ?? '')
    ? searchParams.get('rewardTab')
    : 'pending') as RewardTab
  const classId = searchParams.get('classId') ?? ''
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => listClasses() })
  const rewards = useQuery({
    queryKey: ['quiz-rewards', classId || 'all'],
    queryFn: () => listQuizRewardOverview(classId || undefined),
  })
  const setFilter = (key: 'classId' | 'rewardTab', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value && !(key === 'rewardTab' && value === 'pending')) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  return (
    <section className="management-page grades-workspace quiz-rewards-page">
      <PageHeader title="前三名奖励" backTo="/grades/quizzes" backLabel="补习班小测" />
      <GradesTabs active="rewards" />

      <div className="reward-toolbar">
        <label className="field compact-select-field">
          <span>班级</span>
          <select value={classId} onChange={(event) => setFilter('classId', event.target.value)}>
            <option value="">全部班级</option>
            {(classes.data ?? []).map((tuitionClass) => <option value={tuitionClass.id} key={tuitionClass.id}>{tuitionClass.name}</option>)}
          </select>
        </label>
        <div className="reward-tabs" role="tablist" aria-label="奖励状态">
          <button type="button" role="tab" aria-selected={activeTab === 'pending'} className={activeTab === 'pending' ? 'active' : ''} onClick={() => setFilter('rewardTab', 'pending')}>
            待奖励 {rewards.data?.pending_count ? <Badge tone="danger">{rewards.data.pending_count}</Badge> : null}
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'progress'} className={activeTab === 'progress' ? 'active' : ''} onClick={() => setFilter('rewardTab', 'progress')}>累计中</button>
          <button type="button" role="tab" aria-selected={activeTab === 'history'} className={activeTab === 'history' ? 'active' : ''} onClick={() => setFilter('rewardTab', 'history')}>奖励历史</button>
        </div>
      </div>

      {(classes.isLoading || rewards.isLoading) && <LoadingBlock />}
      {(classes.isError || rewards.isError) && <ErrorBlock message="奖励资料载入失败。" />}
      {rewards.data && activeTab === 'pending' && (
        rewards.data.pending.length > 0
          ? <div className="reward-list">{rewards.data.pending.map((item) => <PendingRewardRow item={item} key={`${item.student_id}:${item.class_id}`} />)}</div>
          : <EmptyBlock message="目前没有待发奖励。" />
      )}
      {rewards.data && activeTab === 'progress' && (
        rewards.data.progress.length > 0
          ? <div className="reward-list">{rewards.data.progress.map((item) => <ProgressRewardRow item={item} key={`${item.student_id}:${item.class_id}`} />)}</div>
          : <EmptyBlock message="目前没有 1/3 或 2/3 的累计记录。" />
      )}
      {rewards.data && activeTab === 'history' && (
        rewards.data.history.length > 0
          ? <div className="reward-list">{rewards.data.history.map((item) => <RewardHistoryRow item={item} key={item.claim_id} />)}</div>
          : <EmptyBlock message="还没有奖励发放历史。" />
      )}
    </section>
  )
}

function StudentClassIdentity({ item }: { item: Pick<QuizRewardProgressSummary, 'student_id' | 'student_name' | 'class_id' | 'class_name'> }) {
  return (
    <div className="reward-identity">
      <ContextLink backLabel="前三名奖励" className="identity-link" to={`/students/${item.student_id}`}>{item.student_name}</ContextLink>
      <ContextLink backLabel="前三名奖励" to={`/classes/${item.class_id}`}>{item.class_name}</ContextLink>
    </div>
  )
}

function RewardRecordList({ records }: { records: QuizRewardProgressSummary['records'] }) {
  return (
    <ul className="reward-source-list">
      {records.map((record) => (
        <li key={record.record_id}>
          {record.quiz_id
            ? <ContextLink backLabel="前三名奖励" to={`/grades/quizzes/${record.quiz_id}`}>{record.quiz_name}</ContextLink>
            : <span>{record.quiz_name}</span>}
          <span>{formatDate(record.quiz_date)} · 第 {record.rank} 名 · {record.score} 分</span>
        </li>
      ))}
    </ul>
  )
}

function PendingRewardRow({ item }: { item: QuizRewardProgressSummary }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [requestId, setRequestId] = useState('')
  const sources = oldestThree(item.records.map((record) => ({ ...record, confirmed_at: record.confirmed_at ?? '', record_id: record.record_id })))
  const award = useMutation({
    mutationFn: () => markQuizRewardAwarded(item.student_id, item.class_id, requestId),
    onSuccess: async () => {
      setConfirming(false)
      setRequestId('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quiz-rewards'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-quiz-reward-count'] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-rewards', 'student', item.student_id] }),
      ])
    },
  })
  const open = () => {
    setRequestId(crypto.randomUUID())
    setConfirming(true)
  }
  return (
    <article className="reward-row pending-reward-row">
      <StudentClassIdentity item={item} />
      <div className="reward-counts">
        <strong>{item.unredeemed_count} 笔尚未兑换</strong>
        <Badge tone="danger">可领取 {item.reward_count ?? Math.floor(item.unredeemed_count / 3)} 份</Badge>
      </div>
      <RewardRecordList records={sources} />
      {!confirming ? <button className="button button-primary" type="button" onClick={open}>标记已奖励</button> : (
        <div className="reward-confirm-panel">
          <strong>确认已向 {item.student_name} 发放一份奖励？</strong>
          <span>将消耗以上最早三笔记录；发放后剩余 {item.unredeemed_count - 3}/3{item.unredeemed_count - 3 >= 3 ? '，仍有待奖励份数' : ''}。</span>
          {award.isError && <p className="form-error" role="alert">{getErrorMessage(award.error, '标记奖励失败，资料没有改变。')}</p>}
          <div className="inline-actions">
            <button className="button button-primary" type="button" disabled={award.isPending} onClick={() => award.mutate()}>{award.isPending ? '处理中…' : '确认已发奖励'}</button>
            <button className="button button-text" type="button" disabled={award.isPending} onClick={() => setConfirming(false)}>取消</button>
          </div>
        </div>
      )}
    </article>
  )
}

function ProgressRewardRow({ item }: { item: QuizRewardProgressSummary }) {
  return (
    <article className="reward-row progress-reward-row">
      <StudentClassIdentity item={item} />
      <strong className="reward-progress-value">{item.unredeemed_count}/3</strong>
      <RewardRecordList records={item.records} />
    </article>
  )
}

function RewardHistoryRow({ item }: { item: QuizRewardHistoryEntry }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const reverse = useMutation({
    mutationFn: () => reverseQuizReward(item.claim_id),
    onSuccess: async () => {
      setConfirming(false)
      setConfirmed(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quiz-rewards'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-quiz-reward-count'] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-rewards', 'student', item.student_id] }),
      ])
    },
  })
  return (
    <article className="reward-row reward-history-row">
      <StudentClassIdentity item={item} />
      <div className="reward-history-meta">
        <span>{formatDateTime(item.rewarded_at)}</span>
        <Badge tone={item.status === 'awarded' ? 'success' : 'neutral'}>{item.status === 'awarded' ? '已发奖励' : '已撤销'}</Badge>
      </div>
      <RewardRecordList records={item.records} />
      {item.status === 'awarded' && !confirming && <button className="button button-text" type="button" onClick={() => setConfirming(true)}>撤销已发奖励</button>}
      {item.status === 'awarded' && confirming && (
        <div className="reward-confirm-panel danger-panel">
          <strong>撤销后会释放原本三笔记录。</strong>
          <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我确认要撤销这份已发奖励</label>
          {reverse.isError && <p className="form-error" role="alert">{getErrorMessage(reverse.error, '撤销奖励失败，资料没有改变。')}</p>}
          <div className="inline-actions">
            <button className="button button-danger" type="button" disabled={!confirmed || reverse.isPending} onClick={() => reverse.mutate()}>{reverse.isPending ? '撤销中…' : '确认撤销'}</button>
            <button className="button button-text" type="button" disabled={reverse.isPending} onClick={() => { setConfirming(false); setConfirmed(false) }}>取消</button>
          </div>
        </div>
      )}
    </article>
  )
}
