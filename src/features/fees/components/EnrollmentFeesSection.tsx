import { useQuery } from '@tanstack/react-query'
import type { EnrollmentDetails } from '../../../types/domain'
import { currentMonthInMalaysia } from '../../../utils/format'
import { ensureMonthlyFees, listMonthlyFees } from '../api/feesService'
import { MonthlyFeeCard } from './MonthlyFeeCard'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'

export function EnrollmentFeesSection({ enrollment }: { enrollment: EnrollmentDetails }) {
  const currentMonth = currentMonthInMalaysia()
  const firstMonth = `${enrollment.join_date.slice(0, 7)}-01`
  const finalEnrollmentMonth = enrollment.end_date ? `${enrollment.end_date.slice(0, 7)}-01` : currentMonth
  const lastMonth = finalEnrollmentMonth < currentMonth ? finalEnrollmentMonth : currentMonth
  const shouldEnsure = firstMonth <= lastMonth
  const ensure = useQuery({
    queryKey: ['monthly-fees', 'ensure', enrollment.id, firstMonth, lastMonth],
    queryFn: () => ensureMonthlyFees(firstMonth, lastMonth),
    enabled: shouldEnsure,
  })
  const fees = useQuery({
    queryKey: ['monthly-fees', 'enrollment', enrollment.id],
    queryFn: () => listMonthlyFees({ enrollmentId: enrollment.id }),
    enabled: !shouldEnsure || ensure.isSuccess,
  })
  const feesByYear = (fees.data ?? []).reduce<Record<string, typeof fees.data>>((groups, fee) => {
    const year = fee.fee_month.slice(0, 4)
    groups[year] = [...(groups[year] ?? []), fee]
    return groups
  }, {})

  return (
    <section className="content-section" id="enrollment-fees">
      <h2>学费</h2>
      {(ensure.isLoading || fees.isLoading) && <LoadingBlock />}
      {(ensure.isError || fees.isError) && <ErrorBlock message="学费历史载入失败。" />}
      {!fees.isLoading && fees.data?.length === 0 && <EmptyBlock message="目前没有月费记录。" />}
      <div className="enrollment-fee-history">
        {Object.entries(feesByYear).map(([year, yearFees]) => (
          <section className="enrollment-fee-year" key={year}>
            <h3>{year}</h3>
            <div className="enrollment-fee-year-list">
              {(yearFees ?? []).map((fee) => (
                <div className="enrollment-fee-row" key={fee.id}>
                  <h4>{Number(fee.fee_month.slice(5, 7))}月</h4>
                  <MonthlyFeeCard fee={fee} showClass={false} showStudent={false} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
