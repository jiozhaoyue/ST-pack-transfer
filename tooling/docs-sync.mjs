#!/usr/bin/env node
/**
 * 文档站同步基线校验（2026-11-17 用户要求）。
 *
 * 一条线：中文源页 → 英文译文 → 教程截图 → 基线哈希。
 * - `--verify`（默认）：缺失译文 / 源变了但译文没变 / UI 源变了但截图没重拍 / 文件与基线不一致 → 失败。
 * - `--update`：人工确认后刷新 `docs-sync.manifest.json`；**CI 只跑 verify，绝不自动 update**。
 *
 * 纯 Node、无第三方依赖。截图重拍仍由 `tooling/capture-docs-shots.cjs` 负责。
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'docs-sync.manifest.json');
const DOCS_DIR = path.join(ROOT, 'docs');
const SHOT_DIR = path.join(ROOT, 'docs', 'assets', 'shots');
const SHOT_PREFIX = 'docs/assets/shots/';

/** 每个中文用户页 ↔ 英文页。`null` 表示允许暂缓翻译。 */
const PAGE_PAIRS = Object.freeze([
  ['docs/index.md', 'docs/index.en.md'],
  ['docs/install.md', 'docs/install.en.md'],
  ['docs/formats.md', 'docs/formats.en.md'],
  ['docs/convert.md', 'docs/convert.en.md'],
  ['docs/host-pull.md', 'docs/host-pull.en.md'],
  ['docs/restore.md', 'docs/restore.en.md'],
  ['docs/extensions.md', 'docs/extensions.en.md'],
  ['docs/transfer.md', 'docs/transfer.en.md'],
  ['docs/storage.md', 'docs/storage.en.md'],
  ['docs/engines.md', 'docs/engines.en.md'],
  ['docs/privacy.md', 'docs/privacy.en.md'],
  ['docs/tutorial.md', 'docs/tutorial.en.md'],
  ['docs/faq.md', 'docs/faq.en.md'],
  ['docs/testing.md', 'docs/testing.en.md'],
  ['docs/queue-and-logs.md', 'docs/queue-and-logs.en.md'],
  ['docs/DEVELOPER-GUIDE.md', null],
]);

/** 截图派生自这些 UI 源；任一变化且截图哈希未变 → 视为未重拍。 */
const SHOT_SOURCES = Object.freeze([
  'src/ui/workbench-template.js',
  'src/ui/workbench-view.js',
  'style.css',
  'tooling/capture-docs-shots.cjs',
]);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readBytes(relPath) {
  return readFile(path.join(ROOT, relPath));
}

/** 文本按 LF 归一化，二进制保持原样：本地 CRLF 与 CI LF 必须得到同一哈希。 */
function normalizeBytes(relPath, bytes) {
  if (/\.(md|html|css|js|mjs|json|ya?ml|txt)$/i.test(relPath)) {
    return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  }
  return bytes;
}

async function hashFile(relPath) {
  try {
    return sha256(normalizeBytes(relPath, await readBytes(relPath)));
  } catch {
    return null;
  }
}

async function hashMany(relPaths) {
  const hash = createHash('sha256');
  for (const relPath of relPaths) {
    const bytes = await readBytes(relPath).catch(() => Buffer.from(''));
    hash.update(relPath);
    hash.update('\0');
    hash.update(normalizeBytes(relPath, bytes));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function listDocsFiles() {
  const out = [];
  const walk = async (dir, prefix) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = `${prefix}/${entry.name}`.replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (entry.name === '_site') continue;
        await walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  await walk(DOCS_DIR, 'docs');
  return out.sort();
}

function extractShotRefs(markdown) {
  const refs = new Set();
  for (const match of markdown.matchAll(/!\[[^\]]*\]\((assets\/shots\/[^)\s]+)\)/g)) {
    refs.add(`${SHOT_PREFIX}${match[1].slice('assets/shots/'.length)}`);
  }
  /* 配图按 <figure><img src="assets/shots/..."> 书写，同样计为引用。 */
  for (const match of markdown.matchAll(/<img\b[^>]*\bsrc="(assets\/shots\/[^"]+)"/g)) {
    refs.add(`${SHOT_PREFIX}${match[1].slice('assets/shots/'.length)}`);
  }
  return [...refs].sort();
}

/** 截图可能出现在任意 .md 中：跟踪全部页面的 assets/shots/ 引用，而非仅 tutorial 两页。 */
async function pageShotRefs() {
  const out = {};
  const docsFiles = await listDocsFiles();
  for (const page of docsFiles.filter((rel) => rel.endsWith('.md'))) {
    const text = await readFile(path.join(ROOT, page), 'utf8').catch(() => '');
    const refs = extractShotRefs(text);
    if (refs.length) out[page] = refs;
  }
  return out;
}

