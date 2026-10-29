// 静态导入完整性检查：校验所有相对路径 import 的目标文件真实存在。
// 背景：GraphicPage.tsx 曾引用不存在的 ./flow-pages.css，tsc 不查 CSS/资源路径，
// 只有 vite build 才暴露——此脚本让该类错误在 check 阶段即失败。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const exts = ['', '.ts', '.tsx', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp'];

const errors = [];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
}
walk(srcDir);

const importRegex = /(?:import|export)\s+[^'"]*from\s+['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)|import\s+['"](\.[^'"]+)['"]/g;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(importRegex)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;
    const base = path.resolve(path.dirname(file), specifier);
    const exists = exts.some((ext) => {
      const target = base + ext;
      // 目录形式：目标目录下有 index.ts/tsx
      if (ext === '') {
        return fs.existsSync(target) && fs.statSync(target).isDirectory()
          ? exts.slice(1).some((e) => fs.existsSync(path.join(target, 'index' + e)))
          : fs.existsSync(target);
      }
      return fs.existsSync(target);
    });
    if (!exists) {
      errors.push(`${path.relative(root, file)}: 无法解析 "${specifier}"`);
    }
  }
}


// lazyPage 惯例检查：router 中 lazyPage(loader, 'Name') 注册的页面，
// 必须存在命名导出 Name（React.lazy 按 module[name] 取组件，default 导出会渲染崩溃）。
const routerPath = path.join(srcDir, 'router', 'index.tsx');
if (fs.existsSync(routerPath)) {
  const routerSrc = fs.readFileSync(routerPath, 'utf8');
  const lazyRegex = /lazyPage\(\s*\(\)\s*=>\s*import\('([^']+)'\)\s*,\s*'([A-Za-z0-9_]+)'\s*\)/g;
  for (const match of routerSrc.matchAll(lazyRegex)) {
    const [, moduleSpec, exportName] = match;
    const pageFile = path.resolve(path.dirname(routerPath), moduleSpec);
    const candidates = [pageFile, `${pageFile}.tsx`, `${pageFile}.ts`];
    const pageSrc = candidates.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null)).find(Boolean);
    if (pageSrc === null) {
      errors.push(`router/index.tsx: lazyPage 指向的页面不存在: ${moduleSpec}`);
      continue;
    }
    const hasNamedExport = new RegExp(`export\\s+(const|function|class)\\s+${exportName}\\b`).test(pageSrc);
    if (!hasNamedExport) {
      errors.push(
        `${path.relative(root, pageFile)}: 缺少命名导出 ${exportName}（lazyPage 按 module['${exportName}'] 取组件，default 导出会导致 Lazy element 崩溃）`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`发现 ${errors.length} 处无法解析的相对导入:`);
  for (const err of errors) console.error('  ' + err);
  process.exit(1);
}
console.log(`导入检查通过（${files.length} 个 TS/TSX 文件的相对导入全部可解析）`);
