import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { GradeEntryTable } from './GradeEntryTable'

const rows = [
  { student_id: 'student-1', student_name: '陈小明', school_class: '高一商仁', phone: null },
  { student_id: 'student-2', student_name: '林欣怡', school_class: null, phone: null },
  { student_id: 'student-3', student_name: '王志豪', school_class: null, phone: null },
]

describe('GradeEntryTable', () => {
  it('fills a pasted column, keeps zero, moves down with Enter and saves once', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const router = createMemoryRouter([{
      path: '/',
      element: <GradeEntryTable rows={rows} initialScores={{}} maxScore={100} onSave={onSave} />,
    }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    const inputs = screen.getAllByRole('spinbutton')

    fireEvent.paste(inputs[0], { clipboardData: { getData: () => '72\n0' } })
    expect(inputs[0]).toHaveValue(72)
    expect(inputs[1]).toHaveValue(0)
    expect(inputs[2]).toHaveValue(null)

    inputs[0].focus()
    fireEvent.keyDown(inputs[0], { key: 'Enter' })
    expect(inputs[1]).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '保存成绩' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([
      { student_id: 'student-1', enrollment_id: undefined, score: 72 },
      { student_id: 'student-2', enrollment_id: undefined, score: 0 },
      { student_id: 'student-3', enrollment_id: undefined, score: null },
    ]))
    expect(await screen.findByText('成绩已保存。')).toBeInTheDocument()
  })

  it('rejects a pasted column that is longer than the remaining roster', () => {
    const router = createMemoryRouter([{
      path: '/',
      element: <GradeEntryTable rows={rows} initialScores={{}} maxScore={100} onSave={vi.fn()} />,
    }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    const inputs = screen.getAllByRole('spinbutton')

    fireEvent.paste(inputs[1], { clipboardData: { getData: () => '10\n20\n30' } })
    expect(screen.getByRole('alert')).toHaveTextContent('粘贴了 3 个成绩')
    expect(inputs[1]).toHaveValue(null)
  })
})
