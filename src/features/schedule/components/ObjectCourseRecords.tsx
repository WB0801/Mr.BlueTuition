import { useState } from 'react'
import { RecordDetailFrame } from '../../../components/contextual/RecordDetailFrame'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import type { TuitionClass } from '../../../types/domain'
import { AttendanceRecords } from './AttendanceRecords'
import { ClassScheduleSection } from './ClassScheduleSection'
import { SessionDetails } from './SessionDetails'
import { todayInMalaysia } from '../../../utils/format'

export function ObjectCourseRecords({ scope, active, tuitionClass, prefix = 'attendance' }: { scope: { studentId?: string; classId?: string }; active: boolean; tuitionClass?: TuitionClass; prefix?: string }) {
  const { get, set } = useRecordParams(prefix)
  const record = get('record')
  const [opened, setOpened] = useState<string[]>(() => record ? [record] : [])
  function select(id: string) { setOpened(current => [...new Set([...current, id])]); set('record', id, true) }
  const ids = [...new Set([...opened, ...(record ? [record] : [])])]
  return <>
    <div hidden={Boolean(record)}>
      {tuitionClass ? <ClassScheduleSection key={todayInMalaysia()} tuitionClass={tuitionClass} active={active && !record} prefix={prefix} onSelect={select} /> : <AttendanceRecords scope={scope} prefix={prefix} active={active && !record} onSelect={select} />}
    </div>
    {ids.map(id => <div key={id} hidden={record !== id}>
      <RecordDetailFrame title="课程详情" backLabel={tuitionClass ? '课程列表' : '出席与课程'} onBack={() => set('record', '', true)}>
        <SessionDetails sessionId={id} scope={scope} prefix={prefix} active={active && record === id} />
      </RecordDetailFrame>
    </div>)}
  </>
}
