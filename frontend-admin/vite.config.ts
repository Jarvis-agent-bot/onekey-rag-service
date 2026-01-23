import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/admin/ui/",
  server: {
    host: true,
    port: 5174,
    allowedHosts: ['localhost', 'exwxyzi.cn'],
    watch: {
      // 忽略这些目录以减少内存占用
      ignored: ['**/.pnpm-store/**', '**/node_modules/**'],
    },
    proxy: {
      "/admin/api": {
        target: process.env.VITE_ADMIN_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true
      },
      "/api/v1": {
        target: process.env.VITE_ADMIN_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true
      }
    }
  },
});
