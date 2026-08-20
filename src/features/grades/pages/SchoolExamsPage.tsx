import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { formatDate, todayInMalaysia } from '../../../utils/format'
import { listSubjects } from '../../classes/api/subjectsService'
import { listSchoolExams } from '../api/gradesService'

export function SchoolExamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const year = Number(searchParams.get('year') ?? todayInMalaysia().slice(0, 4))
  const subjectId = searchParams.get('subjectId') ?? ''
  const updateFilter = (key: 'year' | 'subjectId', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: listSubjects })
  const exams = useQuery({
    queryKey: ['school-exams', year, subjectId],
    queryFn: () => listSchoolExams({ year, subjectId: subjectId || undefined }),
  })
  const groupedExams = (exams.data ?? []).reduce<Record<string, typeof exams.data>>((groups, exam) => {
    const key = `${exam.year} · ${exam.subject?.name ?? '未知科目'}`
    groups[key] = [...(groups[key] ?? []), exam]
    return groups
  }, {})

  return (
    <section>
      <PageHeader
        title="学校考试"
        backTo="/grades"
        backLabel="成绩"
        actions={<ContextLink backLabel="学校考试" className="button button-primary" to="/grades/school/new">＋ 新增学校考试</ContextLink>}
      />
      <div className="grade-filters">
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
      </div>
      {exams.isLoading && <LoadingBlock />}
      {exams.isError && <ErrorBlock message="学校考试载入失败。" />}
      {!exams.isLoading && exams.data?.length === 0 && <EmptyBlock message="这个筛选条件下还没有学校考试。" />}
      <div className="grade-exam-groups">
        {Object.entries(groupedExams).map(([group, groupExams]) => (
          <section key={group}>
            <h2>{group}</h2>
            <div className="record-list">
              {(groupExams ?? []).map((exam) => (
                <ContextLink backLabel="成绩" className="record-card" to={`/grades/school/${exam.id}`} key={exam.id}>
                  <span className="record-main">
                    <strong>{exam.name}</strong>
                    <span className="record-meta">{formatDate(exam.exam_date)} · 满分 {exam.max_score}</span>
                  </span>
                  <span className="record-action-label">录入 / 查看成绩</span>
                </ContextLink>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
