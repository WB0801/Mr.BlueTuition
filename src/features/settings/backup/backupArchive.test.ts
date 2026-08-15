import JSZip from 'jszip'
import { buildBackupArchive, verifyBackupArchive } from './backupArchive'
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
})

