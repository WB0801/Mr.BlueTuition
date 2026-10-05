import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash, randomUUID } from 'node:crypto'

const base = process.env.VITE_BASE_PATH ?? '/'
// One identity shared by the JS and uncached metadata of this exact build, including uncommitted builds.
const appBuild = { id: createHash('sha256').update(randomUUID()).digest('hex').slice(0, 20), builtAt: new Date().toISOString() }

export default defineConfig({
  base,
  define: { __APP_BUILD__: JSON.stringify(appBuild) },
  plugins: [
    { name: 'app-build-identity', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(appBuild) }) } },
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'brand/app-icon.png',
        'brand/full-logo.png',
        'brand/monochrome-logo.png',
      ],
      manifest: {
        name: '蓝老师补习班',
        short_name: '蓝老师补习班',
        description: '蓝老师的私人补习班管理系统',
        lang: 'zh-CN',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#fbf8f1',
        theme_color: '#102743',
        icons: [
          { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: false,
        globIgnores: ['**/version.json'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
