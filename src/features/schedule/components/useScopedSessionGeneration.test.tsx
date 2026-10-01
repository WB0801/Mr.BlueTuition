import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useScopedSessionGeneration } from './useScopedSessionGeneration'
import { ensureRollingSessions } from '../api/scheduleService'
import { installContextDataInvalidation, invalidateContextClassCreation } from '../../../components/contextual/contextDataInvalidation'
vi.mock('../api/scheduleService', () => ({ ensureRollingSessions: vi.fn().mockResolvedValue(undefined) }))
function Panel({ active, label }: { active: boolean; label: string }) { const query = useScopedSessionGeneration(active); return <p>{label}: {query.isSuccess ? 'ready' : 'pending'}</p> }
it('shares one rolling generation across courses and attendance while navigation reuses the ready result', async () => {
  vi.mocked(ensureRollingSessions).mockClear()
  const client = new QueryClient()
  const renderPanels = (course: boolean) => <QueryClientProvider client={client}><Panel active={course} label="课程" /><Panel active={!course} label="点名" /></QueryClientProvider>
  const page = render(renderPanels(true)); await screen.findByText('课程: ready')
  page.rerender(renderPanels(false)); await screen.findByText('点名: ready')
  page.rerender(renderPanels(true)); await screen.findByText('课程: ready')
  expect(ensureRollingSessions).toHaveBeenCalledTimes(1)
})
it('prepares rolling courses again for a newly created class, but not after signing', async () => {
  vi.mocked(ensureRollingSessions).mockClear()
  const client = new QueryClient(); installContextDataInvalidation(client)
  const panels = (active: boolean) => <QueryClientProvider client={client}><Panel active={active} label="课程" /></QueryClientProvider>
  const page = render(panels(true)); await screen.findByText('课程: ready')
  page.rerender(panels(false)); await invalidateContextClassCreation(client); page.rerender(panels(true))
  await screen.findByText('课程: ready')
  expect(ensureRollingSessions).toHaveBeenCalledTimes(2)
  page.rerender(panels(false)); await client.invalidateQueries({ queryKey: ['attendance','course-a','roster'] }); page.rerender(panels(true))
  expect(ensureRollingSessions).toHaveBeenCalledTimes(2)
})
