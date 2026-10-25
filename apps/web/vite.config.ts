import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
        rewrite: (path) => path.replace(/^\/api\/health(?=\?|$)/, '/health'),
      },
    },
  },
  test: { environment: 'jsdom', include: ['test/**/*.spec.ts'] },
});
