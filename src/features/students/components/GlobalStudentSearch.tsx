import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { SearchInput } from '../../../components/ui'
import { listStudents, listStudentsByIds } from '../api/studentsService'
import { useAuth } from '../../auth/authContext'
import { useRecentStudentIds } from '../recentStudentViews'
import { StudentIdentity } from './StudentIdentity'

interface GlobalStudentSearchProps {
  placeholder?: string
  destination?: 'student' | 'fees'
}

export function GlobalStudentSearch({ placeholder = '搜索学生姓名……', destination = 'student' }: GlobalStudentSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const deferredSearch = useDeferredValue(search.trim())
  const ownerId = useAuth().user?.id ?? ''
  const recentIds = useRecentStudentIds(ownerId)
  const recent = useQuery({
    queryKey: ['students', 'recent', ownerId, recentIds],
    queryFn: () => listStudentsByIds(recentIds),
    enabled: Boolean(ownerId && !deferredSearch && recentIds.length),
  })
  const showRecent = !deferredSearch && recentIds.length > 0
  const recentRows = recentIds.flatMap((id) => recent.data?.find((student) => student.id === id) ?? []).slice(0, 6)
  const useDefaults = !deferredSearch && (!showRecent || (recent.isSuccess && recentRows.length === 0))
  const result = useQuery({
    queryKey: ['students', 'search', ownerId, deferredSearch, deferredSearch ? 40 : 6],
    queryFn: () => listStudents(deferredSearch, deferredSearch ? 40 : 6),
    enabled: Boolean(ownerId && (deferredSearch || useDefaults)),
  })
  const activeResult = showRecent && !useDefaults ? recent : result
  const rows = showRecent && !useDefaults ? recentRows : result.data

  return (
    <div className="global-search">
      <SearchInput
        aria-label={destination === 'fees' ? '找学生收学费' : '搜索学生'}
        containerClassName="student-search"
        placeholder={placeholder}
        value={search}
        onChange={(event) => {
          const value = event.target.value
          setSearch(value)
          const next = new URLSearchParams(searchParams)
          if (value) next.set('q', value)
          else next.delete('q')
          setSearchParams(next, { replace: true })
        }}
      />
      {(
        <div className="search-results" aria-live="polite">
          <p className="search-note search-result-label">{deferredSearch ? '搜索结果' : useDefaults ? '默认学生' : '最近查看'}</p>
          {activeResult.isLoading && <p className="search-note">读取中…</p>}
          {activeResult.isError && <p className="search-note state-error">名单读取失败。<button type="button" onClick={() => void activeResult.refetch()}>重试</button></p>}
          {activeResult.isSuccess && rows?.length === 0 && <p className="search-note">找不到学生。</p>}
          {rows?.map((student) => (
            <div className="search-result home-student-result" key={student.id}>
              <ContextLink backLabel="首页" className="identity-link" to={`/students/${student.id}`}><StudentIdentity student={student} /></ContextLink>
              {destination === 'fees' && <ContextLink backLabel="首页" className="button button-text home-fee-link" to={`/fees?studentId=${student.id}&month=all&status=all`}>缴费记录</ContextLink>}
            </div>
          ))}
          {deferredSearch && rows?.length === 40 && <p className="search-note">显示前 40 项，请输入更多姓名缩小范围。</p>}
        </div>
      )}
    </div>
  )
}
