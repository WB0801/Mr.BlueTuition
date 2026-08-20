import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { SearchInput } from '../../../components/ui'
import { listStudents } from '../api/studentsService'
import { StudentIdentity } from './StudentIdentity'

interface GlobalStudentSearchProps {
  placeholder?: string
}

export function GlobalStudentSearch({ placeholder = '搜索学生姓名……' }: GlobalStudentSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
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
        placeholder={placeholder}
        value={search}
        onChange={(event) => {
          const value = event.target.value
          setSearch(value)
          setSearchParams(value ? { q: value } : {}, { replace: true })
        }}
      />
      {deferredSearch && (
        <div className="search-results" aria-live="polite">
          {result.isLoading && <p className="search-note">搜索中…</p>}
          {result.isError && <p className="search-note state-error">搜索失败，请重试。</p>}
          {result.data?.length === 0 && <p className="search-note">找不到学生。</p>}
          {result.data?.map((student) => (
            <ContextLink backLabel="搜索" className="search-result" to={`/students/${student.id}`} key={student.id}>
              <StudentIdentity student={student} />
            </ContextLink>
          ))}
        </div>
      )}
    </div>
  )
}
