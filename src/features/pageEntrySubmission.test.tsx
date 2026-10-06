import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ContextDataWorkspace } from '../components/contextual/ContextDataWorkspace'
import { HistoricalSchoolScorePanel } from './grades/components/HistoricalSchoolScorePanel'
import { ScheduleChangeForm } from './schedule/components/ScheduleChangeForm'
import { listSchoolExamHistoricalCandidates, saveSchoolExamScores } from './grades/api/gradesService'
import { changeClassSchedule, previewScheduleChange } from './schedule/api/scheduleService'
import type { ClassScheduleRule } from '../types/domain'

vi.mock('./grades/api/gradesService', () => ({ listSchoolExamHistoricalCandidates: vi.fn(), saveSchoolExamScores: vi.fn() }))
vi.mock('./schedule/api/scheduleService', () => ({ changeClassSchedule: vi.fn(), previewScheduleChange: vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined) })
function mount(content: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ContextDataWorkspace label="页面栏目" defaultPanel="form" sections={[
    { id: 'form', label: '当前表单', render: () => content },
    { id: 'other', label: '其他栏目', render: () => <p>其他内容</p> },
  ]} /></MemoryRouter></QueryClientProvider>)
}
it('historical score save locks columns, releases on failure and preserves edited score', async () => {
  vi.mocked(listSchoolExamHistoricalCandidates).mockResolvedValue([{ student_id: 'student-a', student_name: '虚构历史学生', school_class: null, phone: null }] as never)
  let reject!: (reason: Error) => void
  vi.mocked(saveSchoolExamScores).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  mount(<HistoricalSchoolScorePanel examId="exam-a" maxScore={100} existingScores={{}} />)
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('输入学生姓名'), '虚构')
  await user.click(await screen.findByRole('button', { name: /虚构历史学生/ }))
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '60' } })
  await user.click(screen.getByRole('button', { name: '保存成绩' }))
  expect(screen.getByRole('button', { name: '其他栏目' })).toBeDisabled()
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '70' } })
  await act(async () => reject(new Error('模拟失败')))
  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.getByRole('button', { name: '其他栏目' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: '其他栏目' }))
  await user.click(screen.getByRole('button', { name: '当前表单' }))
  expect(screen.getByRole('spinbutton')).toHaveValue(70)
})
it('schedule impact check locks columns before any mutation, then preserves a later edit on cancellation', async () => {
  const rule = { id: 'rule-a', weekday: 2, start_time: '14:00', end_time: '15:00', effective_from: '2026-01-01' } as ClassScheduleRule
  let resolve!: (result: { affected_count: number; manually_adjusted_count: number }) => void
  vi.mocked(previewScheduleChange).mockImplementation(() => new Promise(ok => { resolve = ok }))
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  mount(<ScheduleChangeForm classId="class-a" currentRule={rule} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '检查影响并修改' }))
  expect(screen.getByRole('button', { name: '其他栏目' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '13:00' } })
  await act(async () => resolve({ affected_count: 2, manually_adjusted_count: 0 }))
  expect(changeClassSchedule).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '其他栏目' }))
  await user.click(screen.getByRole('button', { name: '当前表单' }))
  expect(screen.getByLabelText('开始时间')).toHaveValue('13:00')
})
