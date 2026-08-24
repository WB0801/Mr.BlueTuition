import JSZip from 'jszip'
import { BACKUP_FORMAT_VERSION, BACKUP_SCHEMA_VERSION, buildBackupArchive, readBackupArchiveData, verifyBackupArchive } from './backupArchive'
import { BACKUP_TABLES, type BackupTableData } from './backupSchema'

const ownerId = '11111111-1111-4111-8111-111111111111'
const signaturePath = `${ownerId}/session/student/request.png`

function emptyTables(): BackupTableData {
  return Object.fromEntries(BACKUP_TABLES.map((table) => [table.name, []])) as unknown as BackupTableData
}

describe('Phase 8 complete backup archive', () => {
  it('creates readable JSON, CSV, manifest, README and matched signatures', async () => {
    const tables = emptyTables()
    tables.students.push({ id: 'student', owner_id: ownerId, name: '陈,小明', school_class: null, phone: null })
    tables.attendance_records.push({
      id: 'attendance',
      owner_id: ownerId,
      student_id: 'student',
      session_id: 'session',
      signature_path: signaturePath,
      signature_byte_size: 4,
    })
    const result = await buildBackupArchive({
      exportedAt: new Date('2026-08-14T08:30:00.000Z'),
      ownerId,
      tables,
      signatures: [{ storagePath: signaturePath, bytes: new Uint8Array([1, 2, 3, 4]) }],
    })

    expect(result.fileName).toBe('蓝老师补习班_完整备份_2026-08-14.zip')
    expect(result.manifest.tables.students).toBe(1)
    expect(result.manifest.signature_files).toBe(1)
    expect(result.manifest.orphan_signature_files).toBe(0)
    expect(result.manifest.backup_format).toBe(BACKUP_FORMAT_VERSION)
    expect(result.manifest.schema_version).toBe(BACKUP_SCHEMA_VERSION)
    await expect(verifyBackupArchive(result.bytes)).resolves.toEqual(result.manifest)

    const zip = await JSZip.loadAsync(result.bytes)
    const root = result.rootName
    expect(zip.file(`${root}/README.txt`)).not.toBeNull()
    expect(zip.file(`${root}/json/students.json`)).not.toBeNull()
    expect(zip.file(`${root}/csv/students.csv`)).not.toBeNull()
    expect(zip.file(`${root}/signatures/session/student/request.png`)).not.toBeNull()
    const csv = await zip.file(`${root}/csv/students.csv`)!.async('string')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"陈,小明"')
  })

  it('refuses to create a misleading backup when a referenced signature is missing', async () => {
    const tables = emptyTables()
    tables.attendance_records.push({ id: 'attendance', signature_path: signaturePath, signature_byte_size: 4 })
    await expect(buildBackupArchive({
      exportedAt: new Date('2026-08-14T08:30:00.000Z'),
      ownerId,
      tables,
      signatures: [],
    })).rejects.toThrow('Storage 中找不到')
  })

  it('keeps and reports unreferenced owner signature files instead of deleting them', async () => {
    const tables = emptyTables()
    const orphanPath = `${ownerId}/old/orphan.png`
    const result = await buildBackupArchive({
      exportedAt: new Date('2026-08-14T08:30:00.000Z'),
      ownerId,
      tables,
      signatures: [{ storagePath: orphanPath, bytes: new Uint8Array([9, 8]) }],
    })
    expect(result.manifest.signature_files).toBe(1)
    expect(result.manifest.orphan_signature_files).toBe(1)
  })

  it('includes leaderboard, reward claims and exact three-record links in new backups', async () => {
    const tables = emptyTables()
    tables.tuition_quiz_top_three_records.push({ id: 'ranking', owner_id: ownerId, quiz_id: 'quiz', class_id: 'class', student_id: 'student', enrollment_id: 'enrollment', rank: 1, score: 100 })
    tables.quiz_reward_claims.push({ id: 'claim', owner_id: ownerId, student_id: 'student', class_id: 'class', status: 'awarded' })
    tables.quiz_reward_claim_items.push({ id: 'item', owner_id: ownerId, claim_id: 'claim', ranking_record_id: 'ranking', quiz_name_snapshot: '小测一', quiz_date_snapshot: '2026-08-01', rank_snapshot: 1, score_snapshot: 100 })
    const result = await buildBackupArchive({ exportedAt: new Date('2026-08-24T08:30:00.000Z'), ownerId, tables, signatures: [] })
    const zip = await JSZip.loadAsync(result.bytes)
    expect(zip.file(`${result.rootName}/json/tuition_quiz_top_three_records.json`)).not.toBeNull()
    expect(zip.file(`${result.rootName}/json/quiz_reward_claims.json`)).not.toBeNull()
    expect(zip.file(`${result.rootName}/json/quiz_reward_claim_items.json`)).not.toBeNull()
    expect(result.manifest.tables.quiz_reward_claim_items).toBe(1)
  })

  it('continues to verify legacy Phase 8 backups without reward tables', async () => {
    const legacyTables = BACKUP_TABLES.filter((table) => ![
      'tuition_quiz_ranking_confirmations',
      'tuition_quiz_top_three_records',
      'quiz_reward_claims',
      'quiz_reward_claim_items',
    ].includes(table.name))
    const zip = new JSZip()
    const root = zip.folder('legacy')!
    for (const table of legacyTables) {
      root.file(`json/${table.name}.json`, '[]')
      root.file(`csv/${table.name}.csv`, '\uFEFFid\r\n')
    }
    root.file('json/signature_index.json', '[]')
    root.file('README.txt', 'legacy')
    root.file('manifest.json', JSON.stringify({
      app_name: '蓝老师补习班',
      backup_format: 1,
      schema_version: 'phase8',
      exported_at: '2026-08-14T00:00:00.000Z',
      timezone: 'Asia/Kuala_Lumpur',
      tables: Object.fromEntries(legacyTables.map((table) => [table.name, 0])),
      table_files: legacyTables.map((table) => table.name),
      signature_files: 0,
      referenced_signature_files: 0,
      orphan_signature_files: 0,
    }))
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(verifyBackupArchive(bytes)).resolves.toMatchObject({ backup_format: 1, schema_version: 'phase8' })
    const restored = await readBackupArchiveData(bytes)
    expect(restored.tables.students).toEqual([])
    expect(restored.tables.tuition_quiz_top_three_records).toEqual([])
    expect(restored.tables.quiz_reward_claims).toEqual([])
  })
})
