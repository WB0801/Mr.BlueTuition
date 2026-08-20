import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Icon } from '../../../components/ui'
import type { ClassStatus } from '../../../types/domain'
import { formatDate } from '../../../utils/format'
import { listClasses } from '../api/classesService'
import { ClassScheduleSummary } from '../components/ClassScheduleSummary'

export function ClassesListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<ClassStatus>(searchParams.get('status') === 'ended' ? 'ended' : 'active')
  const selectStatus = (next: ClassStatus) => {
    setStatus(next)
    setSearchParams(next === 'ended' ? { status: 'ended' } : {}, { replace: true })
  }
  const classes = useQuery({
    queryKey: ['classes', status],
    queryFn: () => listClasses(status),
  })

  return (
    <section className="management-page classes-list-page">
      <PageHeader
        title="班级"
        actions={<Link className="button button-primary" to="/classes/new">新增班级</Link>}
      />
      <div className="list-control-bar">
        <div className="segmented-control" aria-label="班级状态">
          <button type="button" className={status === 'active' ? 'active' : ''} onClick={() => selectStatus('active')}>进行中</button>
          <button type="button" className={status === 'ended' ? 'active' : ''} onClick={() => selectStatus('ended')}>已结束</button>
        </div>
        <Link className="inline-management-link" to="/classes/subjects">管理科目</Link>
      </div>

      {classes.isLoading && <LoadingBlock />}
      {classes.isError && <ErrorBlock message="班级资料载入失败。" />}
      {classes.data?.length === 0 && <EmptyBlock message={status === 'active' ? '还没有进行中的班级。' : '还没有已结束的班级。'} />}
      <div className="record-list">
        {classes.data?.map((item) => (
          <Link className="record-card class-card" to={`/classes/${item.id}`} key={item.id}>
            <span className="record-main">
              <strong>{item.name}</strong>
              <span className="record-meta">{item.subject?.name}</span>
              <ClassScheduleSummary tuitionClass={item} />
              {item.status === 'ended' && <span className="record-meta">结束于 {formatDate(item.end_date)}</span>}
            </span>
            <Icon className="record-chevron" name="chevron-right" size={20} />
          </Link>
        ))}
      </div>
    </section>
  )
}
