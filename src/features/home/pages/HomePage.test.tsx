import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from './HomePage'

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  it('shows exactly the seven requested primary entries', () => {
    renderHome()

    const navigation = screen.getByRole('navigation', { name: '主要功能' })
    expect(navigation.querySelectorAll('a')).toHaveLength(7)
    expect(screen.getByRole('link', { name: /学生/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /班级/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /点名/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /学费/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /成绩/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /临时班/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /设置/ })).toBeInTheDocument()
  })

  it('enables student search in Phase 2', () => {
    renderHome()

    expect(screen.getByRole('searchbox', { name: '搜索学生' })).toBeEnabled()
  })
})
