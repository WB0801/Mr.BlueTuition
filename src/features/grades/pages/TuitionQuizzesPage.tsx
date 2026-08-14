import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { formatDate } from '../../../utils/format'
import { listClasses } from '../../classes/api/classesService'
import { listTuitionQuizzes } from '../api/gradesService'

export function TuitionQuizzesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => listClasses() })
  const selectedClassId = searchParams.get('classId')
    ?? classes.data?.find((item) => item.status === 'active')?.id
    ?? classes.data?.[0]?.id
    ?? ''
  const quizzes = useQuery({
    queryKey: ['tuition-quizzes', selectedClassId],
    queryFn: () => listTuitionQuizzes(selectedClassId),
    enabled: Boolean(selectedClassId),
  })
  const selectedClass = classes.data?.find((item) => item.id === selectedClassId)

  return (
    <section>
      <PageHeader
        title="补习班小测"
        backTo="/grades"
        backLabel="成绩"
        actions={selectedClassId ? <Link className="button button-primary" to={`/grades/quizzes/new?classId=${selectedClassId}`}>＋ 新增小测</Link> : undefined}
      />
      {classes.isLoading && <LoadingBlock />}
      {classes.isError && <ErrorBlock message="班级载入失败。" />}
      {classes.data?.length === 0 && <EmptyBlock message="目前没有常态班。" />}
      {classes.data && classes.data.length > 0 && (
        <label className="field grade-class-filter">
          <span>班级</span>
          <select value={selectedClassId} onChange={(event) => setSearchParams({ classId: event.target.value })}>
            {classes.data.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}

      {selectedClass && <h2 className="grade-list-heading">{selectedClass.name} · 小测</h2>}
      {quizzes.isLoading && <LoadingBlock />}
      {quizzes.isError && <ErrorBlock message="小测载入失败。" />}
      {!quizzes.isLoading && quizzes.data?.length === 0 && <EmptyBlock message="这个班级还没有小测。" />}
      <div className="record-list">
        {quizzes.data?.map((quiz) => (
          <Link className="record-card" to={`/grades/quizzes/${quiz.id}`} key={quiz.id}>
            <span className="record-main">
              <strong>{quiz.name}</strong>
              <span className="record-meta">{formatDate(quiz.quiz_date)} · 满分 {quiz.max_score}</span>
            </span>
            <span className="chevron" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
