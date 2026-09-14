import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'مطبخنا', short_name: 'مطبخنا', description: 'تطبيق عائلي بسيط لتخطيط الوجبات وقائمة التسوق',
      lang: 'ar', dir: 'rtl', theme_color: '#c65d2e', background_color: '#fff8f2', display: 'standalone',
      icons: [
        { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
      ]
    },
    workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png}'] }
  })]
})
