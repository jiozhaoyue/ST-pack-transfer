'use strict';

/**
 * Luker ↔ TauriTavern 往返保真 E2E（最高价值路径）。
 *
 * 运行：node tooling/e2e-flows/luker-tt-roundtrip.cjs
 * 快速模式（跳过 586MB/77MB 真实样本，只跑固定夹具）：LUKER_TT_SKIP_REAL=1 node ...
 *
 * 对每个输入执行：detect → convert 到对端 → detect → convert 回来 → 独立校验：
 *   a) 产物是合法 zip（能枚举中央目录）且条目数 > 0；
 *   b) 关键条目存在（角色 / 聊天 / 世界书 / 设置 / secrets / 扩展，按 hub 语义判定）；
 *   c) 往返前后条目集合对比，逐条列出新增 / 丢失 / 改名；
 *   d) 聊天消息数、角色数、世界书条目数往返后不减少；
 *   e) 同一输入连转两次，对端产物文件清单一致（确定性）。
 *
 * 本脚本是只读审计工具：不改产品代码、不改 fixtures、不装依赖、不启动宿主实例。
 * 只用 Node 内置模块 + 仓内 ESM 核心（经动态 import 加载）；路径全部从 __dirname 推导。
 * 任何校验失败 → 退出码 1，并在结果 JSON 里保留证据，绝不伪造通过。
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '../..');
const RESULT_ROOT = path.join(ROOT, 'test-results', 'e2e-flows');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.join(RESULT_ROOT, `luker-tt-${stamp}`);

const now = () => performance.now();
const round = (n) => Math.round(n * 100) / 100;
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const load = (relPath) => import(pathToFileURL(path.join(ROOT, relPath)).href);

let convert;
let detectLayout;
let zipIo;

async function init() {
  ({ convert } = await load('src/core/transform.js'));
  ({ detectLayout } = await load('src/core/detect.js'));
  ({ zipIo } = await load('src/core/zip-io.js'));
}

// ---------- hub 语义归一化：消除 L(摊平) / TT(data/default-user) 前缀差异 ----------
function toHub(name) {
  let p = String(name).replace(/\\/g, '/');
  if (p.startsWith('data/default-user/')) return p.slice('data/default-user/'.length);
  if (p.startsWith('data/extensions/third-party/')) return `extensions/${p.slice('data/extensions/third-party/'.length)}`;
  // L 布局的全局扩展也归一为用户级 extensions/<名>：转换器把两种作用域都平铺到该路径。
  if (p.startsWith('extensions/third-party/')) return `extensions/${p.slice('extensions/third-party/'.length)}`;
  return p;
}

const RE_CHAR = /(?:^|\/)characters\/[^/]+\.(?:png|webp|jpe?g|gif|json)$/i;
const RE_CHAT = /(?:^|\/)chats\/.*\.jsonl$/i;
const RE_WORLD = /(?:^|\/)worlds\/[^/]+\.json$/i;

/** 预期被设计丢弃/重合成的噪声条目（不算数据丢失）。 */
const RE_NOISE = new RegExp([
  '(?:^|/)(?:thumbnails|vectors|backups|_cache|_css|_errors|_convert|__MACOSX|node_modules)(?:/|$)',
  '(?:^|/)content\\.log(?:\\.\\d+)?$',
  '(?:^|/)tauritavern-settings\\.json$',
  '(?:^|/)_compat/',
  '(?:^|/)manifest\\.json$',
  '(?:^|/)extensions-index\\.json$',
  '(?:^|/)_engine_(?:dump\\.bin|meta\\.json)$',
  'extension-sources/',
  '(?:^|/)(?:\\.DS_Store|Thumbs\\.db|desktop\\.ini)$',
  '\\.tmp$',
  '(?:^|/)(?:test|tests|__tests__|coverage)/',
  '(?:^|/)(?:webpack|vite|rollup)\\.config\\.',
  'tsconfig\\.',
  '(?:^|/)\\.babelrc$',
  '(?:^|/)babel\\.config\\.',
  '\\.map$',
  '\\.spec\\.[cm]?[jt]sx?$',
  '\\.test\\.[cm]?[jt]sx?$',
  '\\.git/',
  '(?:^|/)\\.(?:editorconfig|gitattributes|gitignore|prettierrc|prettierignore|eslintrc|npmignore)$',
].join('|'), 'i');

