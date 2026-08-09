// vite.config.js
import { defineConfig } from "file:///Users/sunjihong/Desktop/sunjihong/project/nest/rbac/mobile/node_modules/vite/dist/node/index.js";
import vue from "file:///Users/sunjihong/Desktop/sunjihong/project/nest/rbac/mobile/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import AutoImport from "file:///Users/sunjihong/Desktop/sunjihong/project/nest/rbac/mobile/node_modules/unplugin-auto-import/dist/vite.js";
import Components from "file:///Users/sunjihong/Desktop/sunjihong/project/nest/rbac/mobile/node_modules/unplugin-vue-components/dist/vite.js";
import { VantResolver } from "file:///Users/sunjihong/Desktop/sunjihong/project/nest/rbac/mobile/node_modules/@vant/auto-import-resolver/dist/index.js";
import { resolve } from "path";
import { existsSync } from "fs";
var __vite_injected_original_dirname = "/Users/sunjihong/Desktop/sunjihong/project/nest/rbac/mobile";
var rootDir = resolve(__vite_injected_original_dirname);
var viteApp = process.env.VITE_APP || "has-doc";
var appDir = resolve(rootDir, "src/packages", viteApp);
var appHtmlPath = resolve(appDir, "index.html");
var outDir = resolve(rootDir, "dist", viteApp);
if (!existsSync(appDir)) {
  throw new Error(`[vite.config] \u672A\u627E\u5230\u5E94\u7528\u76EE\u5F55\uFF1A${appDir}\uFF0C\u8BF7\u68C0\u67E5 VITE_APP \u73AF\u5883\u53D8\u91CF\u662F\u5426\u6B63\u786E\u3002`);
}
if (!existsSync(appHtmlPath)) {
  throw new Error(`[vite.config] \u5E94\u7528 ${viteApp} \u7F3A\u5C11\u5165\u53E3\u6587\u4EF6\uFF1A${appHtmlPath}`);
}
var vite_config_default = defineConfig({
  // 把项目根目录指向当前应用，这样 / 直接访问应用入口，无需临时 HTML 文件
  root: appDir,
  // 静态资源使用相对路径，确保 dist/<app>/index.html 能正确引用 assets
  base: "./",
  // 公共静态资源仍使用仓库根目录的 public/
  publicDir: resolve(rootDir, "public"),
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue", "vue-router", "pinia", "vue-i18n"],
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
      "@shared": resolve(rootDir, "src/shared"),
      "@": appDir
    }
  },
  css: {
    postcss: resolve(rootDir, "postcss.config.js")
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5174,
    open: "/",
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2015",
    cssTarget: "chrome61",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvc3Vuamlob25nL0Rlc2t0b3Avc3Vuamlob25nL3Byb2plY3QvbmVzdC9yYmFjL21vYmlsZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3N1bmppaG9uZy9EZXNrdG9wL3N1bmppaG9uZy9wcm9qZWN0L25lc3QvcmJhYy9tb2JpbGUvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3N1bmppaG9uZy9EZXNrdG9wL3N1bmppaG9uZy9wcm9qZWN0L25lc3QvcmJhYy9tb2JpbGUvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgQXV0b0ltcG9ydCBmcm9tICd1bnBsdWdpbi1hdXRvLWltcG9ydC92aXRlJ1xuaW1wb3J0IENvbXBvbmVudHMgZnJvbSAndW5wbHVnaW4tdnVlLWNvbXBvbmVudHMvdml0ZSdcbmltcG9ydCB7IFZhbnRSZXNvbHZlciB9IGZyb20gJ0B2YW50L2F1dG8taW1wb3J0LXJlc29sdmVyJ1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBleGlzdHNTeW5jIH0gZnJvbSAnZnMnXG5cbmNvbnN0IHJvb3REaXIgPSByZXNvbHZlKF9fZGlybmFtZSlcblxuLy8gXHU5MDFBXHU4RkM3XHU3M0FGXHU1ODgzXHU1M0Q4XHU5MUNGXHU2MzA3XHU1QjlBXHU1RjUzXHU1MjREIGRldiAvIGJ1aWxkIFx1NzY4NCBNUEEgXHU5ODc5XHU3NkVFXHVGRjBDXHU5RUQ4XHU4QkE0IGhhcy1kb2NcbmNvbnN0IHZpdGVBcHAgPSBwcm9jZXNzLmVudi5WSVRFX0FQUCB8fCAnaGFzLWRvYydcbmNvbnN0IGFwcERpciA9IHJlc29sdmUocm9vdERpciwgJ3NyYy9wYWNrYWdlcycsIHZpdGVBcHApXG5jb25zdCBhcHBIdG1sUGF0aCA9IHJlc29sdmUoYXBwRGlyLCAnaW5kZXguaHRtbCcpXG5jb25zdCBvdXREaXIgPSByZXNvbHZlKHJvb3REaXIsICdkaXN0Jywgdml0ZUFwcClcblxuLy8gXHU2ODIxXHU5QThDXHU1RTk0XHU3NTI4XHU3NkVFXHU1RjU1XHU2NjJGXHU1NDI2XHU1QjU4XHU1NzI4XG5pZiAoIWV4aXN0c1N5bmMoYXBwRGlyKSkge1xuICB0aHJvdyBuZXcgRXJyb3IoYFt2aXRlLmNvbmZpZ10gXHU2NzJBXHU2MjdFXHU1MjMwXHU1RTk0XHU3NTI4XHU3NkVFXHU1RjU1XHVGRjFBJHthcHBEaXJ9XHVGRjBDXHU4QkY3XHU2OEMwXHU2N0U1IFZJVEVfQVBQIFx1NzNBRlx1NTg4M1x1NTNEOFx1OTFDRlx1NjYyRlx1NTQyNlx1NkI2M1x1Nzg2RVx1MzAwMmApXG59XG5pZiAoIWV4aXN0c1N5bmMoYXBwSHRtbFBhdGgpKSB7XG4gIHRocm93IG5ldyBFcnJvcihgW3ZpdGUuY29uZmlnXSBcdTVFOTRcdTc1MjggJHt2aXRlQXBwfSBcdTdGM0FcdTVDMTFcdTUxNjVcdTUzRTNcdTY1ODdcdTRFRjZcdUZGMUEke2FwcEh0bWxQYXRofWApXG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIC8vIFx1NjI4QVx1OTg3OVx1NzZFRVx1NjgzOVx1NzZFRVx1NUY1NVx1NjMwN1x1NTQxMVx1NUY1M1x1NTI0RFx1NUU5NFx1NzUyOFx1RkYwQ1x1OEZEOVx1NjgzNyAvIFx1NzZGNFx1NjNBNVx1OEJCRlx1OTVFRVx1NUU5NFx1NzUyOFx1NTE2NVx1NTNFM1x1RkYwQ1x1NjVFMFx1OTcwMFx1NEUzNFx1NjVGNiBIVE1MIFx1NjU4N1x1NEVGNlxuICByb290OiBhcHBEaXIsXG4gIC8vIFx1OTc1OVx1NjAwMVx1OEQ0NFx1NkU5MFx1NEY3Rlx1NzUyOFx1NzZGOFx1NUJGOVx1OERFRlx1NUY4NFx1RkYwQ1x1Nzg2RVx1NEZERCBkaXN0LzxhcHA+L2luZGV4Lmh0bWwgXHU4MEZEXHU2QjYzXHU3ODZFXHU1RjE1XHU3NTI4IGFzc2V0c1xuICBiYXNlOiAnLi8nLFxuICAvLyBcdTUxNkNcdTUxNzFcdTk3NTlcdTYwMDFcdThENDRcdTZFOTBcdTRFQ0RcdTRGN0ZcdTc1MjhcdTRFRDNcdTVFOTNcdTY4MzlcdTc2RUVcdTVGNTVcdTc2ODQgcHVibGljL1xuICBwdWJsaWNEaXI6IHJlc29sdmUocm9vdERpciwgJ3B1YmxpYycpLFxuICBwbHVnaW5zOiBbXG4gICAgdnVlKCksXG4gICAgQXV0b0ltcG9ydCh7XG4gICAgICBpbXBvcnRzOiBbJ3Z1ZScsICd2dWUtcm91dGVyJywgJ3BpbmlhJywgJ3Z1ZS1pMThuJ10sXG4gICAgICBkdHM6IGZhbHNlLFxuICAgICAgcmVzb2x2ZXJzOiBbVmFudFJlc29sdmVyKCldXG4gICAgfSksXG4gICAgQ29tcG9uZW50cyh7XG4gICAgICBkdHM6IGZhbHNlLFxuICAgICAgZGlyczogW10sXG4gICAgICByZXNvbHZlcnM6IFtWYW50UmVzb2x2ZXIoKV1cbiAgICB9KVxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAc2hhcmVkJzogcmVzb2x2ZShyb290RGlyLCAnc3JjL3NoYXJlZCcpLFxuICAgICAgJ0AnOiBhcHBEaXJcbiAgICB9XG4gIH0sXG4gIGNzczoge1xuICAgIHBvc3Rjc3M6IHJlc29sdmUocm9vdERpciwgJ3Bvc3Rjc3MuY29uZmlnLmpzJylcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogJzAuMC4wLjAnLFxuICAgIHBvcnQ6IE51bWJlcihwcm9jZXNzLmVudi5QT1JUKSB8fCA1MTc0LFxuICAgIG9wZW46ICcvJyxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiB7XG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGhcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxuICAgIHRhcmdldDogJ2VzMjAxNScsXG4gICAgY3NzVGFyZ2V0OiAnY2hyb21lNjEnLFxuICAgIG1pbmlmeTogJ3RlcnNlcicsXG4gICAgdGVyc2VyT3B0aW9uczoge1xuICAgICAgY29tcHJlc3M6IHtcbiAgICAgICAgZHJvcF9jb25zb2xlOiB0cnVlLFxuICAgICAgICBkcm9wX2RlYnVnZ2VyOiB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFtVyxTQUFTLG9CQUFvQjtBQUNoWSxPQUFPLFNBQVM7QUFDaEIsT0FBTyxnQkFBZ0I7QUFDdkIsT0FBTyxnQkFBZ0I7QUFDdkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBTjNCLElBQU0sbUNBQW1DO0FBUXpDLElBQU0sVUFBVSxRQUFRLGdDQUFTO0FBR2pDLElBQU0sVUFBVSxRQUFRLElBQUksWUFBWTtBQUN4QyxJQUFNLFNBQVMsUUFBUSxTQUFTLGdCQUFnQixPQUFPO0FBQ3ZELElBQU0sY0FBYyxRQUFRLFFBQVEsWUFBWTtBQUNoRCxJQUFNLFNBQVMsUUFBUSxTQUFTLFFBQVEsT0FBTztBQUcvQyxJQUFJLENBQUMsV0FBVyxNQUFNLEdBQUc7QUFDdkIsUUFBTSxJQUFJLE1BQU0saUVBQXlCLE1BQU0sMEZBQXlCO0FBQzFFO0FBQ0EsSUFBSSxDQUFDLFdBQVcsV0FBVyxHQUFHO0FBQzVCLFFBQU0sSUFBSSxNQUFNLDhCQUFvQixPQUFPLDhDQUFXLFdBQVcsRUFBRTtBQUNyRTtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBO0FBQUEsRUFFMUIsTUFBTTtBQUFBO0FBQUEsRUFFTixNQUFNO0FBQUE7QUFBQSxFQUVOLFdBQVcsUUFBUSxTQUFTLFFBQVE7QUFBQSxFQUNwQyxTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUEsSUFDSixXQUFXO0FBQUEsTUFDVCxTQUFTLENBQUMsT0FBTyxjQUFjLFNBQVMsVUFBVTtBQUFBLE1BQ2xELEtBQUs7QUFBQSxNQUNMLFdBQVcsQ0FBQyxhQUFhLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsSUFDRCxXQUFXO0FBQUEsTUFDVCxLQUFLO0FBQUEsTUFDTCxNQUFNLENBQUM7QUFBQSxNQUNQLFdBQVcsQ0FBQyxhQUFhLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsV0FBVyxRQUFRLFNBQVMsWUFBWTtBQUFBLE1BQ3hDLEtBQUs7QUFBQSxJQUNQO0FBQUEsRUFDRjtBQUFBLEVBQ0EsS0FBSztBQUFBLElBQ0gsU0FBUyxRQUFRLFNBQVMsbUJBQW1CO0FBQUEsRUFDL0M7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU0sT0FBTyxRQUFRLElBQUksSUFBSSxLQUFLO0FBQUEsSUFDbEMsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsU0FBUyxDQUFDLFNBQVM7QUFBQSxNQUNyQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTDtBQUFBLElBQ0EsYUFBYTtBQUFBLElBQ2IsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsZUFBZTtBQUFBLE1BQ2pCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
