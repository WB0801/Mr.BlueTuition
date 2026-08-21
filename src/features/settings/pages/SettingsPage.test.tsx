import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  it('separates general settings and data management into compact entries', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: '一般设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '资料管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /App、离线与更新/ })).toHaveAttribute('href', '/settings/app')
    expect(screen.getByRole('link', { name: /完整资料备份/ })).toHaveAttribute('href', '/settings/backup')
    expect(screen.getByRole('link', { name: /最近操作/ })).toHaveAttribute('href', '/settings/activity')
    expect(screen.queryByRole('button', { name: '恢复备份' })).not.toBeInTheDocument()
  })
})