function isKeyData(hub) {
  return RE_CHAR.test(hub) || RE_CHAT.test(hub) || RE_WORLD.test(hub)
    || hub === 'settings.json' || hub === 'secrets.json'
    || hub.startsWith('extensions/');
}

function countChatMessages(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  let n = 0;
  for (let i = 0; i < lines.length; i += 1) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj && typeof obj === 'object') {
        if ('mes' in obj || 'content' in obj || 'text' in obj) { n += 1; continue; }
        if ('user_name' in obj || 'character_name' in obj || 'create_date' in obj) continue; // 会话头
      }
    } catch { /* 非 JSON 行按下方兜底 */ }
    if (i > 0) n += 1;
  }
  return n;
}

function countWorldEntries(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  if (Array.isArray(obj.entries)) return obj.entries.length;
  if (obj.entries && typeof obj.entries === 'object') return Object.keys(obj.entries).length;
  return 0;
}

/**
 * 枚举 zip 中央目录；只对"关键数据条目"读取内容做计数，避免整包驻留。
 */
async function inspectZip(zipPath) {
  const reader = await zipIo.openReader(zipPath);
  const byName = new Map();
  const extDirs = new Set();
  const counts = { characters: 0, chats: 0, messages: 0, worlds: 0, worldEntries: 0 };
  try {
    for await (const entry of reader.entries()) {
      const hub = toHub(entry.fileName);
      if (!byName.has(hub)) byName.set(hub, entry.crc32 ?? null);
      if (hub.startsWith('extensions/')) {
        const seg = hub.split('/');
        if (seg[1]) extDirs.add(seg[1]);
      }
      if (RE_CHAR.test(hub)) counts.characters += 1;
      if (RE_CHAT.test(hub)) {
        counts.chats += 1;
        try {
          counts.messages += countChatMessages(new TextDecoder().decode(await entry.read()));
        } catch { /* 单条读失败：不抛，计数如实偏低并留给差异对比 */ }
      }
      if (RE_WORLD.test(hub)) {
        counts.worlds += 1;
        try {
          counts.worldEntries += countWorldEntries(JSON.parse(new TextDecoder().decode(await entry.read())));
        } catch { /* 同上 */ }
      }
      if (typeof entry.skip === 'function') entry.skip();
    }
  } finally {
    await reader.close();
  }
  const sorted = [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const names = sorted.map(([n]) => n);
  const crc = sorted.map(([, c]) => c);
  const set = new Set(names);
  const hasPrefix = (prefix) => [...set].some((n) => n.startsWith(prefix));
  const key = {
    manifest: set.has('manifest.json') || [...set].some((n) => n.endsWith('/manifest.json')),
    characters: [...set].some((n) => RE_CHAR.test(n)),
    chats: [...set].some((n) => RE_CHAT.test(n)),
    worlds: [...set].some((n) => RE_WORLD.test(n)),
    settings: set.has('settings.json'),
    secrets: set.has('secrets.json'),
    extensions: hasPrefix('extensions/'),
  };
  return { names, crc, counts, key, extDirs: [...extDirs].sort() };
}

function diffSets(before, after) {
  const a = new Set(before);
  const b = new Set(after);
  const lost = before.filter((n) => !b.has(n));
  const added = after.filter((n) => !a.has(n));
  const renamed = [];
  const used = new Set();
  for (const l of lost) {
    const base = l.split('/').pop();
    const hit = added.find((n) => !used.has(n) && n.split('/').pop() === base);
    if (hit) { renamed.push({ from: l, to: hit }); used.add(hit); }
  }
  // 改名（作用域平铺 / 前缀迁移）是允许的，不算丢失。
  const renamedLost = new Set(renamed.map((r) => r.from));
  const rawKeyLost = lost.filter((n) => !renamedLost.has(n) && isKeyData(n) && !RE_NOISE.test(n));
  // 同名扩展去重：扩展目录在回程包里仍存在，仅"全局副本独有文件"被设计跳过
  // （宿主加载语义：用户级优先）。如实记录，但不判为关键数据丢失。
  const dedupLost = rawKeyLost.filter((n) => {
    const m = /^extensions\/([^/]+)\//.exec(n);
    return m && after.some((x) => x.startsWith(`extensions/${m[1]}/`));
  });
  const keyLost = rawKeyLost.filter((n) => !dedupLost.includes(n));
  return {
    lost,
    added,
    renamed,
    expectedLost: lost.filter((n) => RE_NOISE.test(n)),
    keyLost,
    dedupLost,
  };
}

function eq(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function buildSamples(skipReal) {
  const samples = [
    { id: 'fixture-l', file: path.join(ROOT, 'fixtures', 'fixture-l.zip'), expect: 'l' },
    { id: 'fixture-tt', file: path.join(ROOT, 'fixtures', 'fixture-tt.zip'), expect: 'tt' },
  ];
  if (!skipReal) {
    const out = path.join(ROOT, 'out');
    for (const [id, expect] of [['real-l-to-tt', 'tt'], ['real-tt-to-l', 'l']]) {
      const file = path.join(out, `${id}.zip`);
      if (fs.existsSync(file)) {
        samples.push({ id, file, expect, note: '历史 Phase C 真实产物（非原始宿主导出）' });
      }
    }
  }
  return samples;
}

async function runFlow(sample) {
  const f = {
    id: sample.id,
    input: rel(sample.file),
    note: sample.note || '',
    errors: [],
    ok: false,
  };
  const tStart = now();
  const inBytes = fs.statSync(sample.file).size;
  const detected = await detectLayout(sample.file);
  f.detected = detected.layout;
  if (detected.layout !== sample.expect) {
    f.errors.push(`detect=${detected.layout}，期望=${sample.expect}`);
    f.elapsedMs = round(now() - tStart);
    return f;
  }
  const peer = detected.layout === 'l' ? 'tt' : 'l';
  f.peerTarget = peer;

  const mid = path.join(OUT_DIR, `${sample.id}-to-${peer}.zip`);
  const mid2 = path.join(OUT_DIR, `${sample.id}-to-${peer}-2.zip`);
  const back = path.join(OUT_DIR, `${sample.id}-roundtrip.zip`);

  const t1 = now();
  await convert(sample.file, mid, { target: peer });
  f.hop1Ms = round(now() - t1);
  const midDetect = await detectLayout(mid);
  f.midDetected = midDetect.layout;
  if (midDetect.layout !== peer) f.errors.push(`中间包 detect=${midDetect.layout}，期望=${peer}`);

  const t2 = now();
  await convert(mid, back, { target: detected.layout });
  f.hop2Ms = round(now() - t2);
  const backDetect = await detectLayout(back);
  f.backDetected = backDetect.layout;
  if (backDetect.layout !== detected.layout) f.errors.push(`回程包 detect=${backDetect.layout}，期望=${detected.layout}`);

  f.bytes = { input: inBytes, mid: fs.statSync(mid).size, back: fs.statSync(back).size };

  const before = await inspectZip(sample.file);
  const after = await inspectZip(back);
  // a) 合法 zip + 条目数 > 0（inspectZip 能枚举即合法）
  if (after.names.length === 0) f.errors.push('回程产物条目数为 0');
  f.entries = { input: before.names.length, back: after.names.length };
  f.counts = { input: before.counts, back: after.counts };
  f.keyEntries = { input: before.key, back: after.key };
  f.extDirs = { input: before.extDirs.length, back: after.extDirs.length };
  f.diff = diffSets(before.names, after.names);

  // 扩展目录不允许消失（允许内部开发文件被过滤、作用域改名）
  if (after.extDirs.length < before.extDirs.length) {
    const gone = before.extDirs.filter((d) => !after.extDirs.includes(d));
    f.errors.push(`扩展目录数减少：${before.extDirs.length} → ${after.extDirs.length}（${gone.slice(0, 5).join(', ')}）`);
  }

  // b) 关键条目存在
  for (const k of ['characters', 'chats', 'worlds', 'settings', 'secrets', 'extensions']) {
    if (!after.key[k]) f.errors.push(`回程缺关键项：${k}`);
  }
  // d) 计数不减少
  for (const k of Object.keys(before.counts)) {
    if (after.counts[k] < before.counts[k]) f.errors.push(`计数减少 ${k}：${before.counts[k]} → ${after.counts[k]}`);
  }
  // c) 关键数据不允许静默丢失
  if (f.diff.keyLost.length) f.errors.push(`关键数据丢失（${f.diff.keyLost.length}）：${f.diff.keyLost.slice(0, 5).join(', ')}`);

  // e) 确定性：同一输入连转两次，比较对端产物文件清单
  await convert(sample.file, mid2, { target: peer });
  const m1 = await inspectZip(mid);
  const m2 = await inspectZip(mid2);
  f.determinism = {
    namesEqual: eq(m1.names, m2.names),
    crcEqual: eq(m1.names, m2.names) && eq(m1.crc, m2.crc),
    namesCount: m1.names.length,
  };
  if (!f.determinism.namesEqual) f.errors.push('确定性失败：两次对端产物文件清单不一致');

  f.elapsedMs = round(now() - tStart);
  f.ok = f.errors.length === 0;
  return f;
}

async function main() {
  const startedAt = new Date().toISOString();
  const t0 = now();
  await init();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const skipReal = process.env.LUKER_TT_SKIP_REAL === '1';
  const samples = buildSamples(skipReal);

  const flows = [];
  for (const s of samples) {
    process.stdout.write(`  跑 ${s.id} ...\n`);
    try {
      flows.push(await runFlow(s));
    } catch (err) {
      flows.push({ id: s.id, input: rel(s.file), errors: [String(err && err.stack || err)], ok: false });
    }
  }

  const passed = flows.filter((f) => f.ok).length;
  const ok = flows.length >= 2 && passed === flows.length;
  const result = {
    meta: {
      tool: 'luker-tt-roundtrip',
      startedAt,
      finishedAt: new Date().toISOString(),
      root: rel(ROOT),
      skipReal,
      resultDir: rel(OUT_DIR),
    },
    summary: {
      total: flows.length,
      passed,
      failed: flows.length - passed,
      deterministic: flows.filter((f) => f.determinism && f.determinism.namesEqual).length,
      elapsedMs: round(now() - t0),
    },
    flows,
    ok,
  };
  const resultFile = path.join(OUT_DIR, 'result.json');
  fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  process.stdout.write(`[luker-tt-roundtrip] 样本=${flows.length} 跳过真实=${skipReal}\n`);
  for (const f of flows) {
    const b = f.bytes ? `${f.bytes.input}/${f.bytes.mid}/${f.bytes.back}B` : '-';
    const e = f.entries ? `${f.entries.input}/${f.entries.back}` : '-';
    process.stdout.write(
      `  ${f.id}: ${f.detected || '?'}${f.peerTarget ? `→${f.peerTarget}→${f.detected}` : ''} `
      + `${f.ok ? '通过' : '失败'} | ${b} | 条目 ${e} | ${f.elapsedMs ?? 0}ms\n`,
    );
    if (!f.ok) for (const msg of f.errors.slice(0, 3)) process.stdout.write(`    ! ${msg}\n`);
  }
  process.stdout.write(`汇总: ${passed}/${flows.length} 通过 | 确定性 ${result.summary.deterministic}/${flows.length} | ${result.summary.elapsedMs}ms\n`);
  process.stdout.write(`结果: ${rel(resultFile)}\n`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  process.stdout.write(`[luker-tt-roundtrip] 致命错误：${err && err.stack || err}\n`);
  process.exitCode = 1;
});
