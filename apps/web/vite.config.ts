import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const repoRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@brand': path.join(repoRoot, 'brand') },
  },
  server: {
    port: 5180,
    // Brand fonts and logos are served straight from /brand (no copies).
    fs: { allow: [repoRoot] },
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  test: { include: ['src/**/*.test.ts'] },
} as never);
