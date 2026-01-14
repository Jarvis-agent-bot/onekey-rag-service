import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import manifest from './src/manifest.json';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
export default defineConfig({
    base: '/',
    plugins: [
        react(),
        crx({ manifest: manifest }),
    ],
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
        hmr: {
            host: 'localhost',
            port: 5175,
        },
    },
    build: {
        rollupOptions: {
            input: {
                popup: 'src/popup/index.html',
                sidepanel: 'src/sidepanel/index.html',
                options: 'src/options/index.html',
            },
        },
    },
});
