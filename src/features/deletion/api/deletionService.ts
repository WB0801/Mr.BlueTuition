import { requireSupabase } from '../../../lib/requireSupabase'

export type DeletableEntityType = 'student' | 'subject' | 'class' | 'temporary_class' | 'school_exam' | 'tuition_quiz'

export interface PermanentDeletionPreview {
  entity_type: DeletableEntityType
  entity_id: string
  entity_name: string
  counts: Record<string, number>
}

export interface PermanentDeletionResult extends PermanentDeletionPreview {
  deleted: true
  signature_paths: string[]
}

export async function previewPermanentDeletion(entityType: DeletableEntityType, entityId: string) {
  const { data, error } = await requireSupabase().rpc('ui51_preview_permanent_delete', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  })
  if (error) throw error
  return normalizePreview(data) as PermanentDeletionPreview
}

export async function permanentlyDeleteEntity(
  entityType: DeletableEntityType,
  entityId: string,
  confirmationName: string,
) {
  const { data, error } = await requireSupabase().rpc('ui51_permanently_delete_entity', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_confirmation_name: confirmationName,
  })
  if (error) throw error
  const normalized = normalizePreview(data)
  return {
    ...normalized,
    deleted: true,
    signature_paths: Array.isArray((data as Record<string, unknown>)?.signature_paths)
      ? (data as Record<string, unknown>).signature_paths as string[]
      : [],
  } as PermanentDeletionResult
}

export async function removeDeletedSignatureFiles(paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return { removedCount: 0, failedPaths: [] as string[] }
  const { data, error } = await requireSupabase().storage.from('signatures').remove(uniquePaths)
  if (error) return { removedCount: 0, failedPaths: uniquePaths }
  const removed = new Set((data ?? []).map((item) => item.name))
  const failedPaths = uniquePaths.filter((path) => !removed.has(path))
  return { removedCount: uniquePaths.length - failedPaths.length, failedPaths }
}

function normalizePreview(value: unknown) {
  const raw = (value ?? {}) as Record<string, unknown>
  const counts = Object.fromEntries(Object.entries((raw.counts ?? {}) as Record<string, unknown>)
    .map(([key, count]) => [key, Number(count ?? 0)]))
  return {
    entity_type: raw.entity_type,
    entity_id: String(raw.entity_id ?? ''),
    entity_name: String(raw.entity_name ?? ''),
    counts,
  }
}
