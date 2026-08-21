import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { PwaContext, type PwaContextValue } from './pwaContext'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'

function contextValue(overrides: Partial<PwaContextValue> = {}): PwaContextValue {
  return {
    isSupported: true,
    isInstalled: false,
    isOnline: true,
    canInstall: false,
    isOfflineReady: true,
    needRefresh: false,
    statusMessage: '',
    connectionMessage: '',
    install: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    reloadToUpdate: vi.fn().mockResolvedValue(undefined),
    dismissUpdate: vi.fn(),
    dismissStatus: vi.fn(),
    ...overrides,
  }
}

function renderPrompt(value: PwaContextValue) {
  return render(<PwaContext.Provider value={value}><PwaUpdatePrompt /></PwaContext.Provider>)
}

describe('PwaUpdatePrompt', () => {
  it('gives a clear update action without blocking the page', async () => {
    const value = contextValue({ needRefresh: true })
    renderPrompt(value)

    expect(screen.getByText('有新版本可用')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '立即更新' }))
    expect(value.reloadToUpdate).toHaveBeenCalled()
  })

  it('shows offline and reconnection states in plain language', () => {
    const { rerender } = renderPrompt(contextValue({ isOnline: false }))
    expect(screen.getByRole('complementary', { name: '离线状态' })).toHaveTextContent('目前离线')

    rerender(<PwaContext.Provider value={contextValue({ connectionMessage: '网络已重新连接。' })}><PwaUpdatePrompt /></PwaContext.Provider>)
    expect(screen.getByText('网络已重新连接。')).toBeInTheDocument()
  })

  it('offers a dismissible install prompt when the browser supports it', async () => {
    const value = contextValue({ canInstall: true })
    renderPrompt(value)

    expect(screen.getByText('安装蓝老师补习班')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(value.install).toHaveBeenCalled()
  })
})
