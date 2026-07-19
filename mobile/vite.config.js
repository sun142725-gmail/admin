import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { resolve } from 'path'
import { existsSync } from 'fs'

const rootDir = resolve(__dirname)

// 通过环境变量指定当前 dev / build 的 MPA 项目，默认 has-doc
const viteApp = process.env.VITE_APP || 'has-doc'
const appDir = resolve(rootDir, 'src/packages', viteApp)
const appHtmlPath = resolve(appDir, 'index.html')
const outDir = resolve(rootDir, 'dist', viteApp)

// 校验应用目录是否存在
if (!existsSync(appDir)) {
  throw new Error(`[vite.config] 未找到应用目录：${appDir}，请检查 VITE_APP 环境变量是否正确。`)
}
if (!existsSync(appHtmlPath)) {
  throw new Error(`[vite.config] 应用 ${viteApp} 缺少入口文件：${appHtmlPath}`)
}

export default defineConfig({
  // 把项目根目录指向当前应用，这样 / 直接访问应用入口，无需临时 HTML 文件
  root: appDir,
  // 静态资源使用相对路径，确保 dist/<app>/index.html 能正确引用 assets
  base: './',
  // 公共静态资源仍使用仓库根目录的 public/
  publicDir: resolve(rootDir, 'public'),
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
      dts: false,
      resolvers: [VantResolver()]
    }),
    Components({
      dts: false,
      dirs: [],
      resolvers: [VantResolver()]
    })
  ],
  resolve: {
    alias: {
      '@c': resolve(rootDir, 'src'),
      '@': appDir
    }
  },
  css: {
    postcss: resolve(rootDir, 'postcss.config.js')
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5174,
    open: '/',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api/')
      }
    }
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2015',
    cssTarget: 'chrome61',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
