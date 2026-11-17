// D1/D3 契约修复回归测试（2026-11-17）。
// D3: TT 源 tauritavern-settings.json 在 l/st/pt 目标落到 _compat/tt/ 沙箱，TT 目标行为不变。
// D1: L→TT 同名扩展去重的全局副本跳过必须产生可读警告与汇总条数，去重语义不变。
// 运行：npx vitest run test/luker-tt-contract-fixes.test.js
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';
import { lEntries, ttEntries } from '../fixtures/gen.js';

let tmpRoot;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'luker-tt-fixes-'));
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function zipFrom(entries) {
  const outPath = path.join(tmpRoot, `src-${Math.random().toString(36).slice(2)}.zip`);
  const writer = await zipIo.createWriter(outPath);
  for (const [name, data] of entries) {
    await writer.add(name, data);
  }
  await writer.close();
  return outPath;
}

async function readZipMap(outPath) {
  const reader = await zipIo.openReader(outPath);
  const map = new Map();
  for await (const entry of reader.entries()) {
    map.set(entry.fileName, Buffer.from(await entry.read()));
  }
  await reader.close();
  return map;
}

async function runConvert(entries, target, options = {}) {
  const source = await zipFrom(entries);
  const outPath = path.join(tmpRoot, `out-${target}-${Math.random().toString(36).slice(2)}.zip`);
  const report = await convert(source, outPath, { target, io: zipIo, ...options });
  return { report, outPath, files: await readZipMap(outPath), json: report.toJSON() };
}

const TT_SETTINGS = Buffer.from('{"lanSync":true,"ttOnlyMarker":"keep-me"}', 'utf8');
const ttWithSettings = () => [
  ...ttEntries(),
  ['data/default-user/tauritavern-settings.json', TT_SETTINGS],
];

describe('D3：TT 应用私有设置跨宿主落 _compat/tt/ 沙箱', () => {
  it('TT→L：默认（无 keepAll）写出 _compat/tt/tauritavern-settings.json，内容与源一致', async () => {
    const { files, json } = await runConvert(ttWithSettings(), TARGETS.L);

    expect(files.has('_compat/tt/tauritavern-settings.json')).toBe(true);
    expect(Buffer.compare(files.get('_compat/tt/tauritavern-settings.json'), TT_SETTINGS)).toBe(0);
    // 不再写 hub 根，也不再计入丢弃
    expect(files.has('tauritavern-settings.json')).toBe(false);
    expect(json.dropped.map((d) => d.path)).not.toContain('tauritavern-settings.json');
  });

  it('TT→ST：同样落 _compat/tt/ 沙箱', async () => {
    const { files } = await runConvert(ttWithSettings(), TARGETS.ST);
    expect(files.has('_compat/tt/tauritavern-settings.json')).toBe(true);
    expect(Buffer.compare(files.get('_compat/tt/tauritavern-settings.json'), TT_SETTINGS)).toBe(0);
  });

  it('TT→PT：沙箱位于 PT 的 data/default-user 根下', async () => {
    const { files } = await runConvert(ttWithSettings(), TARGETS.PT);
    expect(files.has('data/default-user/_compat/tt/tauritavern-settings.json')).toBe(true);
    expect(Buffer.compare(files.get('data/default-user/_compat/tt/tauritavern-settings.json'), TT_SETTINGS)).toBe(0);
  });

  it('TT→TT：行为不变，原位保留在 data/default-user/ 下', async () => {
    const { files } = await runConvert(ttWithSettings(), TARGETS.TT);
    expect(files.has('data/default-user/tauritavern-settings.json')).toBe(true);
    expect(Buffer.compare(files.get('data/default-user/tauritavern-settings.json'), TT_SETTINGS)).toBe(0);
  });

  it('TT→L→TT：沙箱条目可被拆包还原，内容仍与源一致', async () => {
    const mid = await runConvert(ttWithSettings(), TARGETS.L);
    const back = await runConvert([...lEntries(), ...[...mid.files.entries()]
      .filter(([name]) => name.startsWith('_compat/'))
      .map(([name, data]) => [name, data])], TARGETS.TT);

    expect(back.files.has('data/default-user/tauritavern-settings.json')).toBe(true);
    expect(Buffer.compare(back.files.get('data/default-user/tauritavern-settings.json'), TT_SETTINGS)).toBe(0);
  });
});

describe('D1：同名扩展全局副本跳过升级为显式警告', () => {
  const dupUser = [
    ['extensions/dupe/manifest.json', Buffer.from(JSON.stringify({
      display_name: 'User Dupe', js: 'index.js', homePage: 'https://github.com/example/user-dupe',
    }), 'utf8')],
    ['extensions/dupe/index.js', Buffer.from('// user dupe', 'utf8')],
  ];
  const dupGlobal = [
    ['public/scripts/extensions/third-party/dupe/manifest.json', Buffer.from(JSON.stringify({
      display_name: 'Global Dupe', js: 'index.js', homePage: 'https://github.com/example/global-dupe',
    }), 'utf8')],
    ['public/scripts/extensions/third-party/dupe/index.js', Buffer.from('// global dupe', 'utf8')],
  ];

  it('L→TT：产物只保留用户级副本，报告含逐扩展警告与跳过条数（语义不变）', async () => {
    const { files, json } = await runConvert([...lEntries(), ...dupUser, ...dupGlobal], TARGETS.TT);

    // 去重语义：用户级优先，全局副本不写
    expect(files.has('data/default-user/extensions/dupe/manifest.json')).toBe(true);
    expect(files.has('data/default-user/extensions/dupe/index.js')).toBe(true);
    expect(JSON.parse(files.get('data/default-user/extensions/dupe/manifest.json').toString('utf8')).display_name).toBe('User Dupe');
    expect(files.has('data/extensions/third-party/dupe/manifest.json')).toBe(false);
    expect(files.has('data/extensions/third-party/dupe/index.js')).toBe(false);

    // 显式警告走既有 Report#warnings 通道，UI 数据（toJSON）可读
    const warnings = json.warnings.join('\n');
    expect(warnings).toContain('同名扩展 "dupe" 的全局副本已跳过（用户级优先）');
    expect(warnings).toMatch(/共 1 个扩展、2 个源条目未写入产物/u);
    expect(json.totals.warnings).toBeGreaterThanOrEqual(1);

    // 被跳过的全局副本仍在 dropped 清单中逐条列明（报告用 hub 路径）
    const droppedPaths = json.dropped.map((d) => d.path);
    expect(droppedPaths).toContain('extensions/dupe/manifest.json');
    expect(droppedPaths).toContain('extensions/dupe/index.js');
  });

  it('多组同名扩展：警告逐一点名并按扩展数/条目数汇总', async () => {
    const secondUser = dupUser.map(([name, data]) => [name.replace('dupe', 'other'), data]);
    const secondGlobal = dupGlobal.map(([name, data]) => [name.replace('dupe', 'other'), data]);
    const { json } = await runConvert([...lEntries(), ...dupUser, ...dupGlobal, ...secondUser, ...secondGlobal], TARGETS.TT);
    const warnings = json.warnings.join('\n');

    expect(warnings).toContain('同名扩展 "dupe" 的全局副本已跳过（用户级优先）');
    expect(warnings).toContain('同名扩展 "other" 的全局副本已跳过（用户级优先）');
    expect(warnings).toMatch(/共 2 个扩展、4 个源条目未写入产物/u);
  });
});
