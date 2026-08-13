import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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
})
