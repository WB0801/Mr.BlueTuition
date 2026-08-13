import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listStudents } from '../api/studentsService'
import { StudentIdentity } from '../components/StudentIdentity'

export function StudentListPage() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const students = useQuery({
    queryKey: ['students', 'list', deferredSearch],
    queryFn: () => listStudents(deferredSearch),
  })

  return (
    <section>
      <PageHeader
        title="学生"
        backLabel="首页"
        actions={<Link className="button button-primary" to="/students/new">新增学生</Link>}
      />

      <label className="search-field">
        <span className="sr-only">搜索学生姓名</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="输入姓名搜索"
        />
      </label>

      {students.isLoading && <LoadingBlock />}
      {students.isError && <ErrorBlock />}
      {students.data?.length === 0 && (
        <EmptyBlock message={deferredSearch ? '找不到符合的学生。' : '还没有学生资料。'} />
      )}
      <div className="record-list">
        {students.data?.map((student) => (
          <Link className="record-card" to={`/students/${student.id}`} key={student.id}>
            <StudentIdentity student={student} />
            <span className="chevron" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
