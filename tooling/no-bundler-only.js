/**
 * 宿主直装守卫（No Bundler-Only Guard）
 *
 * 背景（2026-11-11 真实事故）：`workbench-view.js` 曾写 `import data from '../data/demo-extensions.json'`。
 * Vite 开发 / 打包都会替你转换 JSON，所以独立态一切正常；但插件在酒馆里是 **git clone 直装、不经打包器**，
 * 浏览器无法实例化 JSON 模块，整张依赖图失败，宿主只报一句
 * `Failed to fetch dynamically imported module`，插件再也加载不出来。
 *
 * 本守卫把「只能在打包器里成立」的写法挡在仓库外：
 *   1. 相对路径的 `.json` 静态导入（除非同一语句带 `with { type: 'json' }` 导入属性）；
 *   2. 静态导入 `node:*` 内置模块；
 *   3. 静态导入裸包名（`@zip.js/zip.js` 之类）——宿主不会解析 node_modules；
 *   4. Vite 专有查询后缀（`?raw` / `?url` / `?inline` / `?worker`）；
 *   5. `import.meta.env` / `import.meta.glob`。
 *
 * **刻意放行**：函数体内 `await import('node:fs/promises')` 这类**动态**导入——浏览器只在真正执行时
 * 才会失败，而现有代码只在 Node 测试路径（字符串文件源）走进去，属于有意的双态降级。
 *
 * **已知盲区（如实记录）**：模板字符串拼出来的动态导入、`import.meta.resolve`、注释里提到的写法
 * 都不做判定；本守卫只做静态字面量导入。
 *
 * 退出码：0 = 通过；1 = 存在违规。
 *
 * 用法：`npm run check:no-bundler-only`
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 标记每个字符是否落在**字符串 / 模板字符串 / 注释**里（含引号本身）。
 * 判定必须在“代码区”做：否则帮助文案里的 `import ... from 'node:fs'` 示例会被误报。
 * @param {string} code
 * @returns {Uint8Array} 1 = 在字面量/注释内
 */
function literalMap(code) {
  const inside = new Uint8Array(code.length);
  const n = code.length;
  const mark = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) inside[k] = 1;
  };
  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === quote) { j += 1; break; }
        j += 1;
      }
      mark(i, j);
      i = j;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      let j = i;
      while (j < n && code[j] !== '\n') j += 1;
      mark(i, j);
      i = j;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const j = end === -1 ? n : end + 2;
      mark(i, j);
      i = j;
      continue;
    }
    i += 1;
  }
  return inside;
}

function lineOf(code, index) {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i += 1) if (code[i] === '\n') line += 1;
  return line;
}

const IMPORT_RE = /\bimport\s+(?:[^;'"]*?\s+from\s+)?(['"])([^'"]+)\1/g;
const EXPORT_FROM_RE = /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+(['"])([^'"]+)\1/g;

function classify(spec, statement) {
  if (spec.startsWith('node:')) return '静态导入 node 内置模块：浏览器不解析 `node:`，插件会整图加载失败';
  if (/\?(raw|url|inline|worker|init|config)\b/.test(spec)) return 'Vite 专有查询后缀：宿主直装时按普通 URL 请求，拿不到期望内容';
  if (/^[./]/.test(spec)) {
    if (/\.json$/i.test(spec) && !/with\s*\{[^}]*type\s*:\s*['"]json['"]/.test(statement)) {
      return '静态导入 JSON 模块：宿主直装（无打包器）会整图实例化失败；请改成 ESM 数据模块，或显式加 `with { type: \'json\' }`';
    }
    return null;
  }
  if (/^(https?:|data:|blob:)/.test(spec)) return null;
  return '裸包名导入：浏览器不会解析 node_modules；请使用 `src/vendor/` 本地副本或相对路径';
}

/**
 * 检查一段源码。
 * @param {string} code
 * @param {string} [file]
 * @returns {Array<{line:number,spec:string,reason:string}>}
 */
export function checkBundlerOnly(code, file = '<inline>') {
  const inside = literalMap(code);
  const violations = [];
  const scan = (re) => {
    let m;
    while ((m = re.exec(code)) !== null) {
      if (inside[m.index]) continue;
      const spec = m[2];
      const statement = code.slice(m.index, m.index + 200);
      const reason = classify(spec, statement);
      if (reason) violations.push({ line: lineOf(code, m.index), spec, reason, file });
    }
  };
  scan(IMPORT_RE);
  scan(EXPORT_FROM_RE);
  const metaRe = /\bimport\.meta\.(env|glob)\b/g;
  let m;
  while ((m = metaRe.exec(code)) !== null) {
    if (inside[m.index]) continue;
    violations.push({
      line: lineOf(code, m.index),
      spec: `import.meta.${m[1]}`,
      reason: 'Vite 专有元信息：宿主直装时不存在，运行期会抛错',
      file,
    });
  }
  return violations;
}

async function collectFiles(root) {
  const files = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir); } catch { return; }
    for (const name of entries) {
      const full = path.join(dir, name);
      const info = await stat(full);
      if (info.isDirectory()) await walk(full);
      else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(full);
    }
  }
  await walk(path.join(root, 'src'));
  try {
    const info = await stat(path.join(root, 'index.js'));
    if (info.isFile()) files.push(path.join(root, 'index.js'));
  } catch { /* 无根入口 */ }
  return files;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = await collectFiles(root);
  let failed = 0;
  for (const file of files) {
    const code = await readFile(file, 'utf8');
    const rel = path.relative(root, file).split(path.sep).join('/');
    const violations = checkBundlerOnly(code, rel);
    for (const v of violations) {
      failed += 1;
      console.error(`✗ ${v.file}:${v.line}  ${v.spec} —— ${v.reason}`);
    }
  }
  if (failed > 0) {
    console.error(`\n宿主直装检查失败：${failed} 处只能在打包器里成立的写法`);
    process.exit(1);
  }
  console.log(`宿主直装检查通过：${files.length} 个文件，无 JSON 静态导入 / node: 静态导入 / 裸包名 / Vite 专有语法`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}