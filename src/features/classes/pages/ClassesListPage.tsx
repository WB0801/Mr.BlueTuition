import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Icon } from '../../../components/ui'
import type { ClassStatus } from '../../../types/domain'
import { formatDate } from '../../../utils/format'
import { listClasses } from '../api/classesService'
import { ClassScheduleSummary } from '../components/ClassScheduleSummary'

export function ClassesListPage() {
  const location = useLocation()
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
        actions={<ContextLink backLabel="班级" className="button button-primary" to="/classes/new">新增班级</ContextLink>}
      />
      <div className="list-control-bar">
        <div className="segmented-control" aria-label="班级状态">
          <button type="button" className={status === 'active' ? 'active' : ''} onClick={() => selectStatus('active')}>进行中</button>
          <button type="button" className={status === 'ended' ? 'active' : ''} onClick={() => selectStatus('ended')}>已结束</button>
        </div>
        <ContextLink backLabel="班级" className="inline-management-link" to="/classes/subjects">管理科目</ContextLink>
      </div>
      {(location.state as { successMessage?: string } | null)?.successMessage && (
        <p className="form-success list-success" role="status">{(location.state as { successMessage: string }).successMessage}</p>
      )}

      {classes.isLoading && <LoadingBlock />}
      {classes.isError && <ErrorBlock message="班级资料载入失败。" />}
      {classes.data?.length === 0 && <EmptyBlock message={status === 'active' ? '还没有进行中的班级。' : '还没有已结束的班级。'} />}
      <div className="record-list compact-card-grid class-card-grid">
        {classes.data?.map((item) => (
          <ContextLink backLabel="班级" className="record-card class-card" to={`/classes/${item.id}`} key={item.id}>
            <span className="record-main">
              <strong>{item.name}</strong>
              <span className="record-meta">{item.subject?.name}</span>
              <ClassScheduleSummary tuitionClass={item} />
              {item.status === 'ended' && <span className="record-meta">结束于 {formatDate(item.end_date)}</span>}
            </span>
            <Icon className="record-chevron" name="chevron-right" size={20} />
          </ContextLink>
        ))}
      </div>
    </section>
  )
}
