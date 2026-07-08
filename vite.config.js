import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'RefMemo',
        short_name: 'RefMemo',
        description: 'Visual reference boards for illustration projects',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'images', accept: ['image/*'] }]
          }
        }
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webp,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/iunqiswpbqijkqylfrll\.supabase\.co\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-images',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90 }
            }
          },
          {
            urlPattern: /^https:\/\/i\.pinimg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pinterest-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ]
})
