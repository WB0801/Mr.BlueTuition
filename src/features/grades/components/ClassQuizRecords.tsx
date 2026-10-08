import { useQuery } from '@tanstack/react-query'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { RecordDetailFrame } from '../../../components/contextual/RecordDetailFrame'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { SearchInput } from '../../../components/ui'
import { formatDate } from '../../../utils/format'
import { listTuitionQuizOverviews, listTuitionQuizRoster, listTuitionQuizScores } from '../api/gradesService'
import { ScoreProgress } from './ScoreProgress'
import { StudentIdentity } from '../../students/components/StudentIdentity'
import type { TuitionQuiz } from '../../../types/domain'
import { formatQuizScore } from '../quizScoreDisplay'

export function ClassQuizRecords({ classId, active }: { classId: string; active: boolean }) {
  const { get, set } = useRecordParams('grades')
  const quizzes = useQuery({ queryKey: ['tuition-quizzes', 'overview', classId], queryFn: () => listTuitionQuizOverviews(classId), enabled: active, staleTime: Infinity })
  const search = get('q')
  const visible = (quizzes.data ?? []).filter(quiz => quiz.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const record = get('record')
  const selected = quizzes.data?.find(quiz => quiz.id === record && quiz.class_id === classId)
  return <section>
    <div hidden={Boolean(record)}><div className="section-heading-row"><h2>小测与成绩</h2><ContextLink backLabel="班级" className="button button-secondary" to={`/grades/quizzes/new?classId=${classId}`}>新增小测</ContextLink></div>
      <SearchInput aria-label="搜索补习班小测" placeholder="搜索小测" value={search} onChange={event => set('q', event.target.value)} />
      {quizzes.isSuccess && visible.length === 0 && <EmptyBlock message={search ? '找不到符合的小测。' : '这个班级还没有小测。'} />}
      <div className="record-list">{visible.map(quiz => <button className="compact-data-row context-record-row" type="button" key={quiz.id} data-context-record={quiz.id} onClick={() => set('record', quiz.id, true)}><span className="record-main"><strong>{quiz.name}</strong><span className="record-meta">{formatDate(quiz.quiz_date)}</span></span><ScoreProgress progress={quiz} compact /><span aria-hidden="true">›</span></button>)}</div>
    </div>
    {quizzes.isLoading && <LoadingBlock />}{quizzes.isError && <><ErrorBlock message="小测载入失败。" /><button type="button" className="button button-secondary" onClick={() => void quizzes.refetch()}>重试</button></>}
    {record && <RecordDetailFrame title={selected?.name ?? '小测详情'} backLabel="小测列表" onBack={() => set('record', '', true)}>
      {quizzes.isSuccess && !selected && <ErrorBlock message="这个班级范围内找不到该小测。" />}
      {selected && <ClassQuizDetails quiz={selected} active={active} />}
    </RecordDetailFrame>}
  </section>
}

function ClassQuizDetails({ quiz, active }: { quiz: TuitionQuiz; active: boolean }) {
  const roster = useQuery({ queryKey: ['tuition-quiz', quiz.id, 'roster'], queryFn: () => listTuitionQuizRoster(quiz.id), enabled: active })
  const scores = useQuery({ queryKey: ['tuition-quiz', quiz.id, 'scores'], queryFn: () => listTuitionQuizScores(quiz.id), enabled: active })
  return <><p>{formatDate(quiz.quiz_date)} · 满分 {quiz.max_score}</p>
    {(roster.isLoading || scores.isLoading) && <LoadingBlock />}
    {(roster.isError || scores.isError) && <ErrorBlock message="小测成绩载入失败。" />}
    {roster.isSuccess && scores.isSuccess && roster.data.length === 0 && <EmptyBlock message="小测日期当天没有有效报读学生。" />}
    {roster.isSuccess && scores.isSuccess && <div className="record-list">{roster.data.map(entry => {
      const score = scores.data.find(score => score.student_id === entry.student_id)
      return <div className="compact-data-row" key={entry.student_id}><ContextLink backLabel="班级" className="identity-link" to={`/students/${entry.student_id}`}><StudentIdentity student={{ name: entry.student_name, school_class: entry.school_class, phone: entry.phone }} /></ContextLink><strong className="quiz-score-display">{score?.score != null ? formatQuizScore(score.score, quiz.max_score) : '未录入'}</strong></div>
    })}</div>}
    <ContextLink backLabel="班级" className="button button-secondary" to={`/grades/quizzes/${quiz.id}`}>录入成绩与奖励管理</ContextLink>
  </>
}
