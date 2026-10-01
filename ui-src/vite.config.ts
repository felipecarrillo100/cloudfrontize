/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))

// `npm run dev` serves the UI with hot reload against a running CloudFrontize WebUI
// (CFZ_WEBUI, default http://127.0.0.1:3001). The WebUI only accepts its own origin, so the proxy
// drops the dev server's Origin header.
const webui = process.env.CFZ_WEBUI ?? 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: '../ui',
    emptyOutDir: true,
    // Served from the local disk by the WebUI, so bundle size isn't a network cost; the editor is split out
    chunkSizeWarningLimit: 800,
  },
  resolve: {
    alias: {
      '@contract': path.resolve(__dirname, '../src/api/contract.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: webui,
        changeOrigin: true,
        configure: proxy => proxy.on('proxyReq', req => req.removeHeader('origin')),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
