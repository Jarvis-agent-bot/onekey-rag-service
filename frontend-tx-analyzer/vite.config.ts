import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'path'
import { fileURLToPath } from 'url'
import manifest from './src/manifest.json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Web mode: disable crxjs plugin (causes allowedHosts issues)
const isWebMode = process.env.VITE_WEB_MODE === 'true'

export default defineConfig({
  base: '/',
  plugins: isWebMode
    ? [react()]
    : [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    origin: 'http://localhost:5175',
    allowedHosts: true,
    watch: {
      ignored: ['**/.pnpm-store/**', '**/node_modules/**'],
    },
    hmr: {
      host: 'localhost',
      port: 5175,
    },
    proxy: {
      // Proxy API requests to TX Analyzer backend
      '/tx-analyzer/api': {
        target: process.env.VITE_TX_ANALYZER_API_URL || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tx-analyzer\/api/, ''),
      },
      // Also support /api path for direct API access
      '/api': {
        target: process.env.VITE_TX_ANALYZER_API_URL || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        // Main web entry (root index.html)
        main: 'index.html',
        // Chrome Extension pages
        popup: 'src/popup/index.html',
        sidepanel: 'src/sidepanel/index.html',
        options: 'src/options/index.html',
        // Web App (standalone web deployment)
        web: 'src/web/index.html',
      },
    },
  },
})
