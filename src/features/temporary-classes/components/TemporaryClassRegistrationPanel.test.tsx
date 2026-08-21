import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { TemporaryClassRegistrationPanel } from './TemporaryClassRegistrationPanel'
import { listStudents } from '../../students/api/studentsService'
import { addStudentToTemporaryClass } from '../api/temporaryClassesService'

vi.mock('../../students/api/studentsService', () => ({ listStudents: vi.fn() }))
vi.mock('../api/temporaryClassesService', () => ({
  addStudentToTemporaryClass: vi.fn(),
  createStudentForTemporaryClass: vi.fn(),
}))

const students = [
  { id: 'student-1', owner_id: 'owner', name: '陈小明', school_class: '高一', phone: null, created_at: '', updated_at: '' },
  { id: 'student-2', owner_id: 'owner', name: '林小美', school_class: '高二', phone: '012', created_at: '', updated_at: '' },
  { id: 'student-3', owner_id: 'owner', name: '黄小华', school_class: '高三', phone: null, created_at: '', updated_at: '' },
]

describe('TemporaryClassRegistrationPanel', () => {
  it('excludes enrolled students and batch adds the selected eligible students', async () => {
    vi.mocked(listStudents).mockResolvedValue(students)
    vi.mocked(addStudentToTemporaryClass).mockResolvedValue({} as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <TemporaryClassRegistrationPanel classId="temp-1" enrollments={[{ student_id: 'student-1' } as never]} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('林小美')).toBeInTheDocument()
    expect(screen.getByText('黄小华')).toBeInTheDocument()
    expect(screen.queryByText('陈小明')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '全选目前名单' }))
    expect(screen.getByText('已选 2 位')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认加入' }))

    await waitFor(() => expect(addStudentToTemporaryClass).toHaveBeenCalledTimes(2))
    expect(addStudentToTemporaryClass).toHaveBeenNthCalledWith(1, 'temp-1', 'student-2')
    expect(addStudentToTemporaryClass).toHaveBeenNthCalledWith(2, 'temp-1', 'student-3')
  })
})
