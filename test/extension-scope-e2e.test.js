/**
 * 端到端：同名扩展只出一条、自带插件不进产物、四目标落点正确（2026-11-12）。
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';

const tmpDirs = [];

async function tmpDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-ext-scope-'));
  tmpDirs.push(dir);
  return dir;
}

async function zipFrom(entries, name = 'in.zip') {
  const outPath = path.join(await tmpDir(), name);
  const writer = await zipIo.createWriter(outPath);
  for (const [entryName, data] of entries) await writer.add(entryName, data);
  await writer.close();
  return outPath;
}

async function readNames(outPath) {
  const reader = await zipIo.openReader(outPath);
  const names = [];
  try {
    for await (const entry of reader.entries()) names.push(entry.fileName);
  } finally {
    await reader.close();
  }
  return names;
}

const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
const MANIFEST = { name: 'dup', manifest_version: 1, js: 'index.js' };

/** 一份同时含「用户级 + 全局 + 自带」的 ST 布局源包。 */
const SOURCE_ENTRIES = [
  ['characters/stub.png', new Uint8Array([1, 2, 3])],
  // 用户级
  ['extensions/DupExt/manifest.json', enc(MANIFEST)],
  ['extensions/DupExt/index.js', new TextEncoder().encode('// user copy')],
  // 同一扩展的全局副本（宿主真实路径）
  ['public/scripts/extensions/third-party/DupExt/manifest.json', enc(MANIFEST)],
  ['public/scripts/extensions/third-party/DupExt/index.js', new TextEncoder().encode('// global copy')],
  // 只在全局存在的扩展
  ['public/scripts/extensions/third-party/OnlyGlobal/manifest.json', enc(MANIFEST)],
  ['public/scripts/extensions/third-party/OnlyGlobal/index.js', new TextEncoder().encode('// only global')],
  // 宿主自带插件
  ['public/scripts/extensions/regex/index.js', new TextEncoder().encode('// builtin')],
];

async function run(target) {
  const source = await zipFrom(SOURCE_ENTRIES);
  const outPath = path.join(await tmpDir(), `out-${target}.zip`);
  const report = await convert(source, outPath, { target, io: zipIo });
  return { names: await readNames(outPath), report };
}

describe('四宿主扩展作用域端到端', () => {
  it('ST 目标：同名只留用户级一条，全局副本跳过，自带插件剥离', async () => {
    const { names, report } = await run(TARGETS.ST);
    const dup = names.filter((n) => n.includes('DupExt/index.js'));
    expect(dup).toEqual(['extensions/DupExt/index.js']);
    // 全局独有扩展平铺成用户级
    expect(names).toContain('extensions/OnlyGlobal/index.js');
    // 自带插件与 public 前缀一律不落盘
    expect(names.some((n) => n.includes('public/scripts/extensions/'))).toBe(false);
    expect(names.some((n) => n.includes('regex'))).toBe(false);
    const warnings = report.toJSON().warnings.join('\n');
    expect(warnings).toContain('DupExt');
    expect(warnings).toContain('regex');
  });

  it('TT 目标：保留作用域（用户级 → default-user，全局 → third-party）', async () => {
    const { names } = await run(TARGETS.TT);
    const dup = names.filter((n) => n.includes('DupExt/index.js'));
    expect(dup).toEqual(['data/default-user/extensions/DupExt/index.js']);
    expect(names).toContain('data/extensions/third-party/OnlyGlobal/index.js');
    expect(names.some((n) => n.includes('public/scripts/extensions/'))).toBe(false);
  });

  it('PT 目标：一律 third-party，且同名只一条', async () => {
    const { names } = await run(TARGETS.PT);
    const dup = names.filter((n) => n.includes('DupExt/index.js'));
    expect(dup).toEqual(['data/extensions/third-party/DupExt/index.js']);
    expect(names).toContain('data/extensions/third-party/OnlyGlobal/index.js');
    expect(names.some((n) => n.includes('public/scripts/extensions/'))).toBe(false);
  });

  it('L 目标：与 ST 同构（平铺、去重、剥离自带）', async () => {
    const { names } = await run(TARGETS.L);
    const dup = names.filter((n) => n.includes('DupExt/index.js'));
    expect(dup).toEqual(['extensions/DupExt/index.js']);
    expect(names.some((n) => n.includes('public/scripts/extensions/'))).toBe(false);
  });
});
