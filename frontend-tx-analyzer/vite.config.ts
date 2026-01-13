import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/tx-analyzer/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    host: true,
    allowedHosts: ['exwxyzi.cn'],
    watch: {
      ignored: ['**/.pnpm-store/**', '**/node_modules/**'],
    },
    proxy: {
      '/tx-analyzer/api': {
        target: process.env.VITE_TX_ANALYZER_API_URL || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tx-analyzer\/api/, ''),
      },
    },
  },
})
