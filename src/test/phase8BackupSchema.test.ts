import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { BACKUP_TABLES } from '../features/settings/backup/backupSchema'

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations')
const migrations = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(resolve(migrationDirectory, name), 'utf8'))
  .join('\n')

describe('Phase 8 backup schema coverage', () => {
  it('exports every user-owned table created by the production migrations', () => {
    const schemaTables = Array.from(migrations.matchAll(/^create table public\.([a-z_]+)/gm), (match) => match[1])
      .filter((name) => name !== 'profiles')
      .sort()
    const backupTables = BACKUP_TABLES.map((table) => table.name).sort()
    expect(backupTables).toEqual(schemaTables)
  })

  it('keeps RLS and authenticated read access on every exported table', () => {
    for (const table of BACKUP_TABLES) {
      expect(migrations).toContain(`alter table public.${table.name} enable row level security`)
      expect(migrations).toMatch(new RegExp(`grant\\s+[^;]*\\bselect\\b[^;]*\\bon\\s+public\\.${table.name}\\b`, 'i'))
    }
  })
})
