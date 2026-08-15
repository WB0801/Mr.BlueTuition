import { requireSupabase } from '../../../lib/requireSupabase'
import { buildBackupArchive, type BackupArchiveResult, type SignatureSourceFile } from './backupArchive'
import { BACKUP_TABLES, type BackupRecord, type BackupTableData, type BackupTableName } from './backupSchema'

const DATABASE_PAGE_SIZE = 500
const STORAGE_PAGE_SIZE = 100

export type BackupProgress =
  | { stage: 'data'; message: string }
  | { stage: 'signatures'; message: string }
  | { stage: 'zip'; message: string }
  | { stage: 'verify'; message: string }

async function readWholeTable(tableName: BackupTableName): Promise<BackupRecord[]> {
  const records: BackupRecord[] = []
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    const { data, error } = await requireSupabase()
      .from(tableName)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + DATABASE_PAGE_SIZE - 1)
    if (error) throw new Error(`读取 ${tableName} 失败：${error.message}`)
    const page = (data ?? []) as BackupRecord[]
    records.push(...page)
    if (page.length < DATABASE_PAGE_SIZE) return records
  }
}

async function listSignaturePaths(prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await requireSupabase().storage.from('signatures').list(prefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`读取签名目录失败：${error.message}`)
    const page = data ?? []
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) paths.push(...await listSignaturePaths(path))
      else paths.push(path)
    }
    if (page.length < STORAGE_PAGE_SIZE) return paths
  }
}

async function downloadSignatures(ownerId: string, onProgress: (progress: BackupProgress) => void): Promise<SignatureSourceFile[]> {
  const paths = await listSignaturePaths(ownerId)
  const signatures: SignatureSourceFile[] = []
  for (let index = 0; index < paths.length; index += 1) {
    onProgress({ stage: 'signatures', message: `正在下载签名 ${index + 1} / ${paths.length}` })
    const { data, error } = await requireSupabase().storage.from('signatures').download(paths[index])
    if (error || !data) throw new Error(`下载签名失败：${paths[index]}${error ? `（${error.message}）` : ''}`)
    signatures.push({ storagePath: paths[index], bytes: new Uint8Array(await data.arrayBuffer()) })
  }
  return signatures
}

export async function createCompleteBackup(ownerId: string, onProgress: (progress: BackupProgress) => void): Promise<BackupArchiveResult> {
  if (!ownerId) throw new Error('无法确认目前登录账户。')
  const tables = {} as BackupTableData
  for (let index = 0; index < BACKUP_TABLES.length; index += 1) {
    const table = BACKUP_TABLES[index]
    onProgress({ stage: 'data', message: `正在读取资料 ${index + 1} / ${BACKUP_TABLES.length}` })
    tables[table.name] = await readWholeTable(table.name)
  }
  const signatures = await downloadSignatures(ownerId, onProgress)
  onProgress({ stage: 'zip', message: '正在建立 ZIP 备份…' })
  const archive = await buildBackupArchive({ exportedAt: new Date(), ownerId, tables, signatures })
  onProgress({ stage: 'verify', message: '正在验证备份完整性…' })
  return archive
}

export function downloadBackupFile(archive: BackupArchiveResult): void {
  const bytes = new Uint8Array(archive.bytes)
  const blob = new Blob([bytes.buffer], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = archive.fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

