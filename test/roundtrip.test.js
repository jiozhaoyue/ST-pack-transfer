// T2: 真实包往返完整性 —— 经中间布局转一圈,除设计内丢弃/重生成条目外,
// 全部条目名字与 CRC32 保持一致(中央目录比对,不读数据流)。
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';

// 真实包不入库(.gitignore 的 data-zip/)；缺失时 skipIf 干净跳过
const L_SOURCE = 'data-zip/default-user-2026-08-25-172056.zip';
const TT_SOURCE = 'data-zip/tauritavern-data-20260825-100035.zip';

const DERIVED = ['thumbnails/', 'backups/', 'vectors/'];
const ENGINE_DUMP = ['_engine_dump.bin', '_engine_meta.json'];

/**
 * 设计内清洗规则 —— 与 isJunkOrDevFile() 的默认行为逐条对齐（transform.js:127-199）。
 * 这些条目被转换器**有意**剔除，且报告（report.dropped）会如实列出，不属于往返丢失。
 * 注意：node_modules/** 与 .git/** 从清洗豁免后参与 CRC 校验，故不在此清单。
 */
function isDesignCleaned(name) {
  const file = name.slice(name.lastIndexOf('/') + 1);
  // 1. 系统级垃圾
  if (
    file === '.DS_Store' || file === 'Thumbs.db' || file === 'desktop.ini'
    || name.startsWith('__MACOSX/') || name.includes('/__MACOSX/') || file.endsWith('.tmp')
  ) return true;
  // 2. 开发/测试目录与工程配置（tsconfig*/vite.config*/babel.config*/webpack.config*）
  if (
    name.includes('/test/') || name.includes('/tests/')
    || name.includes('/__tests__/') || name.includes('/coverage/')
    || file.startsWith('webpack.config.') || file.startsWith('vite.config.')
    || file.startsWith('rollup.config.') || file.startsWith('tsconfig.')
    || file === 'tsconfig.json' || file === '.babelrc' || file.startsWith('babel.config.')
  ) return true;
  // 3. 源码映射与测试脚本（*.map / *.test.* / *.spec.*）
  if (
    file.endsWith('.map') || file.endsWith('.spec.js') || file.endsWith('.test.js')
    || file.endsWith('.spec.ts') || file.endsWith('.test.ts')
  ) return true;
  return false;
}

/** L 源里同名的用户级扩展存在时，extensions/third-party/<name>/ 全局副本按「用户级优先」去重跳过。 */
function isGlobalShadowed(name, userExtNames) {
  if (!name.startsWith('extensions/third-party/')) return false;
  const rest = name.slice('extensions/third-party/'.length);
  const slash = rest.indexOf('/');
  return slash > 0 && userExtNames.has(rest.slice(0, slash));
}

/** 从条目名集合收集用户级扩展名（extensions/<n>/...，排除 third-party）。 */
function userExtNamesOf(names) {
  const set = new Set();
  for (const name of names) {
    if (!name.startsWith('extensions/') || name.startsWith('extensions/third-party/')) continue;
    const rest = name.slice('extensions/'.length);
    const slash = rest.indexOf('/');
    if (slash > 0) set.add(rest.slice(0, slash));
  }
  return set;
}

async function crcMap(zipPath) {
  const reader = await zipIo.openReader(zipPath);
  const map = new Map();
  for await (const entry of reader.entries()) {
    // 目录占位条目(零字节、以 / 结尾)由文件条目隐含,转换器按设计不搬运,比对时排除
    if (entry.fileName.endsWith('/')) {
      entry.skip();
      continue;
    }
    map.set(entry.fileName, entry.crc32 ?? -1);
    entry.skip();
  }
  await reader.close();
  return map;
}

