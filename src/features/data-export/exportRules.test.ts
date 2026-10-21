import { describe, expect, it } from 'vitest'
import { exportDateIncluded, exportMonthIncluded, validateExportOptions, exportFileName } from './exportRules'

describe('export date and scope rules', () => {
  it('validates real dates and includes both Malaysia calendar endpoints without changing roster', () => {
    expect(() => validateExportOptions({ classKeys: ['regular:c'], history: false, details: [], start: '2026-02-30', end: '2026-03-01' })).toThrow()
    expect(() => validateExportOptions({ classKeys: ['regular:c'], history: false, details: [], start: '2026-12-01', end: '2026-01-01' })).toThrow()
    expect(exportDateIncluded('2026-10-01', { start: '2026-10-01', end: '2026-10-31' })).toBe(true)
    expect(exportDateIncluded('2026-11-01', { start: '2026-10-01', end: '2026-10-31' })).toBe(false)
    expect(exportMonthIncluded('2026-10-01', { start: '2026-10-31', end: '2026-11-01' })).toBe(true)
    expect(exportMonthIncluded('2026-11-01', { start: '2026-10-31', end: '2026-11-01' })).toBe(true)
    expect(exportMonthIncluded('2026-09-01', { start: '2026-10-31', end: '2026-11-01' })).toBe(false)
  })
  it('makes a legal filename with Malaysia date, retaining a human-readable range', () => {
    expect(exportFileName('班级/A:*?"<>|\\', new Date('2026-12-31T16:00:00Z'))).toBe('导出资料-班级_A________-2027-01-01.xlsx')
  })
})
