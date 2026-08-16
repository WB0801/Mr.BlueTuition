import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { SearchInput } from '../../../components/ui'
import { listStudents } from '../api/studentsService'
import { StudentIdentity } from './StudentIdentity'

export function GlobalStudentSearch() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const result = useQuery({
    queryKey: ['students', 'search', deferredSearch],
    queryFn: () => listStudents(deferredSearch),
    enabled: deferredSearch.length > 0,
  })

  return (
    <div className="global-search">
      <SearchInput
        aria-label="搜索学生"
        containerClassName="student-search"
        placeholder="搜索学生姓名……"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {deferredSearch && (
        <div className="search-results" aria-live="polite">
          {result.isLoading && <p className="search-note">搜索中…</p>}
          {result.isError && <p className="search-note state-error">搜索失败，请重试。</p>}
          {result.data?.length === 0 && <p className="search-note">找不到学生。</p>}
          {result.data?.map((student) => (
            <Link className="search-result" to={`/students/${student.id}`} key={student.id}>
              <StudentIdentity student={student} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
