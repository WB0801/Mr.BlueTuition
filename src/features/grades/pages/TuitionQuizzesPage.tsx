import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { SearchInput } from '../../../components/ui'
import { formatDate } from '../../../utils/format'
import { listClasses } from '../../classes/api/classesService'
import { listTuitionQuizOverviews } from '../api/gradesService'
import { GradesTabs } from '../components/GradesTabs'
import { ScoreProgress } from '../components/ScoreProgress'

export function TuitionQuizzesPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => listClasses() })
  const selectedClassId = searchParams.get('classId')
    ?? classes.data?.find((item) => item.status === 'active')?.id
    ?? classes.data?.[0]?.id
    ?? ''
  const search = searchParams.get('q') ?? ''
  const updateFilter = (key: 'classId' | 'q', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const quizzes = useQuery({
    queryKey: ['tuition-quizzes', 'overview', selectedClassId],
    queryFn: () => listTuitionQuizOverviews(selectedClassId),
    enabled: Boolean(selectedClassId),
  })
  const visibleQuizzes = (quizzes.data ?? []).filter((quiz) => quiz.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  return (
    <section className="management-page grades-workspace">
      <PageHeader
        title="成绩"
        backTo="/"
        backLabel="首页"
        actions={selectedClassId ? <ContextLink backLabel="补习班小测" className="button button-primary" to={`/grades/quizzes/new?classId=${selectedClassId}`}>新增补习班小测</ContextLink> : undefined}
      />
      <GradesTabs active="quizzes" />
      {(location.state as { successMessage?: string } | null)?.successMessage && (
        <p className="form-success list-success" role="status">{(location.state as { successMessage: string }).successMessage}</p>
      )}

      <div className="grade-filters compact-grade-filters grade-quiz-filters">
        <label className="field">
          <span>班级</span>
          <select value={selectedClassId} onChange={(event) => updateFilter('classId', event.target.value)}>
            {(classes.data ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <SearchInput
          aria-label="搜索补习班小测"
          containerClassName="grade-search-filter"
          placeholder="搜索小测"
          value={search}
          onChange={(event) => updateFilter('q', event.target.value)}
        />
      </div>

      {classes.isLoading && <LoadingBlock />}
      {classes.isError && <ErrorBlock message="班级载入失败。" />}
      {classes.data?.length === 0 && <EmptyBlock message="目前没有常态班。" />}
      {quizzes.isLoading && <LoadingBlock />}
      {quizzes.isError && <ErrorBlock message="小测载入失败。" />}
      {!quizzes.isLoading && selectedClassId && visibleQuizzes.length === 0 && <EmptyBlock message={search ? '找不到符合的小测。' : '这个班级还没有小测。'} />}
      {visibleQuizzes.length > 0 && (
        <div className="grade-list-table quiz-list-table" role="table" aria-label="补习班小测">
          <div className="grade-list-row grade-list-head" role="row">
            <span>小测</span><span>日期</span><span>班级</span><span>录入进度</span><span aria-hidden="true" />
          </div>
          {visibleQuizzes.map((quiz) => (
            <ContextLink backLabel="成绩" className="grade-list-row grade-list-link" to={`/grades/quizzes/${quiz.id}`} role="row" key={quiz.id}>
              <strong data-label="小测">{quiz.name}</strong>
              <span data-label="日期">{formatDate(quiz.quiz_date)}</span>
              <span data-label="班级">{quiz.class?.name ?? '—'}</span>
              <ScoreProgress progress={quiz} compact />
              <span className="chevron" aria-hidden="true">›</span>
            </ContextLink>
          ))}
        </div>
      )}
    </section>
  )
}
