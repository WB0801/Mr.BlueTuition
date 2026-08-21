import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { listSubjects } from '../../classes/api/subjectsService'
import { listSchoolExamOverviews } from '../api/gradesService'
import { SchoolExamsPage } from './SchoolExamsPage'

vi.mock('../../classes/api/subjectsService', () => ({ listSubjects: vi.fn() }))
vi.mock('../api/gradesService', () => ({ listSchoolExamOverviews: vi.fn() }))

function renderPage(initialEntry = '/grades/school') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/grades/school', element: <SchoolExamsPage /> }], { initialEntries: [initialEntry] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
}

describe('SchoolExamsPage', () => {
  it('shows tabs, newest-first compact rows and derived score progress', async () => {
    vi.mocked(listSubjects).mockResolvedValue([{ id: 'subject-1', name: '会计学' }] as never)
    vi.mocked(listSchoolExamOverviews).mockResolvedValue([
      { id: 'exam-new', name: '年终考试', exam_date: '2026-11-20', year: 2026, subject_id: 'subject-1', subject: { id: 'subject-1', name: '会计学' }, recorded: 12, total: 12, status: 'complete' },
      { id: 'exam-old', name: '年中考试', exam_date: '2026-05-20', year: 2026, subject_id: 'subject-1', subject: { id: 'subject-1', name: '会计学' }, recorded: 4, total: 12, status: 'partial' },
    ] as never)
    renderPage('/grades/school?year=2026&subjectId=subject-1')

    expect(await screen.findByRole('navigation', { name: '成绩类别' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '学校考试' })).toHaveClass('active')
    const rows = await screen.findAllByRole('row')
    expect(rows[1]).toHaveTextContent('年终考试')
    expect(rows[1]).toHaveTextContent('12 / 12')
    expect(rows[1]).toHaveTextContent('已完成')
    expect(rows[2]).toHaveTextContent('年中考试')
    expect(rows[2]).toHaveTextContent('4 / 12')
  })

  it('restores year, subject and search filters from the URL', async () => {
    vi.mocked(listSubjects).mockResolvedValue([{ id: 'subject-1', name: '会计学' }] as never)
    vi.mocked(listSchoolExamOverviews).mockResolvedValue([])
    renderPage('/grades/school?year=2025&subjectId=subject-1&q=mid')

    expect(await screen.findByDisplayValue('2025')).toBeInTheDocument()
    await screen.findByRole('option', { name: '会计学' })
    expect(screen.getByDisplayValue('会计学')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '搜索学校考试' })).toHaveValue('mid')
  })
})
