#!/usr/bin/env node
/**
 * 文档站死链校验：扫描构建产物目录（默认 dist/docs，可显式传参）内全部 .html 的站内链接，
 * 目标文件不存在即 exit 1。
 *
 * 支持两种链接形态（2026-11-22 红队修复：v0.7.0 线上站内导航全 404 即死链未拦）：
 * 1. 相对 .html：按当前 html 所在目录解析；
 * 2. 绝对 /ST-pack-transfer/...：站点根 = Pages 产物根（URL /ST-pack-transfer/X ↔ 产物根/X），
 *    文档子站链接 /ST-pack-transfer/docs/X ↔ dist/docs/X（即扫描根本身）。
 *
 * 跳过：外部协议（http/mailto/tel/javascript/data/blob 等）、协议相对 //host、纯锚点、空链接。
 * 显式传入目录但没有 .html 判失败（构建产物不可能无 html）；本地未构建时回退 docs/ 源目录，
 * 若源目录也没有 .html 则提示跳过（防本地误用假失败；CI 里 dist/docs 必然存在，真检查）。
 * 锚点只校验文件存在性，不校验锚点 id；查询串与百分号编码在解析时剥离 / 还原。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const REPO_PREFIX = '/ST-pack-transfer';
const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const HREF_RE = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

const explicitDir = process.argv[2];
let scanRoot = resolve(explicitDir || 'dist/docs');
if (!existsSync(scanRoot)) {
  const fallback = resolve('docs');
  if (explicitDir || !existsSync(fallback)) {
    console.error(`死链校验失败：扫描目录不存在：${scanRoot}`);
    process.exit(1);
  }
  console.log(`未找到 ${scanRoot}，回退扫描 docs/ 源目录（本地未构建场景）`);
  scanRoot = fallback;
}

function rel(abs) {
  return relative(process.cwd(), abs) || abs;
}

function collectHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Jekyll 约定：_layouts / _includes 等 _ 开头目录是源模板，不进产物（2026-11-22 实测修正）。
      if (entry.name.startsWith('_')) continue;
      out.push(...collectHtml(full));
    } else if (/\.html?$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/** 链接 → { base, path }；无法解析的站内形态返回 null（调用方跳过）。 */
function resolveLink(link, htmlFile) {
  let p = link.split('#')[0].split('?')[0].trim();
  if (!p) return null;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* 百分号序列不合法时按原样检查 */
  }
  if (p.startsWith(REPO_PREFIX)) {
    const rest = p.slice(REPO_PREFIX.length); // '/docs/faq.html' | '/' | '/index.html' | ...
    if (rest === '' || rest === '/') return { base: join(scanRoot, '..'), path: '' }; // 站点根
    if (rest.startsWith('/docs/')) return { base: scanRoot, path: rest.slice(6) };   // 文档子站 → 扫描根
    return { base: join(scanRoot, '..'), path: rest.slice(1) };                       // 其余 → 站点根
  }
  if (p.startsWith('/')) return { base: join(scanRoot, '..'), path: p.slice(1) };     // 其它站点绝对路径
  return { base: dirname(htmlFile), path: p };                                        // 相对链接
}

function targetExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

const htmlFiles = collectHtml(scanRoot);
if (htmlFiles.length === 0) {
  if (explicitDir) {
    console.error(`死链校验失败：${scanRoot} 中没有任何 .html 文件（构建产物异常）`);
    process.exit(1);
  }
  console.log('扫描目录中没有 .html 文件，跳过死链校验');
  process.exit(0);
}

const dead = [];
let checked = 0;
for (const htmlFile of htmlFiles) {
  let text = '';
  try {
    text = readFileSync(htmlFile, 'utf8');
  } catch (error) {
    dead.push(`${rel(htmlFile)} → 文件读取失败：${error.message}`);
    continue;
  }
  for (const m of text.matchAll(HREF_RE)) {
    const raw = (m[1] ?? m[2] ?? '').trim();
    if (!raw || raw.startsWith('#')) continue; // 空 href 与纯锚点
    if (EXTERNAL_RE.test(raw)) continue;       // 外部协议与协议相对链接
    const target = resolveLink(raw, htmlFile);
    if (!target) continue;
    checked += 1;
    if (targetExists(join(target.base, target.path))) continue;
    dead.push(`${rel(htmlFile)} → ${raw}`);
  }
}

if (dead.length) {
  console.error(`死链校验失败：${dead.length} 处站内链接目标不存在（检查 ${htmlFiles.length} 个 html / ${checked} 个站内链接）：`);
  for (const item of dead) console.error(`  - ${item}`);
  console.error('修复源 md 链接后重新构建；或确认 sed 前缀改写与产物结构一致。');
  process.exit(1);
}
console.log(`死链校验通过：${htmlFiles.length} 个 html，${checked} 个站内链接全部可达。`);
