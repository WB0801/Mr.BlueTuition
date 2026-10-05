import { forwardRef, useImperativeHandle } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignaturePage } from './SignaturePage'
import { updateProtection } from '../../settings/pwa/updateProtection'
import { uploadSignature } from '../api/attendanceService'
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<object>(), useParams: () => ({ sessionId: 'session', studentId: 'a' }), useNavigate: () => vi.fn(), useLocation: () => ({ state: null }), useBlocker: () => ({ state: 'unblocked' }), useBeforeUnload: () => {} }))
vi.mock('../../../components/shared/PageHeader', () => ({ PageHeader: () => null }))
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }))
vi.mock('../../schedule/api/scheduleService', () => ({ getSession: async () => ({ status: 'scheduled', current_start_at: '2026-10-01T06:00:00Z', current_end_at: '2026-10-01T07:00:00Z', class: { name: '隔离班' } }) }))
vi.mock('../api/attendanceService', () => ({ getSessionRoster: async () => [{ student_id: 'a', student_name: '隔离学生', attendance_record_id: null }], buildSignaturePath: () => 'isolated.png', uploadSignature: vi.fn(), recordAttendance: vi.fn() }))
vi.mock('../offline/pendingSignatureStore', () => ({ findPendingSignature: async () => null, savePendingSignature: async () => {}, removePendingSignature: async () => {} }))
vi.mock('../components/SignatureCanvas', () => ({ SignatureCanvas: forwardRef(function Canvas({ onInkChange }: { onInkChange: (ink: boolean) => void }, ref) {
  useImperativeHandle(ref, () => ({ clear: () => onInkChange(false), load: async () => {}, toPngBlob: async () => new Blob(['fictional ink']) }))
  return <button onClick={() => onInkChange(true)}>模拟墨迹</button>
}) }))
afterEach(cleanup)
it('blocks ink, synchronization and a failed pending signature without deleting or overwriting its recovery flow', async () => {
  render(<QueryClientProvider client={new QueryClient()}><SignaturePage /></QueryClientProvider>)
  await screen.findByRole('button', { name: '模拟墨迹' }); expect(updateProtection.reason()).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '模拟墨迹' })); expect(updateProtection.reason()).toContain('签名')
  fireEvent.click(screen.getByRole('button', { name: '清除' })); expect(updateProtection.reason()).toBe('')
  let reject!: (error: Error) => void
  vi.mocked(uploadSignature).mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
  fireEvent.click(screen.getByRole('button', { name: '模拟墨迹' })); fireEvent.click(screen.getByRole('button', { name: /确认(补签|签到)/ }))
  await screen.findByRole('button', { name: '同步中…' }); expect(updateProtection.reason()).toContain('签名')
  await waitFor(() => expect(uploadSignature).toHaveBeenCalled()); reject(new Error('隔离上传失败'))
  await screen.findByRole('button', { name: '重新上传' }); expect(updateProtection.reason()).toContain('签名')
})
