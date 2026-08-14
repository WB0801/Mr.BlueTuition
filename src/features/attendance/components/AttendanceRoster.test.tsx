import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ClassSessionWithClass, SessionRosterEntry } from '../../../types/domain'
import { AttendanceRoster } from './AttendanceRoster'

const session: ClassSessionWithClass = {
  id: 'session-1',
  owner_id: 'owner-1',
  class_id: 'class-1',
  schedule_rule_id: 'rule-1',
  session_type: 'regular',
  schedule_week: '2020-08-10',
  original_start_at: '2020-08-15T14:00:00+08:00',
  original_end_at: '2020-08-15T15:30:00+08:00',
  current_start_at: '2020-08-15T14:00:00+08:00',
  current_end_at: '2020-08-15T15:30:00+08:00',
  status: 'scheduled',
  cancelled_at: null,
  created_at: '2020-08-01T00:00:00Z',
  updated_at: '2020-08-01T00:00:00Z',
  class: { id: 'class-1', name: '高一会计学（1）', status: 'active' },
}

const absentEntry: SessionRosterEntry = {
  student_id: 'student-1',
  student_name: '陈小明',
  school_class: '高一商仁',
  phone: null,
  participation_type: 'regular',
  makeup_link_id: null,
  source_session_id: null,
  attendance_record_id: null,
  captured_at: null,
  synced_at: null,
  capture_source: null,
  signing_type: null,
  signature_path: null,
  made_up_session_id: 'target-session',
  made_up_at: '2020-08-16T19:00:00+08:00',
}

describe('AttendanceRoster', () => {
  it('derives an absent student and shows completed makeup without turning it into attendance', () => {
    render(<MemoryRouter><AttendanceRoster session={session} entries={[absentEntry]} /></MemoryRouter>)
    expect(screen.getByText('未出席')).toBeInTheDocument()
    expect(screen.getByText(/已于.*补课/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '补签' })).toHaveAttribute(
      'href',
      '/attendance/session/session-1/sign/student-1',
    )
  })

  it('shows backfill and cross-class participation labels for a valid signature', () => {
    const signed: SessionRosterEntry = {
      ...absentEntry,
      participation_type: 'makeup',
      makeup_link_id: 'makeup-1',
      attendance_record_id: 'attendance-1',
      captured_at: '2020-08-16T10:32:00+08:00',
      synced_at: '2020-08-16T10:35:00+08:00',
      capture_source: 'device_offline',
      signing_type: 'backfill',
      signature_path: 'private.png',
      made_up_session_id: null,
      made_up_at: null,
    }
    render(<MemoryRouter><AttendanceRoster session={session} entries={[signed]} /></MemoryRouter>)
    expect(screen.getByText('跨班补课')).toBeInTheDocument()
    expect(screen.getByText('已补签')).toBeInTheDocument()
    expect(screen.getByText(/离线签名/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看签名' })).toBeInTheDocument()
  })

  it('does not expose attendance actions for a stopped Session', () => {
    render(
      <MemoryRouter>
        <AttendanceRoster session={{ ...session, status: 'cancelled', cancelled_at: '2020-08-14T00:00:00Z' }} entries={[absentEntry]} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/已停课/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '补签' })).not.toBeInTheDocument()
  })
})
