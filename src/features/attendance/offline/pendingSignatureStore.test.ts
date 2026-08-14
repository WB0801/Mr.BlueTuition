import fs from 'node:fs'
import path from 'node:path'

describe('pending signature protection', () => {
  it('persists the PNG in IndexedDB before starting upload', () => {
    const page = fs.readFileSync(path.resolve('src/features/attendance/pages/SignaturePage.tsx'), 'utf8')
    const handler = page.slice(page.indexOf('async function handleConfirm'))
    expect(handler.indexOf('await savePendingSignature(item)')).toBeGreaterThanOrEqual(0)
    expect(handler.indexOf('await savePendingSignature(item)')).toBeLessThan(handler.indexOf('await syncSignature(item)'))
  })

  it('keeps the pending item when upload or database recording fails', () => {
    const page = fs.readFileSync(path.resolve('src/features/attendance/pages/SignaturePage.tsx'), 'utf8')
    const sync = page.slice(page.indexOf('async function syncSignature'), page.indexOf('async function handleConfirm'))
    expect(sync).toContain('await uploadSignature')
    expect(sync).toContain('await recordAttendance')
    expect(sync).toContain('await removePendingSignature')
    expect(sync).toMatch(/catch \(caughtError\)[\s\S]*wasOffline: true[\s\S]*setPending\(retainedItem\)/)
    expect(sync).toContain('尚未同步')
  })

  it('stores the device capture time in every pending item', () => {
    const page = fs.readFileSync(path.resolve('src/features/attendance/pages/SignaturePage.tsx'), 'utf8')
    expect(page).toContain('capturedAt: new Date().toISOString()')
    expect(page).toContain('item.capturedAt')
    expect(page).toContain('item.wasOffline')
  })
})