describe.skipIf(!existsSync(L_SOURCE))('真实往返 l→st→l', () => {
  it('除 manifest(重生成)与派生缓存(设计内丢弃)外,条目 CRC32 一致', { timeout: 600_000 }, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rt-l-'));
    const hub = path.join(dir, 'hub-st.zip');
    const back = path.join(dir, 'back-l.zip');
    await convert(L_SOURCE, hub, { target: TARGETS.ST, io: zipIo });
    await convert(hub, back, { target: TARGETS.L, io: zipIo });

    const [source, result] = await Promise.all([crcMap(L_SOURCE), crcMap(back)]);
    const userExtNames = userExtNamesOf(source.keys());
    const problems = [];
    for (const [name, crc] of source) {
      if (name === 'manifest.json') continue; // 目标侧按 L 格式重新合成
      if (ENGINE_DUMP.includes(name)) continue;
      if (DERIVED.some((d) => name.startsWith(d))) continue; // 设计内丢弃
      // 设计内清洗（isJunkOrDevFile）：构建配置/源码映射/测试脚本/系统垃圾，报告会列出
      if (isDesignCleaned(name)) continue;
      // 同名全局副本按「用户级优先」去重（transform.js:740），报告会点名
      if (isGlobalShadowed(name, userExtNames)) continue;
      // extensions/third-party/.gitkeep 是布局哨兵，回带时被归一为 extensions/.gitkeep
      if (name === 'extensions/third-party/.gitkeep') continue;
      if (!result.has(name)) {
        problems.push(`丢失: ${name}`);
        continue;
      }
      if (result.get(name) !== crc) {
        problems.push(`CRC 不一致: ${name}`);
      }
    }
    // 目标侧不应有源里没有的条目(除合成 manifest / _convert / 布局哨兵归一化)
    for (const name of result.keys()) {
      if (name === 'manifest.json' || name.startsWith('_convert/')) continue;
      if (name === 'extensions/.gitkeep') continue; // 由 extensions/third-party/.gitkeep 归一
      if (!source.has(name)) problems.push(`多出: ${name}`);
    }
    expect(problems.slice(0, 10), `${problems.length} 个往返问题`).toEqual([]);
  });
});

describe.skipIf(!existsSync(TT_SOURCE))('真实往返 tt→pt→tt', () => {
  it('除 TT 私有/派生(设计内丢弃)外,条目 CRC32 一致', { timeout: 600_000 }, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rt-tt-'));
    const pt = path.join(dir, 'mid-pt.zip');
    const back = path.join(dir, 'back-tt.zip');
    await convert(TT_SOURCE, pt, { target: TARGETS.PT, io: zipIo });
    await convert(pt, back, { target: TARGETS.TT, io: zipIo });

    const [source, result] = await Promise.all([crcMap(TT_SOURCE), crcMap(back)]);
    const problems = [];
    for (const [name, crc] of source) {
      const isDerived = name.startsWith('data/_cache/')
        || name.startsWith('data/_css/')
        || name.startsWith('data/_errors/')
        || name === 'data/content.log'
        || name === 'data/default-user/content.log'
        || name.startsWith('data/default-user/user/cache/')
        || name.startsWith('data/default-user/thumbnails/')
        || name.startsWith('data/default-user/backups/')
        || name.startsWith('data/default-user/vectors/');
      const isAppPrivate = name === 'data/default-user/tauritavern-settings.json'
        || name.startsWith('data/default-user/user/lan-sync/')
        || (name.startsWith('data/_tauritavern/') && !name.startsWith('data/_tauritavern/extension-sources/'));
      if (isDerived || isAppPrivate) continue; // 经 PT 一跳设计内丢失(PT 无法承载)
      // 设计内清洗（isJunkOrDevFile）：extensions/** 下 tsconfig*/vite.config*/babel.config*/.map
      // 等构建配置与测试脚本由转换器有意剔除，报告（report.dropped）会如实列出
      if (isDesignCleaned(name)) continue;
      if (!result.has(name)) {
        problems.push(`丢失: ${name}`);
        continue;
      }
      if (result.get(name) !== crc) problems.push(`CRC 不一致: ${name}`);
    }
    for (const name of result.keys()) {
      if (!source.has(name)) problems.push(`多出: ${name}`);
    }
    expect(problems.slice(0, 10), `${problems.length} 个往返问题`).toEqual([]);
  });
});
