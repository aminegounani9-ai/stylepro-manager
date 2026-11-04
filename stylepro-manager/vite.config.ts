import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'stylepro-icon.svg'],
      manifest: {
        id: '/',
        name: 'StylePro Manager',
        short_name: 'StylePro',
        description: 'Gestion professionnelle de boutique, stock, ventes et atelier.',
        lang: 'fr-DZ',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#a9875b',
        background_color: '#f5f1e9',
        icons: [
          { src: '/stylepro-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
