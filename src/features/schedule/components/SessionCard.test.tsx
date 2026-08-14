import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ClassSessionWithClass } from '../../../types/domain'
import { SessionCard } from './SessionCard'

const extraSession: ClassSessionWithClass = {
  id: 'session-1',
  owner_id: 'owner-1',
  class_id: 'class-1',
  schedule_rule_id: null,
  session_type: 'extra',
  schedule_week: null,
  original_start_at: '2026-08-19T11:00:00Z',
  original_end_at: '2026-08-19T12:30:00Z',
  current_start_at: '2026-08-19T11:00:00Z',
  current_end_at: '2026-08-19T12:30:00Z',
  status: 'cancelled',
  cancelled_at: '2026-08-13T09:00:00Z',
  created_at: '2026-08-13T09:00:00Z',
  updated_at: '2026-08-13T09:00:00Z',
  class: {
    id: 'class-1',
    name: '高一会计学（1）',
    status: 'active',
    subject: { id: 'subject-1', name: '会计学' },
  },
}

describe('SessionCard', () => {
  it('clearly marks extra sessions and uses the user-facing stop wording', () => {
    render(<MemoryRouter><SessionCard session={extraSession} showClass /></MemoryRouter>)

    expect(screen.getByText('高一会计学（1）')).toBeInTheDocument()
    expect(screen.getByText('额外补课')).toBeInTheDocument()
    expect(screen.getByText('停课')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/attendance/session/session-1')
  })

  it('shows a temporary class as the Session source', () => {
    const temporarySession: ClassSessionWithClass = {
      ...extraSession,
      id: 'temporary-session',
      class_id: null,
      temporary_class_id: 'temporary-class-1',
      session_type: 'temporary',
      status: 'scheduled',
      cancelled_at: null,
      class: null,
      temporary_class: {
        id: 'temporary-class-1',
        name: '商业学冲刺班',
        status: 'active',
        subject: { id: 'subject-2', name: '商业学' },
      },
    }
    render(<MemoryRouter><SessionCard session={temporarySession} showClass /></MemoryRouter>)

    expect(screen.getByText('商业学冲刺班')).toBeInTheDocument()
    expect(screen.getByText('临时班')).toBeInTheDocument()
    expect(screen.getByText('已安排')).toBeInTheDocument()
  })
})
