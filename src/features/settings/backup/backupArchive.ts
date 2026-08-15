import JSZip from 'jszip'
import { BACKUP_TABLES, type BackupRecord, type BackupTableData, type BackupTableName } from './backupSchema'

export const BACKUP_TIMEZONE = 'Asia/Kuala_Lumpur'
export const BACKUP_SCHEMA_VERSION = 'phase8'
export const BACKUP_FORMAT_VERSION = 1

export interface SignatureSourceFile {
  storagePath: string
  bytes: Uint8Array
}

export interface SignatureIndexEntry {
  storage_path: string
  archive_path: string
  byte_size: number
  attendance_record_ids: string[]
  is_orphan: boolean
}

export interface BackupManifest {
  app_name: '蓝老师补习班'
  backup_format: number
  schema_version: string
  exported_at: string
  timezone: string
  tables: Record<string, number>
  table_files: string[]
  signature_files: number
  referenced_signature_files: number
  orphan_signature_files: number
}

export interface BackupArchiveInput {
  exportedAt: Date
  ownerId: string
  tables: BackupTableData
  signatures: SignatureSourceFile[]
}

export interface BackupArchiveResult {
  bytes: Uint8Array
  fileName: string
  rootName: string
  manifest: BackupManifest
}

function valueAsString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function csvCell(value: unknown): string {
  const text = valueAsString(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function csvText(columns: readonly string[], rows: BackupRecord[]): string {
  const lines = [columns.map(csvCell).join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function indexById(rows: BackupRecord[]): Map<string, BackupRecord> {
  return new Map(rows.map((row) => [String(row.id), row]))
}

function addReadableColumns(tableName: BackupTableName, rows: BackupRecord[], tables: BackupTableData, signatureArchivePaths: Map<string, string>) {
  const students = indexById(tables.students)
  const subjects = indexById(tables.subjects)
  const classes = indexById(tables.classes)
  const enrollments = indexById(tables.enrollments)
  const sessions = indexById(tables.class_sessions)
  const exams = indexById(tables.school_exams)
  const quizzes = indexById(tables.tuition_quizzes)
  const temporaryClasses = indexById(tables.temporary_classes)
  const temporaryEnrollments = indexById(tables.temporary_class_enrollments)

  const readableRows = rows.map((row) => {
    const readable: BackupRecord = { ...row }
    const student = students.get(String(row.student_id))
    const tuitionClass = classes.get(String(row.class_id))
    const enrollment = enrollments.get(String(row.enrollment_id))
    const enrollmentClass = enrollment ? classes.get(String(enrollment.class_id)) : undefined
    const session = sessions.get(String(row.session_id))
    const sessionClass = session ? classes.get(String(session.class_id)) : undefined
    const sessionTemporaryClass = session ? temporaryClasses.get(String(session.temporary_class_id)) : undefined

    if (student) readable.student_name = student.name
    if (tuitionClass) readable.class_name = tuitionClass.name
    if (enrollmentClass) readable.enrollment_class_name = enrollmentClass.name

    if (tableName === 'classes' || tableName === 'school_exams' || tableName === 'temporary_classes') {
      readable.subject_name = subjects.get(String(row.subject_id))?.name ?? ''
    }
    if (tableName === 'enrollments') {
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
      readable.class_name = classes.get(String(row.class_id))?.name ?? ''
    }
    if (tableName === 'class_schedule_rules') readable.class_name = classes.get(String(row.class_id))?.name ?? ''
    if (tableName === 'class_sessions') {
      readable.source_name = classes.get(String(row.class_id))?.name ?? temporaryClasses.get(String(row.temporary_class_id))?.name ?? ''
    }
    if (tableName === 'session_schedule_changes') {
      const changedSession = sessions.get(String(row.session_id))
      readable.source_name = changedSession
        ? classes.get(String(changedSession.class_id))?.name ?? temporaryClasses.get(String(changedSession.temporary_class_id))?.name ?? ''
        : ''
    }
    if (tableName === 'attendance_records') {
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
      readable.session_start_at = session?.current_start_at ?? ''
      readable.source_name = sessionClass?.name ?? sessionTemporaryClass?.name ?? ''
      readable.signature_archive_path = signatureArchivePaths.get(String(row.signature_path)) ?? ''
    }
    if (tableName === 'attendance_corrections') {
      const attendance = tables.attendance_records.find((record) => record.id === row.attendance_record_id)
      readable.student_name = attendance ? students.get(String(attendance.student_id))?.name ?? '' : ''
    }
    if (tableName === 'makeup_links') {
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
    }
    if (tableName === 'monthly_fees') {
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
      readable.class_name = enrollmentClass?.name ?? ''
    }
    if (tableName === 'school_exam_scores') {
      const exam = exams.get(String(row.exam_id))
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
      readable.exam_name = exam?.name ?? ''
      readable.exam_date = exam?.exam_date ?? ''
      readable.subject_name = exam ? subjects.get(String(exam.subject_id))?.name ?? '' : ''
    }
    if (tableName === 'tuition_quizzes') readable.class_name = classes.get(String(row.class_id))?.name ?? ''
    if (tableName === 'tuition_quiz_scores') {
      const quiz = quizzes.get(String(row.quiz_id))
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
      readable.quiz_name = quiz?.name ?? ''
      readable.quiz_date = quiz?.quiz_date ?? ''
      readable.class_name = quiz ? classes.get(String(quiz.class_id))?.name ?? '' : ''
    }
    if (tableName === 'temporary_class_enrollments') {
      readable.student_name = students.get(String(row.student_id))?.name ?? ''
      readable.temporary_class_name = temporaryClasses.get(String(row.temporary_class_id))?.name ?? ''
    }
    if (tableName === 'temporary_class_payments') {
      const temporaryEnrollment = temporaryEnrollments.get(String(row.temporary_class_enrollment_id))
      readable.student_name = temporaryEnrollment ? students.get(String(temporaryEnrollment.student_id))?.name ?? '' : ''
      readable.temporary_class_name = temporaryEnrollment ? temporaryClasses.get(String(temporaryEnrollment.temporary_class_id))?.name ?? '' : ''
    }
    return readable
  })

  const extraColumns = Array.from(new Set(readableRows.flatMap((row) => Object.keys(row))))
    .filter((column) => !BACKUP_TABLES.find((table) => table.name === tableName)!.columns.includes(column as never))
  return { rows: readableRows, extraColumns }
}

function datePart(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BACKUP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function displayTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-MY', {
    timeZone: BACKUP_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function archiveSignaturePath(storagePath: string, ownerId: string): string {
  const prefix = `${ownerId}/`
  if (!storagePath.startsWith(prefix)) throw new Error(`发现不属于当前账户的签名路径：${storagePath}`)
  const relativePath = storagePath.slice(prefix.length)
  if (!relativePath || relativePath.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`签名路径格式不安全：${storagePath}`)
  }
  return `signatures/${relativePath}`
}

function makeReadme(exportedAt: Date, manifest: BackupManifest): string {
  return [
    '蓝老师补习班－完整资料备份',
    '',
    `建立时间：${displayTime(exportedAt)}（${BACKUP_TIMEZONE}）`,
    '',
    'json 文件夹保存完整结构资料及 UUID 关系。',
    'csv 文件夹内的资料可以用 Excel 或 Google Sheets 打开。',
    'signatures 文件夹保存学生签到时留下的原始 PNG 签名。',
    'json/signature_index.json 记录每张签名的原始路径、备份路径及对应签到记录。',
    '',
    `本次包含 ${Object.values(manifest.tables).reduce((sum, count) => sum + count, 0)} 笔资料记录及 ${manifest.signature_files} 张签名。`,
    manifest.orphan_signature_files > 0
      ? `其中 ${manifest.orphan_signature_files} 张签名目前没有数据库记录引用，仍已保留，没有删除。`
      : '没有发现未被数据库记录引用的签名图片。',
    '',
    '当前版本只支持完整资料导出备份，暂不提供一键恢复功能。',
    '请妥善保存这个 ZIP 文件。',
    '',
  ].join('\r\n')
}

export async function verifyBackupArchive(bytes: Uint8Array): Promise<BackupManifest> {
  const zip = await JSZip.loadAsync(bytes)
  const manifestFile = Object.values(zip.files).find((file) => file.name.endsWith('/manifest.json'))
  const readmeFile = Object.values(zip.files).find((file) => file.name.endsWith('/README.txt'))
  if (!manifestFile || !readmeFile) throw new Error('备份验证失败：缺少 manifest.json 或 README.txt。')

  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest
  for (const table of BACKUP_TABLES) {
    const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith(`/json/${table.name}.json`))
    const csvFile = Object.values(zip.files).find((file) => file.name.endsWith(`/csv/${table.name}.csv`))
    if (!jsonFile || !csvFile) throw new Error(`备份验证失败：缺少 ${table.name} 的 JSON 或 CSV。`)
    const records = JSON.parse(await jsonFile.async('string')) as unknown[]
    if (!Array.isArray(records) || records.length !== manifest.tables[table.name]) {
      throw new Error(`备份验证失败：${table.name} 的记录数量不一致。`)
    }
    const csv = await csvFile.async('string')
    if (!csv.trim()) throw new Error(`备份验证失败：${table.name}.csv 无法读取。`)
  }

  const signatureIndexFile = Object.values(zip.files).find((file) => file.name.endsWith('/json/signature_index.json'))
  if (!signatureIndexFile) throw new Error('备份验证失败：缺少签名索引。')
  const signatureIndex = JSON.parse(await signatureIndexFile.async('string')) as SignatureIndexEntry[]
  if (signatureIndex.length !== manifest.signature_files) throw new Error('备份验证失败：签名数量与 manifest 不一致。')
  for (const signature of signatureIndex) {
    const signatureFile = Object.values(zip.files).find((file) => file.name.endsWith(`/${signature.archive_path}`))
    if (!signatureFile) throw new Error(`备份验证失败：缺少签名 ${signature.storage_path}。`)
    const bytesInZip = await signatureFile.async('uint8array')
    if (bytesInZip.byteLength !== signature.byte_size) throw new Error(`备份验证失败：签名 ${signature.storage_path} 大小不一致。`)
  }
  return manifest
}

export async function buildBackupArchive(input: BackupArchiveInput): Promise<BackupArchiveResult> {
  const rootName = `蓝老师补习班_完整备份_${datePart(input.exportedAt)}`
  const zip = new JSZip()
  const root = zip.folder(rootName)
  if (!root) throw new Error('无法建立备份资料夹。')

  const attendanceRecords = input.tables.attendance_records
  const references = new Map<string, string[]>()
  for (const record of attendanceRecords) {
    const path = String(record.signature_path ?? '')
    if (!path) throw new Error(`签到记录 ${String(record.id)} 缺少签名路径。`)
    references.set(path, [...(references.get(path) ?? []), String(record.id)])
  }

  const signatureIndex: SignatureIndexEntry[] = input.signatures.map((signature) => ({
    storage_path: signature.storagePath,
    archive_path: archiveSignaturePath(signature.storagePath, input.ownerId),
    byte_size: signature.bytes.byteLength,
    attendance_record_ids: references.get(signature.storagePath) ?? [],
    is_orphan: !references.has(signature.storagePath),
  }))
  const archivedPaths = new Set(signatureIndex.map((signature) => signature.storage_path))
  const missingPaths = Array.from(references.keys()).filter((path) => !archivedPaths.has(path))
  if (missingPaths.length > 0) throw new Error(`完整备份失败：有 ${missingPaths.length} 张签到签名在 Storage 中找不到。`)

  for (const record of attendanceRecords) {
    const expectedSize = typeof record.signature_byte_size === 'number' ? record.signature_byte_size : null
    if (expectedSize === null) continue
    const signature = signatureIndex.find((item) => item.storage_path === record.signature_path)
    if (signature && signature.byte_size !== expectedSize) {
      throw new Error(`完整备份失败：签到记录 ${String(record.id)} 的签名大小与数据库不一致。`)
    }
  }

  const manifest: BackupManifest = {
    app_name: '蓝老师补习班',
    backup_format: BACKUP_FORMAT_VERSION,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: input.exportedAt.toISOString(),
    timezone: BACKUP_TIMEZONE,
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table.name, input.tables[table.name].length])),
    table_files: BACKUP_TABLES.map((table) => table.name),
    signature_files: signatureIndex.length,
    referenced_signature_files: signatureIndex.filter((signature) => !signature.is_orphan).length,
    orphan_signature_files: signatureIndex.filter((signature) => signature.is_orphan).length,
  }

  const signatureArchivePaths = new Map(signatureIndex.map((entry) => [entry.storage_path, entry.archive_path]))
  for (const table of BACKUP_TABLES) {
    const records = input.tables[table.name]
    root.file(`json/${table.name}.json`, JSON.stringify(records, null, 2))
    const readable = addReadableColumns(table.name, records, input.tables, signatureArchivePaths)
    root.file(`csv/${table.name}.csv`, csvText([...table.columns, ...readable.extraColumns], readable.rows))
  }
  root.file('json/signature_index.json', JSON.stringify(signatureIndex, null, 2))
  input.signatures.forEach((signature, index) => root.file(signatureIndex[index].archive_path, signature.bytes))
  root.file('manifest.json', JSON.stringify(manifest, null, 2))
  root.file('README.txt', makeReadme(input.exportedAt, manifest))

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  await verifyBackupArchive(bytes)
  return { bytes, rootName, fileName: `${rootName}.zip`, manifest }
}

