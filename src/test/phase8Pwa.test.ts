import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const provider = readFileSync(resolve(process.cwd(), 'src/features/settings/pwa/PwaProvider.tsx'), 'utf8')

describe('Phase 8 PWA configuration', () => {
  it('keeps GitHub Pages base path in manifest scope and launch URL', () => {
    expect(viteConfig).toContain("const base = process.env.VITE_BASE_PATH ?? '/'")
    expect(viteConfig).toContain('start_url: base')
    expect(viteConfig).toContain('scope: base')
  })

  it('uses the correct App identity and install icons', () => {
    expect(viteConfig).toContain("name: '蓝老师补习班'")
    expect(viteConfig).toContain('pwa-192x192.png')
    expect(viteConfig).toContain('pwa-512x512.png')
    expect(viteConfig).toContain('brand/app-icon.png')
    expect(indexHtml).toContain('favicon-32x32.png')
    expect(indexHtml).toContain('apple-touch-icon')
  })

  it('prompts before reloading and periodically checks for safe updates', () => {
    expect(viteConfig).toContain("registerType: 'prompt'")
    expect(viteConfig).toContain('cleanupOutdatedCaches: true')
    expect(provider).toContain('60 * 60 * 1000')
    expect(provider).toContain('updateServiceWorker(true)')
  })
})
