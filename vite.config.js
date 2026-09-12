import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import legacy from '@vitejs/plugin-legacy';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    svelte({
      onwarn(warning, fn) {
        /* Pick هو زر ARIA مكتمل — التسميات المجاورة له ليست خطأ */
        if (warning.code === 'a11y_label_has_associated_control') return;
        fn(warning);
      }
    }),
    legacy({ targets: ['chrome >= 87', 'safari >= 14'], modernPolyfills: true }),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script-defer',
      includeAssets: ['fonts/*'],
      manifest: {
        name: 'بوتيك غزالة — GHAZALA BOUTIQUE',
        short_name: 'بوتيك غزالة',
        description: 'نظام إدارة مخزون ومبيعات بوتيك غزالة — يعمل بدون إنترنت',
        dir: 'rtl',
        lang: 'ar',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        background_color: '#FBF3EE',
        theme_color: '#FBF3EE',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
          dexie: ['dexie'],
          zxing: ['@zxing/browser']
        }
      }
    }
  }
});
