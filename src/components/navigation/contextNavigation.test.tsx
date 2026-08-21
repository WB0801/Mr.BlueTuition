import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { PageHeader } from '../shared/PageHeader'
import { ContextLink } from './ContextLink'
import { createContextBack, getDefaultBackTarget, isSafeInternalRoute, readContextBack } from './contextNavigation'

function SourceState() {
  const location = useLocation()
  return <span>{String((location.state as { activeTab?: string } | null)?.activeTab ?? '')}</span>
}

function renderJourney({
  source,
  target,
  backLabel,
  targetFallback,
  targetFallbackLabel,
  sourceState,
}: {
  source: string
  target: string
  backLabel: string
  targetFallback: string
  targetFallbackLabel: string
  sourceState?: { activeTab: string }
}) {
  const sourcePathname = source.split('?')[0]
  const router = createMemoryRouter([
    {
      path: sourcePathname,
      element: <><ContextLink backLabel={backLabel} to={target}>打开详情</ContextLink><SourceState /></>,
    },
    {
      path: target,
      element: <PageHeader title="详情" backTo={targetFallback} backLabel={targetFallbackLabel} />,
    },
  ], { initialEntries: [{ pathname: sourcePathname, search: source.includes('?') ? `?${source.split('?')[1]}` : '', state: sourceState }] })

  render(<RouterProvider router={router} />)
  return router
}

describe('contextual back navigation', () => {
  it.each([
    {
      name: '从班级进入学生',
      source: '/classes/class-42',
      target: '/students/student-9',
      backLabel: '班级',
      fallback: '/students',
      fallbackLabel: '学生',
    },
    {
      name: '从学费进入学生',
      source: '/fees?month=2026-08&classId=class-42&q=%E9%99%88',
      target: '/students/student-9',
      backLabel: '学费',
      fallback: '/students',
      fallbackLabel: '学生',
    },
    {
      name: '从成绩进入学生',
      source: '/grades/school?year=2026&subjectId=subject-1',
      target: '/students/student-9',
      backLabel: '成绩',
      fallback: '/students',
      fallbackLabel: '学生',
    },
    {
      name: '从学生进入班级',
      source: '/students/student-9',
      target: '/classes/class-42',
      backLabel: '学生',
      fallback: '/classes',
      fallbackLabel: '班级',
    },
  ])('$name时显示正确来源', async ({ source, target, backLabel, fallback, fallbackLabel }) => {
    const user = userEvent.setup()
    renderJourney({ source, target, backLabel, targetFallback: fallback, targetFallbackLabel: fallbackLabel })

    await user.click(screen.getByRole('link', { name: '打开详情' }))

    expect(screen.getByRole('link', { name: `返回${backLabel}` })).toHaveAttribute('href', source)
  })

  it('返回时保留来源筛选参数、页签状态及正确班级路径', async () => {
    const user = userEvent.setup()
    const source = '/classes/class-42?tab=history&sort=name'
    const router = renderJourney({
      source,
      target: '/students/student-9',
      backLabel: '班级',
      targetFallback: '/students',
      targetFallbackLabel: '学生',
      sourceState: { activeTab: 'history' },
    })

    await user.click(screen.getByRole('link', { name: '打开详情' }))
    await user.click(screen.getByRole('link', { name: '返回班级' }))

    expect(router.state.location.pathname + router.state.location.search).toBe(source)
    expect(router.state.location.state).toEqual({ activeTab: 'history', restoreContextScroll: true })
    expect(screen.getByText('history')).toBeInTheDocument()
  })

  it('一级页面默认返回首页', () => {
    const router = createMemoryRouter([
      { path: '/students', element: <PageHeader title="学生" /> },
    ], { initialEntries: ['/students'] })

    render(<RouterProvider router={router} />)

    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/')
  })

  it('直接载入详情页时使用合理默认上级', () => {
    const router = createMemoryRouter([
      { path: '/students/:studentId', element: <PageHeader title="学生详情" /> },
    ], { initialEntries: ['/students/student-9'] })

    render(<RouterProvider router={router} />)

    expect(screen.getByRole('link', { name: '返回学生' })).toHaveAttribute('href', '/students')
  })

  it('拒绝恶意、外部或无效返回路径', () => {
    expect(isSafeInternalRoute('https://evil.example/students')).toBe(false)
    expect(isSafeInternalRoute('//evil.example/students')).toBe(false)
    expect(isSafeInternalRoute('/students/../settings')).toBe(false)
    expect(isSafeInternalRoute('/students%2Fstudent-9')).toBe(false)
    expect(readContextBack({ contextBack: { to: 'https://evil.example', label: '外部网站' } })).toBeNull()
  })

  it('保留安全来源路径中的筛选条件', () => {
    const target = createContextBack('/fees?month=2026-08&classId=class-42&q=%E9%99%88', '学费', { tab: 'unpaid' })

    expect(target).toEqual({
      to: '/fees?month=2026-08&classId=class-42&q=%E9%99%88',
      label: '学费',
      state: { tab: 'unpaid' },
    })
    expect(getDefaultBackTarget('/attendance/session/session-1')).toEqual({ to: '/attendance', label: '课程' })
    expect(getDefaultBackTarget('/settings/backup')).toEqual({ to: '/settings', label: '设置' })
  })
})
