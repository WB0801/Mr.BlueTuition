import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { BackupSection } from './BackupSection'
import { createCompleteBackup, downloadBackupFile } from './backupService'

vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-1' } }) }))
vi.mock('./backupService', () => ({ createCompleteBackup: vi.fn(), downloadBackupFile: vi.fn() }))

const archive = {
  bytes: new Uint8Array([1]),
  rootName: 'backup',
  fileName: '蓝老师补习班_完整备份_2026-08-21.zip',
  manifest: { signature_files: 2, tables: { students: 3, classes: 1 } },
}

describe('BackupSection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows progress, verified filename and success after download', async () => {
    let resolveBackup: (value: typeof archive) => void = () => undefined
    vi.mocked(createCompleteBackup).mockImplementation((_ownerId, onProgress) => {
      onProgress({ stage: 'data', message: '正在读取资料 1 / 19' })
      return new Promise((resolve) => { resolveBackup = resolve }) as never
    })
    render(<BackupSection />)

    fireEvent.click(screen.getByRole('button', { name: '下载完整备份' }))
    expect(await screen.findByText('正在读取资料 1 / 19')).toBeInTheDocument()
    resolveBackup(archive)

    expect(await screen.findByText(/备份已下载：2 张签名，4 笔资料/)).toBeInTheDocument()
    expect(screen.getByText(archive.fileName)).toBeInTheDocument()
    expect(screen.getByText('已验证')).toBeInTheDocument()
    expect(downloadBackupFile).toHaveBeenCalledWith(archive)
  })

  it('keeps a clear retryable error state when backup creation fails', async () => {
    vi.mocked(createCompleteBackup).mockRejectedValue(new Error('网络中断'))
    render(<BackupSection />)

    fireEvent.click(screen.getByRole('button', { name: '下载完整备份' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('完整备份失败，请检查网络后重试。')
    await waitFor(() => expect(screen.getByRole('button', { name: '下载完整备份' })).toBeEnabled())
    expect(downloadBackupFile).not.toHaveBeenCalled()
  })
})
