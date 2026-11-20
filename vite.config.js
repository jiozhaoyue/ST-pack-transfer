import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = 'dev';
let changelog = [];
let tagMap = {};
try {
  const cwd = new URL('.', import.meta.url);
  commit = execSync('git rev-parse --short HEAD', { cwd }).toString().trim() || commit;
  // 完整提交日志（最早 → 最新）；构建期注入，standalone 不依赖网络。
  changelog = execSync('git log --reverse --pretty=format:"%h|%ad|%s" --date=short', { cwd })
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // 发布 tag → 提交映射：更新日志高亮发版提交（轻量 / 附注 tag 都兼容）。
  const tags = execSync('git for-each-ref --format="%(objectname) %(*objectname) %(refname:short)" refs/tags', { cwd })
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of tags) {
    const [object, peeled, name] = line.split(/\s+/);
    if (!name || !/^v?\d+\.\d+\.\d+/.test(name)) continue;
    const sha = String(peeled || object || '').slice(0, 7);
    if (!sha) continue;
    (tagMap[sha] ||= []).push(name);
  }
} catch { /* 非 git 环境：保留发布提交回退与发布摘要 */ }

/* 本地服务唯一端口：dev / preview 共用；改这里或设置环境变量 PORT 即可。
   L0-16：5173 是 Vite 默认端口，禁止占用（env-sync 桌面应用的 Tauri devUrl 就是它）。 */
const LOCAL_PORT = Number(process.env.PORT) || 3040;

export default defineConfig({
  base: './',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_CHANGELOG__: JSON.stringify(changelog),
    __APP_TAGS__: JSON.stringify(tagMap),
  },
  worker: {
    format: 'es',
  },
  // 端口显式声明 + strictPort（L0-16：禁止占用出厂/通用默认端口）。
  // dev 与 preview 共用 LOCAL_PORT：同一时间只跑一个本地服务，绝不再开第二端口。
  server: {
    port: LOCAL_PORT,
    strictPort: true,
  },
  preview: {
    port: LOCAL_PORT,
    strictPort: true,
  },
});
