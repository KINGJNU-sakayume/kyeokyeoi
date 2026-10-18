import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: '켜켜이',
        short_name: '켜켜이',
        description: '지나온 장소와 시간을 한 겹씩 쌓아 두는 기록장',
        start_url: '/kyeokyeoi/',
        scope: '/kyeokyeoi/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F5F7F3',
        background_color: '#F5F7F3',
        lang: 'ko',
        icons: [
          {
            src: '/kyeokyeoi/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/kyeokyeoi/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/kyeokyeoi/icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 앱 셸과 지도 데이터는 미리 받아 두고, 글꼴 조각은 처음 쓸 때 받아서 보관해요
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        globIgnores: ['**/manifest.webmanifest'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: '/kyeokyeoi/',
  build: {
    outDir: 'docs',
  },
})
