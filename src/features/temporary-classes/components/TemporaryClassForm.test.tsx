import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { TemporaryClassForm } from './TemporaryClassForm'

describe('TemporaryClassForm', () => {
  it('collects only the one-off class fields and submits local date and time values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <TemporaryClassForm
        subjects={[{ id: 'subject-1', owner_id: 'owner-1', name: '商业学', created_at: '', updated_at: '' }]}
        initialValue={{ subject_id: '', name: '', class_date: '2026-09-20', start_time: '14:00', end_time: '17:00', fee_amount: 40 }}
        submitLabel="建立临时班"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('临时班名称'), { target: { value: '高一商业学冲刺班' } })
    fireEvent.change(screen.getByLabelText('科目'), { target: { value: 'subject-1' } })
    fireEvent.click(screen.getByRole('button', { name: '建立临时班' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      subject_id: 'subject-1',
      name: '高一商业学冲刺班',
      class_date: '2026-09-20',
      start_time: '14:00',
      end_time: '17:00',
      fee_amount: 40,
    }))
    expect(screen.queryByLabelText(/每月/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/容量/)).not.toBeInTheDocument()
  })
})
