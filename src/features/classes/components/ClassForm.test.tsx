import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ClassForm } from './ClassForm'

const subject = {
  id: 'subject-1',
  owner_id: 'owner-1',
  name: '会计学',
  created_at: '2026-08-13T00:00:00Z',
  updated_at: '2026-08-13T00:00:00Z',
}

describe('ClassForm', () => {
  it('rejects an end time that is not after the start time', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ClassForm
        subjects={[subject]}
        initialValue={{
          name: '高一会计学（1）',
          subject_id: subject.id,
          weekday: 6,
          start_time: '14:00',
          end_time: '13:00',
          monthly_fee: 100,
          start_date: '2026-08-01',
        }}
        submitLabel="新增班级"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: '新增班级' }))

    expect(screen.getByRole('alert')).toHaveTextContent('结束时间必须晚于开始时间')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not allow a normal class edit to bypass schedule history', () => {
    render(
      <ClassForm
        subjects={[subject]}
        initialValue={{
          name: '高一会计学（1）',
          subject_id: subject.id,
          weekday: 6,
          start_time: '14:00',
          end_time: '15:30',
          monthly_fee: 100,
          start_date: '2026-08-01',
        }}
        submitLabel="保存修改"
        isSubmitting={false}
        isEditing
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('固定星期')).not.toBeInTheDocument()
    expect(screen.getByText(/使用“修改未来固定课表”/)).toBeInTheDocument()
  })
})
