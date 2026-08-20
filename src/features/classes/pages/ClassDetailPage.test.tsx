import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { ClassDetailPage } from './ClassDetailPage'

vi.mock('../api/classesService', () => ({
  getClass: vi.fn().mockResolvedValue({
    id: 'class-1',
    name: '高一会计',
    subject: { id: 'subject-1', name: '会计学' },
    subject_id: 'subject-1',
    status: 'active',
    monthly_fee: 120,
    weekday: 6,
    start_time: '14:00',
    end_time: '15:30',
    start_date: '2026-08-01',
    end_date: null,
  }),
  endClass: vi.fn(),
}))
vi.mock('../../enrollments/api/enrollmentsService', () => ({
  listClassEnrollments: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../schedule/components/ClassCourseSummary', () => ({
  ClassCourseSummary: () => <section><h2>课程</h2></section>,
}))
vi.mock('../../schedule/components/ClassFixedScheduleSection', () => ({
  ClassFixedScheduleSection: () => <section>固定课表管理</section>,
}))
vi.mock('../../schedule/components/ClassScheduleHistory', () => ({
  ClassScheduleHistory: () => <section>课表历史</section>,
}))

describe('ClassDetailPage hierarchy and connected navigation', () => {
  it('places student information before management and links to connected workflows', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/classes/class-1']}>
          <Routes><Route path="/classes/:classId" element={<ClassDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const students = await screen.findByRole('heading', { name: /当前学生/ })
    const management = screen.getByText('班级管理')
    expect(students.compareDocumentPosition(management) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: '课程' })).toHaveAttribute('href', '/classes/class-1/sessions')
    expect(screen.getByRole('link', { name: '学费' })).toHaveAttribute('href', '/fees?classId=class-1')
    expect(screen.getByRole('link', { name: '小测与成绩' })).toHaveAttribute('href', '/grades/quizzes')
  })
})
