import { useQuery } from '@tanstack/react-query'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { formatMoney, formatSessionTimeRange } from '../../../utils/format'
import { listStudentTemporaryClasses } from '../api/temporaryClassesService'

export function StudentTemporaryClassesSection({ studentId }: { studentId: string }) {
  const participations = useQuery({
    queryKey: ['temporary-classes', 'student', studentId],
    queryFn: () => listStudentTemporaryClasses(studentId),
  })

  return (
    <section className="content-section">
      <h2>临时班参与</h2>
      {participations.isLoading && <LoadingBlock />}
      {participations.isError && <ErrorBlock message="临时班参与记录载入失败。" />}
      {!participations.isLoading && participations.data?.length === 0 && <EmptyBlock message="还没有参加过临时班。" />}
      <div className="record-list">
        {participations.data?.map((item) => item.temporary_class && (
          <ContextLink backLabel="学生" className="record-card student-temporary-class-card" to={`/temporary-classes/${item.temporary_class.id}`} key={item.id}>
            <span className="record-main">
              <strong>{item.temporary_class.name}</strong>
              <span>{formatSessionTimeRange(item.temporary_class.start_at, item.temporary_class.end_at)}</span>
              <small>
                {formatMoney(item.payment?.amount ?? item.temporary_class.fee_amount)} · {item.payment?.payment_status === 'paid' ? '已缴' : '未缴'} · {attendanceLabel(item)}
              </small>
            </span>
            <span className={`status-badge status-${item.temporary_class.status}`}>{item.temporary_class.status === 'active' ? '进行中' : '已结束'}</span>
            <span className="chevron" aria-hidden="true">›</span>
          </ContextLink>
        ))}
      </div>
    </section>
  )
}

function attendanceLabel(item: Awaited<ReturnType<typeof listStudentTemporaryClasses>>[number]) {
  if (item.attended) return '已出席'
  if (item.session?.status === 'cancelled') return '停课'
  if (item.session && new Date(item.session.current_start_at) > new Date()) return '尚未上课'
  return '未出席'
}
