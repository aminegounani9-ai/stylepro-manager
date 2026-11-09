import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const isDesktopBuild = mode === 'desktop'
  const env = loadEnv(mode, process.cwd(), '')

  // Prevent packaging a Windows app that would crash at startup because
  // Supabase settings were not embedded into the desktop build.
  if (isDesktopBuild) {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
      .filter((name) => !env[name]?.trim())
    if (missing.length) {
      throw new Error(
        `Desktop build stopped: missing ${missing.join(', ')}. Create stylepro-manager/.env.local from .env.example before building.`,
      )
    }
  }

  return {
    // Only Tauri's production build uses relative local asset paths.
    // Normal web/PWA builds and Android are deliberately unchanged.
    base: isDesktopBuild ? './' : '/',
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
  }
})
