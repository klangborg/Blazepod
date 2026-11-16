import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  base: process.env.GITHUB_PAGES === 'true' ? '/Blazepod/' : '/',
  plugins: [
    react(),
    mode === 'https' ? basicSsl() : undefined,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'Blazepod',
        short_name: 'Blazepod',
        lang: 'da',
        description:
          'Programmér og kør Blazepod-øvelser direkte fra telefonen uden officiel app eller abonnement.',
        theme_color: '#0c0d10',
        background_color: '#0c0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'apple-touch-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ].filter(Boolean),
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
}))
