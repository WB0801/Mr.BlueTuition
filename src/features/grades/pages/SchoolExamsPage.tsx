import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { SearchInput } from '../../../components/ui'
import { formatDate, todayInMalaysia } from '../../../utils/format'
import { listSubjects } from '../../classes/api/subjectsService'
import { listSchoolExamOverviews } from '../api/gradesService'
import { GradesTabs } from '../components/GradesTabs'
import { ScoreProgress } from '../components/ScoreProgress'

export function SchoolExamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const year = Number(searchParams.get('year') ?? todayInMalaysia().slice(0, 4))
  const subjectId = searchParams.get('subjectId') ?? ''
  const search = searchParams.get('q') ?? ''
  const updateFilter = (key: 'year' | 'subjectId' | 'q', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: listSubjects })
  const exams = useQuery({
    queryKey: ['school-exams', 'overview', year, subjectId],
    queryFn: () => listSchoolExamOverviews({ year, subjectId: subjectId || undefined }),
  })
  const visibleExams = (exams.data ?? []).filter((exam) => exam.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  return (
    <section className="management-page grades-workspace">
      <PageHeader
        title="成绩"
        backTo="/"
        backLabel="首页"
        actions={<ContextLink backLabel="学校考试" className="button button-primary" to="/grades/school/new">新增学校考试</ContextLink>}
      />
      <GradesTabs active="school" />

      <div className="grade-filters compact-grade-filters">
        <label className="field">
          <span>年份</span>
          <input type="number" min="2000" max="2200" value={year} onChange={(event) => updateFilter('year', event.target.value)} />
        </label>
        <label className="field">
          <span>科目</span>
          <select value={subjectId} onChange={(event) => updateFilter('subjectId', event.target.value)}>
            <option value="">全部科目</option>
            {subjects.data?.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <SearchInput
          aria-label="搜索学校考试"
          containerClassName="grade-search-filter"
          placeholder="搜索考试"
          value={search}
          onChange={(event) => updateFilter('q', event.target.value)}
        />
      </div>

      {exams.isLoading && <LoadingBlock />}
      {exams.isError && <ErrorBlock message="学校考试载入失败。" />}
      {!exams.isLoading && visibleExams.length === 0 && <EmptyBlock message={search ? '找不到符合的学校考试。' : '这个筛选条件下还没有学校考试。'} />}
      {visibleExams.length > 0 && (
        <div className="grade-list-table" role="table" aria-label="学校考试">
          <div className="grade-list-row grade-list-head" role="row">
            <span>考试</span><span>日期</span><span>科目</span><span>录入进度</span><span aria-hidden="true" />
          </div>
          {visibleExams.map((exam) => (
            <ContextLink backLabel="成绩" className="grade-list-row grade-list-link" to={`/grades/school/${exam.id}`} role="row" key={exam.id}>
              <strong data-label="考试">{exam.name}</strong>
              <span data-label="日期">{formatDate(exam.exam_date)}</span>
              <span data-label="科目">{exam.subject?.name ?? '—'}</span>
              <ScoreProgress progress={exam} compact />
              <span className="chevron" aria-hidden="true">›</span>
            </ContextLink>
          ))}
        </div>
      )}
    </section>
  )
}
