// Vite 配置用于前端开发与构建。
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 前端版本号 = package.json 版本 + git 短哈希：随日志上报，线上报错可定位到具体构建
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const gitShort = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();
const APP_VERSION = `${pkg.version}+${gitShort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      // 小说流水线产物（图片/视频片段/成片）走后端静态目录。
      '/uploads': 'http://localhost:3000'
    }
  },
  build: {
    rollupOptions: {
      output: {
        // antd/rc 生态拆为独立 vendor 包：业务代码迭代时 vendor 命中浏览器缓存
        manualChunks: {
          'antd-vendor': ['antd', '@ant-design/icons'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
});
