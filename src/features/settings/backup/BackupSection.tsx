import { useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { getErrorMessage } from '../../../utils/errors'
import { createCompleteBackup, downloadBackupFile } from './backupService'

const LAST_BACKUP_KEY = 'lan-laoshi-last-complete-backup-at'

function readLastBackup(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

function formatLastBackup(value: string): string {
  return new Intl.DateTimeFormat('zh-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export function BackupSection() {
  const { user } = useAuth()
  const [isPreparing, setIsPreparing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastBackup, setLastBackup] = useState(readLastBackup)

  async function handleBackup() {
    if (!user || isPreparing) return
    setIsPreparing(true)
    setError('')
    setSuccess('')
    try {
      const archive = await createCompleteBackup(user.id, ({ message }) => setProgress(message))
      downloadBackupFile(archive)
      const completedAt = new Date().toISOString()
      try { window.localStorage.setItem(LAST_BACKUP_KEY, completedAt) } catch { /* reminder only */ }
      setLastBackup(completedAt)
      setSuccess(`完整备份已下载：${archive.manifest.signature_files} 张签名，${Object.values(archive.manifest.tables).reduce((sum, count) => sum + count, 0)} 笔资料。`)
    } catch (backupError) {
      setError(getErrorMessage(backupError, '完整备份失败，请检查网络后重试。'))
    } finally {
      setIsPreparing(false)
      setProgress('')
    }
  }

  return (
    <section className="content-section settings-section" aria-labelledby="backup-heading">
      <div>
        <h2 id="backup-heading">资料备份</h2>
        <p className="muted">下载学生、班级、点名、缴费、成绩及签名的完整备份。</p>
      </div>
      <button className="button button-primary settings-primary-action" disabled={isPreparing || !user} onClick={() => void handleBackup()} type="button">
        {isPreparing ? '正在准备备份…' : '下载完整备份'}
      </button>
      {isPreparing && <p className="backup-progress" role="status">{progress || '正在准备备份…'}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {lastBackup && <p className="settings-note">最近一次在此设备完成备份：{formatLastBackup(lastBackup)}</p>}
      <p className="settings-note">当前版本支持完整资料导出备份；恢复功能暂未开放。</p>
    </section>
  )
}
