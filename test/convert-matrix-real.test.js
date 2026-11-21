// 全面回归线 D3：st/l/tt/pt 全部 12 条有向边的真实包转换矩阵。
// 每条边断言：convert() 成功、产物经 zipIo 打开后的目标结构特征、条目数 > 0。
// 另含 2 条确定性断言（同输入两次产物条目清单一致）：l→st 与 tt→pt。
//
// 真实包（data-zip/，gitignore 覆盖）存在时优先真实包；st/pt 源由前序边产物链式生成
// （l→st 产物即 st 输入，l→pt 产物即 pt 输入），同文件内用 memo 缓存复用，不落盘到 fixtures。
// 真实包缺失时 skipIf 降级到 fixtures/fixture-*.zip 合成小包，并显式注明运行模式。
//
// 只读产品代码；本文件是唯一新增的测试文件。
import { describe, expect, it, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';

// ── 源包选择（真实优先，缺失降级 fixtures） ────────────────────────────────
const L_REAL = 'data-zip/default-user-2026-08-25-172056.zip';
const TT_REAL = 'data-zip/tauritavern-data-20260825-100035.zip';
const HAS_REAL = existsSync(L_REAL) && existsSync(TT_REAL);
// fixtures/ 也被 .gitignore 覆盖（零隐私铁律）：CI checkout 必缺，缺失时兜底矩阵同样干净跳过。
const HAS_FIXTURES = existsSync(FIX.l) && existsSync(FIX.tt);

const FIX = {
  l: 'fixtures/fixture-l.zip',
  tt: 'fixtures/fixture-tt.zip',
};

const EDGE_TIMEOUT = 600_000;

// ── 运行态 ────────────────────────────────────────────────────────────────
let workDirPromise;
function getWorkDir() {
  if (!workDirPromise) workDirPromise = mkdtemp(path.join(os.tmpdir(), 'conv-matrix-real-'));
  return workDirPromise;
}

const RESULTS = [];
let runSeq = 0;
const RUN_START = Date.now();

// derive 缓存：st/pt 源由 l→st / l→pt 产物充当；edges 缓存供确定性断言复用产物清单。
function freshCache() {
  return { st: null, pt: null, edges: new Map() };
}

/** 打开 zip（zipIo），收集条目名；按目标读取用于结构断言的小条目。 */
async function readZipOverview(zipPath, target) {
  const reader = await zipIo.openReader(zipPath);
  const names = [];
  const contents = new Map();
  const shouldRead = (name) => (
    (target === TARGETS.L && name === 'manifest.json')
    || (target === TARGETS.PT
      && name.startsWith('data/_tauritavern/extension-sources/')
      && name.endsWith('.json'))
  );
  try {
    for await (const entry of reader.entries()) {
      names.push(entry.fileName);
      if (shouldRead(entry.fileName)) {
        contents.set(entry.fileName, Buffer.from(await entry.read()));
      } else if (typeof entry.skip === 'function') {
        entry.skip(); // 只读中央目录/条目名，避免搬运 1GB 级数据流
      }
    }
  } finally {
    await reader.close();
  }
  return { names, contents };
}

/** 目标专项结构断言，返回可读的断言要点摘要（写入报告）。 */
function assertTargetStructure(target, names, contents) {
  if (target === TARGETS.L) {
    expect(contents.has('manifest.json'), `${target} 目标应含 manifest.json`).toBe(true);
    const manifest = JSON.parse(contents.get('manifest.json').toString('utf8'));
    expect(manifest, 'manifest.json 应为可解析对象').toBeTruthy();
    expect(manifest.schemaVersion, 'L 目标 manifest.schemaVersion 应为 1').toBe(1);
    return 'manifest.json 存在且 JSON 可解析(schemaVersion=1)';
  }
  if (target === TARGETS.TT) {
    const du = names.filter((n) => n.startsWith('data/default-user/'));
    expect(du.length, `${target} 目标应含 data/default-user/ 前缀`).toBeGreaterThan(0);
    return `data/default-user/ 前缀 ${du.length} 条`;
  }
  if (target === TARGETS.PT) {
    // 对齐 test/convert.test.js 既有 PT 断言：TT 布局 + third-party 扩展 + extension-sources 来源记录。
    const du = names.filter((n) => n.startsWith('data/default-user/'));
    expect(du.length, `${target} 目标应含 data/default-user/ 前缀`).toBeGreaterThan(0);
    const tp = names.filter((n) => n.startsWith('data/extensions/third-party/'));
    expect(tp.length, `${target} 目标应含 data/extensions/third-party/ 布局`).toBeGreaterThan(0);
    const extSrcNames = names.filter((n) => n.startsWith('data/_tauritavern/extension-sources/') && n.endsWith('.json'));
    expect(extSrcNames.length, `${target} 目标应含扩展来源记录`).toBeGreaterThan(0);
    const rec = contents.get(extSrcNames[0]);
    expect(rec, '来源记录应可读').toBeTruthy();
    const obj = JSON.parse(rec.toString('utf8'));
    expect(obj, '来源记录应为可解析对象').toBeTruthy();
    return `data/default-user/ ${du.length} 条、third-party ${tp.length} 条、来源记录 ${extSrcNames.length} 条(首条可解析)`;
  }
  if (target === TARGETS.ST) {
    // ST 摊平用户目录特征（对应任务书「顶层 users 或 ST 目录特征」）：
    // settings/secrets 顶层文件 + characters/chats/worlds 顶层目录；且不含 manifest / data/default-user。
    const flat = names.filter((n) => n === 'settings.json' || n === 'secrets.json'
      || n.startsWith('characters/') || n.startsWith('chats/') || n.startsWith('worlds/'));
    expect(flat.length, `${target} 目标应含摊平 ST 用户目录特征`).toBeGreaterThan(0);
    expect(names.includes('manifest.json'), 'ST 目标不应含 manifest.json').toBe(false);
    expect(names.some((n) => n.startsWith('data/default-user/')), 'ST 目标不应含 data/default-user/ 前缀').toBe(false);
    return `摊平 ST 用户目录特征 ${flat.length} 条，无 manifest / data-default-user 前缀`;
  }
  throw new Error(`未知目标 ${target}`);
}

/**
 * 跑一条边：convert() → zipIo 打开产物 → 目标结构断言 → 条目数 > 0。
 * 记录逐边耗时/断言要点到 RESULTS 并打印 [MATRIX-RESULT] 行供报告转录。
 */
async function runEdge(cache, fromLabel, toLabel, fromPath, target, mode) {
  const dir = await getWorkDir();
  const out = path.join(dir, `edge-${fromLabel}-to-${toLabel}-${runSeq++}.zip`);
  const t0 = Date.now();
  let report;
  try {
    report = await convert(fromPath, out, { target, io: zipIo });
  } catch (err) {
    throw new Error(`边 ${fromLabel}→${toLabel} convert() 抛异常: ${err?.stack || err}`);
  }
  const convertMs = Date.now() - t0;
  const t1 = Date.now();
  const { names, contents } = await readZipOverview(out, target);
  const inspectMs = Date.now() - t1;
  expect(names.length, `边 ${fromLabel}→${toLabel} 产物条目数必须 > 0`).toBeGreaterThan(0);
  const detail = assertTargetStructure(target, names, contents);
  const rec = {
    edge: `${fromLabel}→${toLabel}`,
    mode,
    convertMs,
    inspectMs,
    entries: names.length,
    target,
    detectedLayout: report?.toJSON?.()?.sourceLayout ?? report?.toJSON?.()?.detectedLayout ?? 'n/a',
    detail,
  };
  RESULTS.push(rec);
  cache.edges.set(rec.edge, { out, names });
  console.log('[MATRIX-RESULT] ' + JSON.stringify(rec));
  return { out, names };
}

/** st 源 = l→st 产物（memo：l→st 边的那次 convert 即产物来源）。 */
async function getStSource(cache, L, mode) {
  if (!cache.st) {
    const r = await runEdge(cache, 'l', 'st', L, TARGETS.ST, mode);
    cache.st = { path: r.out, names: r.names };
  }
  return cache.st;
}

/** pt 源 = l→pt 产物（memo：l→pt 边的那次 convert 即产物来源）。 */
async function getPtSource(cache, L, mode) {
  if (!cache.pt) {
    const r = await runEdge(cache, 'l', 'pt', L, TARGETS.PT, mode);
    cache.pt = { path: r.out, names: r.names };
  }
  return cache.pt;
}

/** 注册 12 条有向边 + 2 条确定性断言。两个 describe 共用，靠 skipIf 二选一。 */
function registerMatrix(mode, L, TT) {
  const cache = freshCache();

  // ── 先跑两条「造源」边，产出 st / pt 源供其余边链式复用 ──
  it('l→st（同时产出 st 源）', { timeout: EDGE_TIMEOUT }, async () => {
    const st = await getStSource(cache, L, mode);
    expect(existsSync(st.path)).toBe(true);
  });

  it('l→pt（同时产出 pt 源）', { timeout: EDGE_TIMEOUT }, async () => {
    const pt = await getPtSource(cache, L, mode);
    expect(existsSync(pt.path)).toBe(true);
  });

  it('l→tt', { timeout: EDGE_TIMEOUT }, async () => {
    await runEdge(cache, 'l', 'tt', L, TARGETS.TT, mode);
  });

  // ── st 源出发的三条边 ──
  it('st→l', { timeout: EDGE_TIMEOUT }, async () => {
    const st = await getStSource(cache, L, mode);
    await runEdge(cache, 'st', 'l', st.path, TARGETS.L, mode);
  });
  it('st→tt', { timeout: EDGE_TIMEOUT }, async () => {
    const st = await getStSource(cache, L, mode);
    await runEdge(cache, 'st', 'tt', st.path, TARGETS.TT, mode);
  });
  it('st→pt', { timeout: EDGE_TIMEOUT }, async () => {
    const st = await getStSource(cache, L, mode);
    await runEdge(cache, 'st', 'pt', st.path, TARGETS.PT, mode);
  });

  // ── tt 源（真实包 / fixture）出发的三条边 ──
  it('tt→st', { timeout: EDGE_TIMEOUT }, async () => {
    await runEdge(cache, 'tt', 'st', TT, TARGETS.ST, mode);
  });
  it('tt→l', { timeout: EDGE_TIMEOUT }, async () => {
    await runEdge(cache, 'tt', 'l', TT, TARGETS.L, mode);
  });
  it('tt→pt', { timeout: EDGE_TIMEOUT }, async () => {
    await runEdge(cache, 'tt', 'pt', TT, TARGETS.PT, mode);
  });

  // ── pt 源（l→pt 产物）出发的三条边 ──
  it('pt→st', { timeout: EDGE_TIMEOUT }, async () => {
    const pt = await getPtSource(cache, L, mode);
    await runEdge(cache, 'pt', 'st', pt.path, TARGETS.ST, mode);
  });
  it('pt→l', { timeout: EDGE_TIMEOUT }, async () => {
    const pt = await getPtSource(cache, L, mode);
    await runEdge(cache, 'pt', 'l', pt.path, TARGETS.L, mode);
  });
  it('pt→tt', { timeout: EDGE_TIMEOUT }, async () => {
    const pt = await getPtSource(cache, L, mode);
    await runEdge(cache, 'pt', 'tt', pt.path, TARGETS.TT, mode);
  });

  // ── 确定性断言：同输入两次产物条目清单一致 ──
  // 口径对齐 test/luker-tt-roundtrip.test.js:65（const names=[...byName.keys()].sort()）：
  // 比较**排序后的条目名清单**（集合），不是中央目录的物理写入顺序——
  // writer.addLazy 以并发窗口写盘（zip-io.js:385-401），物理顺序随流完成时序波动，
  // 但同输入两次的条目集合恒定。排序后比较既稳定又能抓条目增删回归。
  it('确定性 l→st：同输入两次产物条目清单一致', { timeout: EDGE_TIMEOUT }, async () => {
    const first = await getStSource(cache, L, mode); // 复用 l→st 边的产物清单
    const dir = await getWorkDir();
    const out2 = path.join(dir, `determinism-l-st-${runSeq++}.zip`);
    await convert(L, out2, { target: TARGETS.ST, io: zipIo });
    const second = await readZipOverview(out2, TARGETS.ST);
    const a = [...first.names].sort();
    const b = [...second.names].sort();
    expect(b, 'l→st 两次产物条目清单(排序后)应完全一致').toEqual(a);
    const rec = { edge: 'l→st×2', mode, entries: a.length, detail: '两次产物条目清单(排序后)一致' };
    RESULTS.push(rec);
    console.log('[MATRIX-RESULT] ' + JSON.stringify(rec));
  });

  it('确定性 tt→pt：同输入两次产物条目清单一致', { timeout: EDGE_TIMEOUT }, async () => {
    const first = cache.edges.get('tt→pt'); // 复用 tt→pt 边的产物清单
    expect(first, 'tt→pt 边应先于确定性断言执行').toBeTruthy();
    const dir = await getWorkDir();
    const out2 = path.join(dir, `determinism-tt-pt-${runSeq++}.zip`);
    await convert(TT, out2, { target: TARGETS.PT, io: zipIo });
    const second = await readZipOverview(out2, TARGETS.PT);
    const a = [...first.names].sort();
    const b = [...second.names].sort();
    expect(b, 'tt→pt 两次产物条目清单(排序后)应完全一致').toEqual(a);
    const rec = { edge: 'tt→pt×2', mode, entries: a.length, detail: '两次产物条目清单(排序后)一致' };
    RESULTS.push(rec);
    console.log('[MATRIX-RESULT] ' + JSON.stringify(rec));
  });
}

// 真实包存在 → 跑真实矩阵；缺失 → skipIf 降级 fixture 矩阵（注明 mode）。
describe.skipIf(!HAS_REAL)('真实包 12 边转换矩阵（data-zip/）', () => {
  registerMatrix('real', L_REAL, TT_REAL);
});

describe.skipIf(HAS_REAL || !HAS_FIXTURES)('fixture 兜底 12 边转换矩阵（真实包缺失，合成小包降级）', () => {
  registerMatrix('fixture', FIX.l, FIX.tt);
});

afterAll(() => {
  console.log('[MATRIX-SUMMARY] mode=' + (HAS_REAL ? 'real' : 'fixture')
    + ' totalMs=' + (Date.now() - RUN_START)
    + ' results=' + JSON.stringify(RESULTS.map((r) => ({ edge: r.edge, ms: r.convertMs ?? null, entries: r.entries }))));
});
