import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8')
const appLayout = readFileSync(resolve(process.cwd(), 'src/components/layout/AppLayout.tsx'), 'utf8')

describe('UI Phase 5 consistency and responsive safety', () => {
  it('uses in-page errors instead of runtime alerts for the global shell', () => {
    expect(appLayout).not.toContain('window.alert')
    expect(appLayout).toContain('role="alert"')
  })

  it('keeps phase 5 lists and prompts within the mobile viewport', () => {
    expect(css).toContain('@media (max-width: 560px)')
    expect(css).toContain('.temporary-class-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; }')
    expect(css).toContain('.temporary-enrollment-row { grid-template-columns: 1fr; align-items: stretch; }')
    expect(css).toContain('.pwa-status-prompt { left: 12px; right: 12px; bottom: 12px; max-width: none;')
    expect(css).toContain('.settings-menu-item { grid-template-columns: 36px minmax(0, 1fr) 18px;')
  })
})
