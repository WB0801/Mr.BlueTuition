import { EmptyBlock } from '../../../components/feedback/QueryState'
import { RecordDetailFrame } from '../../../components/contextual/RecordDetailFrame'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { ContextLink } from '../../../components/navigation/ContextLink'
import type { EnrollmentWithClass } from '../../../types/domain'
import { formatDate } from '../../../utils/format'

export function StudentEnrollmentRecords({ records, studentId }: { records: EnrollmentWithClass[]; studentId: string }) {
  const { get, set } = useRecordParams('enrollments')
  const selected = records.find(record => record.id === get('record'))
  const current = records.filter(record => record.status === 'active')
  const history = records.filter(record => record.status === 'ended')
  const row = (record: EnrollmentWithClass) => <button type="button" className="compact-data-row context-record-row" key={record.id} data-context-record={record.id} onClick={() => set('record', record.id, true)}><span className="record-main"><strong>{record.class?.name ?? '班级资料不可用'}</strong><span className="record-meta">{formatDate(record.join_date)}{record.end_date ? ` – ${formatDate(record.end_date)}` : ' 加入'}</span></span><span>{record.status === 'active' ? '在读' : '已结束'} ›</span></button>
  return <>
    <div hidden={Boolean(get('record'))}><h2>当前报读 <span className="section-count">{current.length}</span></h2>
      {current.length === 0 && <EmptyBlock message="目前没有进行中的报读。" />}
      <div className="record-list">{current.map(row)}</div>
      <details className="history-panel" open={get('history') === '1'}><summary onClick={event => { event.preventDefault(); set('history', get('history') === '1' ? '' : '1') }}>历史报读（{history.length}）</summary>
        {history.length === 0 && <EmptyBlock message="还没有历史报读。" />}<div className="record-list">{history.map(row)}</div>
      </details>
    </div>
    {get('record') && <RecordDetailFrame title="报读资料" backLabel="班级与报读" onBack={() => set('record', '', true)}>
      {selected ? <><h3>{selected.class?.name ?? '班级资料不可用'}</h3><dl className="details-card"><div><dt>加入日期</dt><dd>{formatDate(selected.join_date)}</dd></div><div><dt>结束日期</dt><dd>{formatDate(selected.end_date)}</dd></div><div><dt>状态</dt><dd>{selected.status === 'active' ? '在读' : '已结束'}</dd></div></dl>
        <div className="inline-actions">{selected.class && <ContextLink backLabel="学生" className="button button-secondary" to={`/classes/${selected.class.id}`}>班级详情</ContextLink>}
          <ContextLink backLabel="学生" className="button button-secondary" to={`/students/${studentId}/enrollments/${selected.id}`}>报读操作与管理</ContextLink></div>
      </> : <EmptyBlock message="此学生范围内找不到这段报读。" />}
    </RecordDetailFrame>}
  </>
}
