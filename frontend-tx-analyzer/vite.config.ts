import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  base: '/tx-analyzer/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    allowedHosts: true,
    watch: {
      ignored: ['**/.pnpm-store/**', '**/node_modules/**'],
    },
    proxy: {
      '/tx-analyzer/api': {
        target: process.env.VITE_TX_ANALYZER_API_URL || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tx-analyzer\/api/, ''),
      },
      '/api': {
        target: process.env.VITE_TX_ANALYZER_API_URL || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
