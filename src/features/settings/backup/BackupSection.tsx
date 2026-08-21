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
  const [lastFileName, setLastFileName] = useState('')

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
      setLastFileName(archive.fileName)
      setSuccess(`备份已下载：${archive.manifest.signature_files} 张签名，${Object.values(archive.manifest.tables).reduce((sum, count) => sum + count, 0)} 笔资料。`)
    } catch (backupError) {
      setError(getErrorMessage(backupError, '完整备份失败，请检查网络后重试。'))
    } finally {
      setIsPreparing(false)
      setProgress('')
    }
  }

  return (
    <section className="settings-section settings-backup-section" aria-labelledby="backup-heading">
      <div className="settings-section-heading">
        <div>
          <h2 id="backup-heading">建立与下载备份</h2>
          <p>包含学生、班级、课程、点名、收费、成绩及 private 签名档案。</p>
        </div>
      </div>
      <button className="button button-primary settings-primary-action" disabled={isPreparing || !user} onClick={() => void handleBackup()} type="button">
        {isPreparing ? '正在准备备份…' : '下载完整备份'}
      </button>
      {isPreparing && <p className="backup-progress" role="status">{progress || '正在准备备份…'}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {lastFileName && <dl className="backup-result-details"><div><dt>档案名称</dt><dd>{lastFileName}</dd></div><div><dt>完整性</dt><dd>已验证</dd></div></dl>}
      {lastBackup && <p className="settings-note">最近一次在此设备完成备份：{formatLastBackup(lastBackup)}</p>}
    </section>
  )
}