async function buildManifest() {
  const files = {};
  const docsFiles = await listDocsFiles();
  for (const rel of docsFiles) {
    const hash = await hashFile(rel);
    if (hash) files[rel] = hash;
  }

  const pairs = [];
  for (const [zh, en] of PAGE_PAIRS) {
    pairs.push({
      zh,
      en,
      translation: en ? 'required' : 'pending',
      sourceHash: await hashFile(zh),
      translationHash: en ? await hashFile(en) : null,
    });
  }

  const shotFiles = {};
  try {
    const entries = await readdir(SHOT_DIR, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.png')).sort((a, b) => a.name.localeCompare(b.name))) {
      shotFiles[`${SHOT_PREFIX}${entry.name}`] = await hashFile(`${SHOT_PREFIX}${entry.name}`);
    }
  } catch {
    /* 截图目录不存在时由 verify 报缺失 */
  }

  return {
    version: 1,
    files,
    pairs,
    screenshots: {
      sources: [...SHOT_SOURCES],
      sourcesHash: await hashMany(SHOT_SOURCES),
      pages: await pageShotRefs(),
      files: shotFiles,
    },
  };
}

async function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function verify() {
  const manifest = await readManifest();
  if (!manifest) {
    console.error('docs:verify 失败：缺少 docs-sync.manifest.json（先运行 npm run docs:update）');
    process.exit(1);
  }

  const problems = [];

  /* 1. 中英配对：源变了但译文没变 → 失败。 */
  for (const pair of manifest.pairs || []) {
    if (!existsSync(path.join(ROOT, pair.zh))) {
      problems.push(`缺失中文源页：${pair.zh}`);
      continue;
    }
    const sourceHash = await hashFile(pair.zh);
    if (!pair.en) {
      if (pair.translation !== 'pending') problems.push(`${pair.zh} 标记为暂缓翻译，但 translation 不是 pending`);
      continue;
    }
    if (!existsSync(path.join(ROOT, pair.en))) {
      problems.push(`缺失英文译文：${pair.en}`);
      continue;
    }
    const translationHash = await hashFile(pair.en);
    if (sourceHash !== pair.sourceHash && translationHash === pair.translationHash) {
      problems.push(`源页已更新但英文译文未更新：${pair.zh} → ${pair.en}`);
    }
    if (translationHash !== pair.translationHash) {
      problems.push(`英文译文与基线不一致（请确认后运行 npm run docs:update）：${pair.en}`);
    }
  }

  /* 2. 文档文件基线：未登记的新文件 / 与基线不一致的旧文件。 */
  const docsFiles = await listDocsFiles();
  for (const rel of docsFiles) {
    if (!Object.prototype.hasOwnProperty.call(manifest.files || {}, rel)) {
      problems.push(`docs/ 出现未登记文件：${rel}`);
      continue;
    }
    if (await hashFile(rel) !== manifest.files[rel]) {
      problems.push(`文档内容与基线不一致（确认后运行 npm run docs:update）：${rel}`);
    }
  }
  for (const rel of Object.keys(manifest.files || {})) {
    if (!docsFiles.includes(rel)) problems.push(`基线中的文件已删除：${rel}`);
  }

  /* 3. 截图：UI 源变了但截图没重拍；页面引用的截图必须存在且已登记。 */
  const currentSourcesHash = await hashMany(manifest.screenshots?.sources || SHOT_SOURCES);
  const currentShotRefs = await pageShotRefs();
  const shotFiles = manifest.screenshots?.files || {};
  if (currentSourcesHash !== manifest.screenshots?.sourcesHash) {
    const changed = [];
    for (const [rel, hash] of Object.entries(shotFiles)) {
      if (await hashFile(rel) !== hash) changed.push(rel);
    }
    if (changed.length === 0) {
      problems.push('UI 源已变化，但教程截图没有重拍（npm run docs:shots）');
    }
  }

  const referenced = new Set();
  for (const [page, refs] of Object.entries(currentShotRefs)) {
    for (const ref of refs) {
      referenced.add(ref);
      if (!existsSync(path.join(ROOT, ref))) problems.push(`页面引用的截图不存在：${page} → ${ref}`);
      if (!Object.prototype.hasOwnProperty.call(shotFiles, ref)) problems.push(`截图未登记到基线：${ref}`);
    }
  }
  for (const rel of Object.keys(shotFiles)) {
    if (!referenced.has(rel)) problems.push(`截图未被任何页面引用：${rel}`);
  }

  if (problems.length) {
    console.error(`docs:verify 失败（${problems.length} 项）：`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('确认改动完整后，运行 npm run docs:update 刷新基线；CI 不会自动更新。');
    process.exit(1);
  }
  console.log(`docs:verify 通过：${manifest.pairs.length} 组中英配对，${Object.keys(shotFiles).length} 张截图，${docsFiles.length} 个文档文件。`);
}

async function update() {
  const manifest = await buildManifest();
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`docs:update 已写入 docs-sync.manifest.json：${manifest.pairs.length} 组配对，${Object.keys(manifest.screenshots.files).length} 张截图。`);
}

const arg = process.argv[2] || '--verify';
if (arg === '--update') await update();
else if (arg === '--verify' || arg === '') await verify();
else {
  console.error(`未知参数：${arg}（只支持 --verify / --update）`);
  process.exit(2);
}
