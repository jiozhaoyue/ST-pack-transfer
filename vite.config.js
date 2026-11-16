import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = 'dev';
let changelog = [];
try {
  const cwd = new URL('.', import.meta.url);
  commit = execSync('git rev-parse --short HEAD', { cwd }).toString().trim() || commit;
  // 完整提交日志（最早 → 最新）；构建期注入，standalone 不依赖网络。
  changelog = execSync('git log --reverse --pretty=format:"%h|%ad|%s" --date=short', { cwd })
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
} catch { /* 非 git 环境：保留发布提交回退与发布摘要 */ }

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_CHANGELOG__: JSON.stringify(changelog),
  },
  worker: {
    format: 'es',
  },
  // 端口显式声明 + strictPort（L0-16：禁止占用出厂/通用默认端口）。
  // 5173 是 Vite 默认端口，**不能占**——env-sync 桌面应用的 Tauri `devUrl` 就是
  // `http://localhost:5173`，占用它会使其 GUI 窗口加载到本插件页面（2026-09-25 实测事故）。
  server: {
    port: 3040,
    strictPort: true,
  },
  // 4173 已在 L0-16 登记为 Vite preview
  preview: {
    port: 4173,
    strictPort: true,
  },
});
