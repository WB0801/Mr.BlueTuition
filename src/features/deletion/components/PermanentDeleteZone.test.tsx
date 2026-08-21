import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import {
  permanentlyDeleteEntity,
  previewPermanentDeletion,
  removeDeletedSignatureFiles,
} from '../api/deletionService'
import { PermanentDeleteZone } from './PermanentDeleteZone'

vi.mock('../api/deletionService', () => ({
  previewPermanentDeletion: vi.fn(),
  permanentlyDeleteEntity: vi.fn(),
  removeDeletedSignatureFiles: vi.fn(),
}))

const preview = {
  entity_type: 'student' as const,
  entity_id: 'student-1',
  entity_name: '陈小明',
  counts: { enrollments: 2, monthly_fees: 3, signature_files: 1 },
}

function renderZone(onDeleted = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PermanentDeleteZone entityType="student" entityId="student-1" entityName="陈小明" entityLabel="学生" onDeleted={onDeleted} />
    </QueryClientProvider>,
  )
  return onDeleted
}

describe('PermanentDeleteZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(previewPermanentDeletion).mockResolvedValue(preview)
    vi.mocked(permanentlyDeleteEntity).mockResolvedValue({ ...preview, deleted: true, signature_paths: [] })
    vi.mocked(removeDeletedSignatureFiles).mockResolvedValue({ removedCount: 0, failedPaths: [] })
  })

  it('shows real impact counts and requires the full matching name', async () => {
    const user = userEvent.setup()
    renderZone()
    await user.click(screen.getByText('永久删除学生', { selector: 'summary' }))
    expect(await screen.findByText('当前与历史报读')).toBeInTheDocument()
    expect(screen.getByText('月费与收据记录')).toBeInTheDocument()
    const deleteButton = screen.getByRole('button', { name: '永久删除学生' })
    expect(deleteButton).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: /输入完整名称/ }), '陈小名')
    expect(deleteButton).toBeDisabled()
    await user.clear(screen.getByRole('textbox', { name: /输入完整名称/ }))
    await user.type(screen.getByRole('textbox', { name: /输入完整名称/ }), '陈小明')
    expect(deleteButton).toBeEnabled()
  })

  it('allows a no-association preview to continue after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(previewPermanentDeletion).mockResolvedValue({ ...preview, counts: {} })
    const onDeleted = renderZone()
    await user.click(screen.getByText('永久删除学生', { selector: 'summary' }))
    expect(await screen.findByText('没有找到关联业务资料，只会删除此学生。')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /输入完整名称/ }), '陈小明')
    await user.click(screen.getByRole('button', { name: '永久删除学生' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('cancels without modifying data and permits deletion even with associations', async () => {
    const user = userEvent.setup()
    const onDeleted = renderZone()
    await user.click(screen.getByText('永久删除学生', { selector: 'summary' }))
    await screen.findByText('当前与历史报读')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(permanentlyDeleteEntity).not.toHaveBeenCalled()

    await user.click(screen.getByText('永久删除学生', { selector: 'summary' }))
    await user.type(screen.getByRole('textbox', { name: /输入完整名称/ }), '陈小明')
    await user.click(screen.getByRole('button', { name: '永久删除学生' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(permanentlyDeleteEntity).toHaveBeenCalledWith('student', 'student-1', '陈小明')
  })

  it('keeps a safe retry when database deletion succeeds but Storage cleanup fails', async () => {
    const user = userEvent.setup()
    vi.mocked(permanentlyDeleteEntity).mockResolvedValue({ ...preview, deleted: true, signature_paths: ['owner/one.png'] })
    vi.mocked(removeDeletedSignatureFiles)
      .mockResolvedValueOnce({ removedCount: 0, failedPaths: ['owner/one.png'] })
      .mockResolvedValueOnce({ removedCount: 1, failedPaths: [] })
    const onDeleted = renderZone()
    await user.click(screen.getByText('永久删除学生', { selector: 'summary' }))
    await screen.findByText('当前与历史报读')
    await user.type(screen.getByRole('textbox', { name: /输入完整名称/ }), '陈小明')
    await user.click(screen.getByRole('button', { name: '永久删除学生' }))
    expect(await screen.findByRole('button', { name: '重试清理 1 个签名档案' })).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '重试清理 1 个签名档案' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('keeps the page and reports that database deletion did not complete on RPC failure', async () => {
    const user = userEvent.setup()
    vi.mocked(permanentlyDeleteEntity).mockRejectedValue(new Error('transaction rolled back'))
    const onDeleted = renderZone()
    await user.click(screen.getByText('永久删除学生', { selector: 'summary' }))
    await screen.findByText('当前与历史报读')
    await user.type(screen.getByRole('textbox', { name: /输入完整名称/ }), '陈小明')
    await user.click(screen.getByRole('button', { name: '永久删除学生' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('数据库没有完成删除')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: /输入完整名称/ })).toBeInTheDocument()
  })
})
