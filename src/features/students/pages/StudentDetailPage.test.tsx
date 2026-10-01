import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StudentDetailPage } from './StudentDetailPage'
import userEvent from '@testing-library/user-event'
vi.mock('../api/studentsService', () => ({ getStudent: vi.fn().mockResolvedValue({ id: 'student-a', owner_id: 'owner-a', name: '蓝炜滨', school_class: '高一甲', phone: null }) }))
vi.mock('../../enrollments/api/enrollmentsService', () => ({ listStudentEnrollments: vi.fn().mockResolvedValue([]) }))
vi.mock('../../classes/api/classesService', () => ({ listClasses: vi.fn().mockResolvedValue([]) }))
vi.mock('../../enrollments/components/NewEnrollmentForm', () => ({ NewEnrollmentForm: () => null }))
vi.mock('../../temporary-classes/components/StudentTemporaryClassesSection', () => ({ StudentTemporaryClassesSection: () => null }))
it('defaults to enrollments, opens management on demand and keeps attendance in the student route', async () => {
  localStorage.clear()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/students/student-a']}><Routes><Route path="/students/:studentId" element={<StudentDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)
  await screen.findByRole('heading', { name: '蓝炜滨' })
  expect(screen.queryByText('永久删除学生')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '出席与课程' })).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: '学生管理' }))
  const management = screen.getByRole('region', { name: '学生管理' })
  expect(management).toContainElement(screen.getByText('永久删除学生'))
  expect(management).toContainElement(screen.getByRole('link', { name: '编辑学生', hidden: true }))
  expect(screen.queryByRole('link', { name: /出席与课程/ })).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('recent-students-v1:owner-a')!)).toEqual(['student-a'])
})
