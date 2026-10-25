// Vite 配置用于前端开发与构建。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      // 小说流水线产物（图片/视频片段/成片）走后端静态目录。
      '/uploads': 'http://localhost:3000'
    }
  }
});
