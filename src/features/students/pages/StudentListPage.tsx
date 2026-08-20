import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Icon, SearchInput } from '../../../components/ui'
import { listStudents } from '../api/studentsService'
import { StudentIdentity } from '../components/StudentIdentity'

export function StudentListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const deferredSearch = useDeferredValue(search.trim())
  const students = useQuery({
    queryKey: ['students', 'list', deferredSearch],
    queryFn: () => listStudents(deferredSearch),
  })

  return (
    <section className="management-page student-list-page">
      <PageHeader
        title="学生"
        actions={<Link className="button button-primary" to="/students/new">新增学生</Link>}
      />

      <SearchInput
        aria-label="搜索学生姓名"
        containerClassName="list-search"
        placeholder="搜索学生姓名……"
        value={search}
        onChange={(event) => {
          const value = event.target.value
          setSearch(value)
          setSearchParams(value ? { q: value } : {}, { replace: true })
        }}
      />

      {students.isLoading && <LoadingBlock />}
      {students.isError && <ErrorBlock />}
      {students.data?.length === 0 && (
        <EmptyBlock message={deferredSearch ? '找不到符合的学生。' : '还没有学生资料。'} />
      )}
      <div className="record-list">
        {students.data?.map((student) => (
          <Link className="record-card student-list-card" to={`/students/${student.id}`} key={student.id}>
            <StudentIdentity student={student} />
            <Icon className="record-chevron" name="chevron-right" size={20} />
          </Link>
        ))}
      </div>
    </section>
  )
}
