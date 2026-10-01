import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { RecordDetailFrame } from '../../../components/contextual/RecordDetailFrame'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { currentMonthInMalaysia, formatFeeMonth, formatMalaysiaDateTime, formatMoney, normalizeMonthInput } from '../../../utils/format'
import type { MonthlyFeeDetails } from '../../../types/domain'
import { completeReceipts, ensureMonthlyFees, listMonthlyFees, restoreReceipt } from '../api/feesService'
import { matchesFeeStatus, sortFeesForWorkflow, type FeeStatusFilter } from '../feePresentation'
import { MonthlyFeeCard } from './MonthlyFeeCard'
import { getErrorMessage } from '../../../utils/errors'

export interface FeeRecordScope { studentId?: string; classId?: string }

export function FeeRecords({ scope, prefix = 'fees', active = true }: { scope: FeeRecordScope; prefix?: string; active?: boolean }) {
  const { get, set, locked } = useRecordParams(prefix)
  const defaultMonth = scope.studentId ? 'all' : currentMonthInMalaysia().slice(0, 7)
  const requestedMonth = get('month', defaultMonth)
  const month = requestedMonth === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : defaultMonth
  const rawStatus = get('status', scope.studentId ? 'all' : 'unpaid')
  const status: FeeStatusFilter = rawStatus === 'paid' || rawStatus === 'all' ? rawStatus : 'unpaid'
  const feeMonth = month === 'all' ? currentMonthInMalaysia() : normalizeMonthInput(month)
  // Same generation boundary as the original fee module, shared per month.
  // Navigation alone never invalidates this key or recreates snapshots.
  const ensure = useQuery({ queryKey: ['monthly-fees-generation', feeMonth], queryFn: () => ensureMonthlyFees(feeMonth), enabled: active, staleTime: Infinity, refetchOnWindowFocus: false })
  const fees = useQuery({
    queryKey: ['monthly-fees', 'list', month === 'all' ? 'all' : feeMonth, scope.classId ?? '', scope.studentId ?? '', month === 'all' ? feeMonth : ''],
    queryFn: () => listMonthlyFees({ feeMonth: month === 'all' ? undefined : feeMonth, classId: scope.classId, studentId: scope.studentId }),
    enabled: active && ensure.isSuccess && !ensure.isFetching,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const visible = sortFeesForWorkflow((fees.data ?? []).filter(fee => matchesFeeStatus(fee, status)), { status, classId: scope.classId })
  const recordId = get('record')
  const record = fees.data?.find(fee => fee.id === recordId)
  return <section className="scoped-fee-records">
    <div hidden={Boolean(recordId)}>
      <h2>缴费记录</h2>
      <fieldset className="context-filters" disabled={locked}>
        <label className="field"><span>月份</span><input type="month" aria-label="指定月份" value={month === 'all' ? '' : month} max={currentMonthInMalaysia().slice(0, 7)} onChange={event => set('month', event.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={month === 'all'} onChange={event => set('month', event.target.checked ? 'all' : currentMonthInMalaysia().slice(0, 7))} />所有月份</label>
        <div className="segmented-control" role="group" aria-label="缴费状态">
          {(['unpaid', 'paid', 'all'] as const).map(value => <button key={value} type="button" aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => set('status', value)}>{value === 'unpaid' ? '未缴' : value === 'paid' ? '已缴' : '全部'}</button>)}
        </div>
      </fieldset>
      {fees.isSuccess && visible.length === 0 && <EmptyBlock message="目前没有符合筛选的缴费记录。" />}
      <FeeRecordList records={visible} studentScoped={Boolean(scope.studentId)} onSelect={id => set('record', id, true)} />
    </div>
    {(ensure.isLoading || fees.isLoading) && active && <LoadingBlock message="正在准备月费记录…" />}
    {(ensure.isError || fees.isError) && <><ErrorBlock message="月费资料载入失败。" /><button type="button" className="button button-secondary" onClick={() => void (ensure.isError ? ensure.refetch() : fees.refetch())}>重试</button></>}
    {recordId && <RecordDetailFrame title={get('receipt') === '1' ? '收据详情' : '缴费记录详情'} backLabel="缴费记录" onBack={() => set('record', '', true)}>
      {fees.isSuccess && !record && <ErrorBlock message="此范围内找不到该笔缴费记录。" />}
      {record && <>
        <div hidden={get('receipt') === '1'}><MonthlyFeeCard key={record.id} fee={record} showStudent={!scope.studentId} showClass={!scope.classId} backLabel={scope.studentId ? '学生' : '班级'} />
          {record.payment_status === 'paid' && <button type="button" className="button button-secondary" onClick={() => set('receipt', '1', true)} disabled={locked}>查看收据详情</button>}
        </div>
        {get('receipt') === '1' && <FeeReceiptDetails fee={record} onBack={() => set('receipt', '', true)} />}
      </>}
    </RecordDetailFrame>}
  </section>
}

export function FeeRecordList({ records, studentScoped, onSelect }: { records: MonthlyFeeDetails[]; studentScoped?: boolean; onSelect: (id: string) => void }) {
  return <div className="record-list">{records.map(fee => <button className="compact-data-row context-record-row" type="button" key={fee.id} data-context-record={fee.id} onClick={() => onSelect(fee.id)}>
    <span className="record-main"><strong>{formatFeeMonth(fee.fee_month)}{!studentScoped && ` · ${fee.student?.name ?? '学生资料不可用'}`}</strong>
      {!studentScoped && <small>{[fee.student?.school_class, fee.student?.phone].filter(Boolean).join(' · ')}</small>}
      <span className="record-meta">{fee.enrollment?.class?.name ?? '班级资料不可用'}</span><span className="sr-only">查看记录</span></span>
    <span className="context-record-status"><strong>{formatMoney(fee.actual_amount)}</strong><span>{fee.payment_status === 'paid' ? fee.receipt_status === 'pending' ? '已缴 · 待开收据' : '已缴 · 收据已处理' : fee.payment_status === 'waived' ? '本月不再追缴' : '未缴'}</span></span><span aria-hidden="true">›</span>
  </button>)}</div>
}

function FeeReceiptDetails({ fee, onBack }: { fee: MonthlyFeeDetails; onBack: () => void }) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => { if (fee.receipt_status === 'pending') await completeReceipts([`monthly_fee:${fee.id}`]); else await restoreReceipt(`monthly_fee:${fee.id}`) },
    onSuccess: () => Promise.all(['monthly-fees', 'pending-receipts', 'pending-receipt-count', 'receipt-queue'].map(key => client.invalidateQueries({ queryKey: [key] }))),
  })
  const locked = useRecordParams('fees').locked
  return <section><button type="button" className="button button-text" disabled={locked} onClick={onBack}>返回缴费详情</button>
    <dl className="details-card"><div><dt>收费对象</dt><dd>{fee.student?.name} · {fee.enrollment?.class?.name}</dd></div><div><dt>收费月份</dt><dd>{formatFeeMonth(fee.fee_month)}</dd></div><div><dt>金额</dt><dd>{formatMoney(fee.actual_amount)}</dd></div><div><dt>缴费时间</dt><dd>{formatMalaysiaDateTime(fee.paid_at)}</dd></div><div><dt>收据状态</dt><dd>{fee.receipt_status === 'pending' ? '待开收据' : fee.receipt_status === 'completed' ? '已处理' : '无需收据'}</dd></div>{fee.receipt_completed_at && <div><dt>处理时间</dt><dd>{formatMalaysiaDateTime(fee.receipt_completed_at)}</dd></div>}</dl>
    {fee.payment_status === 'paid' && <button className="button button-secondary" disabled={mutation.isPending} onClick={() => { if (fee.receipt_status !== 'completed' || window.confirm('确定恢复为待处理吗？')) mutation.mutate() }}>{mutation.isPending ? '处理中…' : fee.receipt_status === 'pending' ? '标记收据已处理' : '恢复为待处理'}</button>}
    {mutation.isError && <p role="alert" className="form-error">{getErrorMessage(mutation.error, '收据更新失败，请重试。')}</p>}
  </section>
}
