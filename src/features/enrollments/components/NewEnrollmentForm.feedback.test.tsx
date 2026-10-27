import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewEnrollmentForm } from './NewEnrollmentForm'
import { createEnrollment } from '../api/enrollmentsService'
import { createFormProtection } from '../../settings/pwa/updateProtection'
import type { TuitionClass } from '../../../types/domain'
vi.mock('../api/enrollmentsService', () => ({ createEnrollment: vi.fn() }))
it('reports the submitted class/date while preserving a later class/date draft and its PWA baseline', async () => {
  let finish!: () => void
  vi.mocked(createEnrollment).mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }); return {} as never })
  render(<QueryClientProvider client={new QueryClient()}><NewEnrollmentForm studentId="fictional" classes={[{ id: 'a', name: '虚构甲班' }, { id: 'b', name: '虚构乙班' }] as TuitionClass[]} /></QueryClientProvider>)
  const protection = createFormProtection(document), user = userEvent.setup()
  try {
    await user.selectOptions(screen.getByLabelText('班级'), 'a')
    fireEvent.change(screen.getByLabelText('加入日期'), { target: { value: '2026-10-27' } })
    await user.click(screen.getByRole('button', { name: '加入班级' }))
    await user.selectOptions(screen.getByLabelText('班级'), 'b')
    fireEvent.change(screen.getByLabelText('加入日期'), { target: { value: '2026-11-01' } })
    await act(async () => finish())
    expect(screen.getByRole('status')).toHaveTextContent('虚构甲班')
    expect(screen.getByRole('status')).toHaveTextContent('2026/10/27')
    expect(screen.getByLabelText('班级')).toHaveValue('b')
    expect(screen.getByLabelText('加入日期')).toHaveValue('2026-11-01')
    expect(protection.reason()).toContain('未保存')
    expect(createEnrollment).toHaveBeenCalledExactlyOnceWith('fictional', 'a', '2026-10-27')
  } finally { protection.dispose() }
})
