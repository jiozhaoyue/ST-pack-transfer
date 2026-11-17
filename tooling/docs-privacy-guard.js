/**
 * docs 隐私守卫：公开文档站只允许面向外人的说明文档。
 *
 * 用户 2026-11-17 硬性裁定：`docs/` 会被 GitHub Pages 原样部署，
 * **绝对不允许**出现当前开发计划、后续计划、交接、研究底稿等内部资料。
 * 本脚本在本地与 CI 同时拦截，防止以后再把 PLAN/handoff 放回来。
 */
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'docs');

const FORBIDDEN = [
  /^plan[\s._-]/i,
  /^.*[\s._-]plan[\s._-]?/i,
  /^handoff/i,
  /^todo/i,
  /^wip/i,
  /^research/i,
  /^tasks?$/i,
  /^\.trellis$/i,
];

const hits = [];
let entries = [];
try {
  entries = readdirSync(DOCS);
} catch (error) {
  console.error(`docs 隐私守卫无法读取 docs/：${error.message}`);
  process.exit(1);
}

for (const name of entries) {
  const full = join(DOCS, name);
  let isDir = false;
  try { isDir = statSync(full).isDirectory(); } catch { /* ignore */ }
  if (FORBIDDEN.some((re) => re.test(name))) {
    hits.push(`${isDir ? '[dir] ' : ''}docs/${name}`);
  }
}

if (hits.length) {
  console.error('docs 隐私守卫失败：公开文档站出现内部资料：');
  for (const hit of hits) console.error(`  - ${hit}`);
  console.error('请把计划/交接/研究底稿移到 .private/plans/（已在 .gitignore 忽略）。');
  process.exit(1);
}

console.log(`docs 隐私守卫通过：${entries.length} 个公开条目，无 plan/handoff/research 内部资料`);
