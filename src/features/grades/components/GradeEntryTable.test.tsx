import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import { GradeEntryTable } from './GradeEntryTable'

const rows = [
  { student_id: 'student-1', student_name: '陈小明', school_class: '高一商仁', phone: null },
  { student_id: 'student-2', student_name: '陈小明', school_class: null, phone: '012-3456789' },
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
    expect(screen.getByText('准备贴入 2 笔')).toBeInTheDocument()
    expect(screen.getByText(/人数不符/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认贴入' }))
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

  it('keeps native Tab order, supports Shift+Tab and preserves edits after save failure', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new Error('network'))
    const router = createMemoryRouter([{
      path: '/',
      element: <GradeEntryTable rows={rows} initialScores={{ 'student-1': 50 }} maxScore={100} onSave={onSave} />,
    }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    const inputs = screen.getAllByRole('spinbutton')

    await user.click(inputs[0])
    await user.clear(inputs[0])
    await user.type(inputs[0], '0')
    await user.tab()
    expect(inputs[1]).toHaveFocus()
    await user.tab({ shift: true })
    expect(inputs[0]).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: '保存成绩' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('成绩保存失败，请重试。')
    expect(inputs[0]).toHaveValue(0)
    expect(screen.getByText('尚未保存')).toBeInTheDocument()
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

  it('shows identifying details for same-name students and warns before unloading dirty scores', () => {
    const router = createMemoryRouter([{
      path: '/',
      element: <GradeEntryTable rows={rows} initialScores={{}} maxScore={100} onSave={vi.fn()} />,
    }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    const inputs = screen.getAllByRole('spinbutton')

    expect(screen.getAllByRole('link', { name: '陈小明' })).toHaveLength(2)
    expect(screen.getByText('高一商仁')).toBeInTheDocument()
    expect(screen.getByText('012-3456789')).toBeInTheDocument()
    fireEvent.change(inputs[0], { target: { value: '60' } })
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
  })
})
