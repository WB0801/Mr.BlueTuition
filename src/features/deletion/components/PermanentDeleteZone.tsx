import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { getErrorMessage } from '../../../utils/errors'
import {
  permanentlyDeleteEntity,
  previewPermanentDeletion,
  removeDeletedSignatureFiles,
  type DeletableEntityType,
  type PermanentDeletionResult,
} from '../api/deletionService'

const countLabels: Record<string, string> = {
  students: '学生关系',
  related_classes: '相关班级',
  classes: '常态班',
  temporary_classes: '临时班',
  enrollments: '当前与历史报读',
  schedule_rules: '课表规则及历史',
  sessions: '课程',
  attendance_records: '点名与签名记录',
  attendance_corrections: '作废与修正记录',
  makeup_links: '补签与跨班补课关系',
  monthly_fees: '月费与收据记录',
  school_exams: '学校考试',
  school_exam_scores: '学校考试成绩',
  tuition_quizzes: '补习班小测',
  tuition_quiz_scores: '小测成绩',
  temporary_enrollments: '临时班报名',
  temporary_payments: '临时班付款与收据',
  signature_files: 'Storage 签名档案',
  transfer_links_detached: '需解除的转班来源关系',
  activity_logs: '相关操作记录',
}

interface PermanentDeleteZoneProps {
  entityType: DeletableEntityType
  entityId: string
  entityName: string
  entityLabel: string
  onDeleted: (result: PermanentDeletionResult) => void | Promise<void>
}

export function PermanentDeleteZone({ entityType, entityId, entityName, entityLabel, onDeleted }: PermanentDeleteZoneProps) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [failedPaths, setFailedPaths] = useState<string[]>([])
  const [result, setResult] = useState<PermanentDeletionResult | null>(null)
  const [error, setError] = useState('')
  const preview = useQuery({
    queryKey: ['permanent-deletion-preview', entityType, entityId],
    queryFn: () => previewPermanentDeletion(entityType, entityId),
    enabled: open && !result,
  })

  const finishStorageCleanup = async (deleted: PermanentDeletionResult, paths: string[]) => {
    const cleanup = await removeDeletedSignatureFiles(paths)
    if (cleanup.failedPaths.length > 0) {
      setFailedPaths(cleanup.failedPaths)
      setError(`数据库资料已删除，但仍有 ${cleanup.failedPaths.length} 个签名档案尚未清理。请重试清理。`)
      return
    }
    setFailedPaths([])
    setError('')
    await onDeleted(deleted)
  }

  const remove = useMutation({
    mutationFn: () => permanentlyDeleteEntity(entityType, entityId, confirmation),
    onSuccess: async (deleted) => {
      setResult(deleted)
      await finishStorageCleanup(deleted, deleted.signature_paths)
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, `永久删除${entityLabel}失败；数据库没有完成删除。`)),
  })

  const retryCleanup = useMutation({
    mutationFn: () => removeDeletedSignatureFiles(failedPaths),
    onSuccess: async (cleanup) => {
      if (!result) return
      if (cleanup.failedPaths.length > 0) {
        setFailedPaths(cleanup.failedPaths)
        setError(`仍有 ${cleanup.failedPaths.length} 个签名档案尚未清理，请稍后重试。`)
        return
      }
      setFailedPaths([])
      setError('')
      await onDeleted(result)
    },
    onError: () => setError(`仍有 ${failedPaths.length} 个签名档案尚未清理，请稍后重试。`),
  })

  const entries = Object.entries(preview.data?.counts ?? {}).filter(([, count]) => count > 0)
  const requiredName = preview.data?.entity_name ?? entityName
  const confirmationMatches = confirmation.trim() === requiredName

  return (
    <details className="danger-panel permanent-delete-zone" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>永久删除{entityLabel}</summary>
      {!result && preview.isLoading && <LoadingBlock message="正在读取真实影响范围…" />}
      {!result && preview.isError && <ErrorBlock message="无法读取删除影响范围，暂时不能继续。" />}
      {!result && preview.data && (
        <div className="permanent-delete-content">
          <p className="danger-message"><strong>此操作无法复原。</strong> 删除会在同一数据库 transaction 内处理以下关联资料：</p>
          {entries.length > 0 ? (
            <dl className="deletion-impact-list">
              {entries.map(([key, count]) => <div key={key}><dt>{countLabels[key] ?? key}</dt><dd>{count}</dd></div>)}
            </dl>
          ) : <p className="settings-note">没有找到关联业务资料，只会删除此{entityLabel}。</p>}
          <label className="field permanent-delete-confirmation">
            <span>输入完整名称「{requiredName}」确认</span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="inline-actions">
            <button className="button button-danger" type="button" disabled={!confirmationMatches || remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? '永久删除中…' : `永久删除${entityLabel}`}
            </button>
            <button className="button button-text" type="button" disabled={remove.isPending} onClick={() => { setOpen(false); setConfirmation(''); setError('') }}>取消</button>
          </div>
        </div>
      )}
      {result && failedPaths.length > 0 && (
        <div className="permanent-delete-content">
          <p className="form-error" role="alert">{error}</p>
          <button className="button button-danger" type="button" disabled={retryCleanup.isPending} onClick={() => retryCleanup.mutate()}>
            {retryCleanup.isPending ? '清理中…' : `重试清理 ${failedPaths.length} 个签名档案`}
          </button>
        </div>
      )}
    </details>
  )
}
