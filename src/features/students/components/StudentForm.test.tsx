import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { StudentForm } from './StudentForm'

describe('StudentForm', () => {
  it('requires only the student name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<StudentForm submitLabel="新增学生" isSubmitting={false} onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: '姓名' }), '庄阅浩')
    await user.click(screen.getByRole('button', { name: '新增学生' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: '庄阅浩',
      school_class: '',
      phone: '',
    })
  })

  it('warns about a possible duplicate but still permits an explicit continue choice', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MemoryRouter><StudentForm
        submitLabel="新增学生"
        isSubmitting={false}
        duplicateStudents={[{
          id: 'student-1', owner_id: 'owner', name: '庄阅浩', school_class: '高一', phone: '0123456789', created_at: '', updated_at: '', reasons: ['姓名相同'],
        }]}
        onSubmit={onSubmit}
      /></MemoryRouter>)

    await user.type(screen.getByRole('textbox', { name: '姓名' }), '庄阅浩')
    expect(screen.getByRole('button', { name: '新增学生' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '查看现有资料' })).toHaveAttribute('href', '/students/student-1')
    await user.click(screen.getByRole('checkbox', { name: '这些可能是不同学生，我确认仍然建立' }))
    await user.click(screen.getByRole('button', { name: '新增学生' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
