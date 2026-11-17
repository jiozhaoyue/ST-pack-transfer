import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as zip from '@zip.js/zip.js';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';
import { generatePlan, ACTIONS } from '../src/core/plan-preview.js';
import { stEntries } from '../fixtures/gen.js';

/**
 * 计划预览 ↔ 真实产物 的**合成项一致性**契约（2026-11-18 新增）。
 *
 * 背景：plan-preview 的合成项预测曾与 transform 实际产出漂移——预测了产物中不存在的
 * `_convert/README-ST.txt`，而真正的 `_convert/INSTALL.md`、`_convert/meta.json`、
 * `extensions-index.json`、`_convert/extensions-manifest.json` 全都漏预测（审计 P2）。
 * 本文件把「预览说的 = 产物做的」钉成可执行契约：
 *   预测集合（action=SYNTHESIZE 的 targetPath）=== report.synthesized 实际合成集合。
 *
 * 已知豁免（如实标注，不做假绿）：
 * - PT/TT 的 `data/_tauritavern/extension-sources/**`：依赖每个扩展 manifest 的 homePage，
 *   plan-preview 扫描层拿不到该数据，**暂不预测**（代码内有注释）⇒ tt/pt 目标只断言
 *   「预测 ⊆ 实际」，方向为少报不虚报。
 * - extensions-index.json 仅在「存在可安装清单条目」时产出；夹具扩展带 https homePage，
 *   可安装 ⇒ MANIFEST 模式下两侧都应出现。
 */
vi.setConfig({ testTimeout: 30_000 });

const TMP_DIRS = [];
async function tmpDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-plan-consistency-'));
  TMP_DIRS.push(dir);
  return dir;
}

async function zipFrom(entries) {
  const dir = await tmpDir();
  const inPath = path.join(dir, 'in.zip');
  const writer = await zipIo.createWriter(inPath);
  for (const [name, data] of entries) {
    await writer.add(name, data);
  }
  await writer.close();
  return inPath;
}

async function predictedSynth(entries, target, opts = {}) {
  const source = await zipFrom(entries);
  const plan = await generatePlan(source, target, { io: zipIo, ...opts });
  return plan.synthesizedItems
    .filter((x) => x.action === ACTIONS.SYNTHESIZE)
    .map((x) => x.targetPath)
    .sort();
}

async function actualSynth(entries, target, opts = {}) {
  const dir = await tmpDir();
  const source = await zipFrom(entries);
  const outPath = path.join(dir, `out-${target}.zip`);
  const report = await convert(source, outPath, { target, io: zipIo, ...opts });
  return report.toJSON().synthesized.slice().sort();
}

describe('plan-preview 合成项预测与 transform 产物一致', () => {
  it('st + FULL：预测 = 实际（INSTALL.md/meta.json/extensions-manifest，无 index）', async () => {
    const predicted = await predictedSynth(stEntries(), TARGETS.ST, { extensionMode: 'full' });
    const actual = await actualSynth(stEntries(), TARGETS.ST, { extensionMode: 'full' });
    expect(predicted).toEqual(actual);
    expect(actual).toContain('_convert/INSTALL.md');
    expect(actual).toContain('_convert/meta.json');
    expect(actual).toContain('_convert/extensions-manifest.json');
    expect(actual).not.toContain('extensions-index.json');
  });

  it('st + MANIFEST：预测 = 实际（额外含 extensions-index.json）', async () => {
    const predicted = await predictedSynth(stEntries(), TARGETS.ST, { extensionMode: 'manifest' });
    const actual = await actualSynth(stEntries(), TARGETS.ST, { extensionMode: 'manifest' });
    expect(predicted).toEqual(actual);
    expect(actual).toContain('extensions-index.json');
    expect(actual).not.toContain('_convert/README-ST.txt');
  });

  it('l + FULL：预测 = 实际（manifest.json + extensions-manifest）', async () => {
    const predicted = await predictedSynth(stEntries(), TARGETS.L, { extensionMode: 'full' });
    const actual = await actualSynth(stEntries(), TARGETS.L, { extensionMode: 'full' });
    expect(predicted).toEqual(actual);
    expect(actual).toContain('manifest.json');
    expect(actual).toContain('_convert/extensions-manifest.json');
  });

  it('tt：预测 ⊆ 实际（extension-sources 依赖 homePage，暂不预测、只防虚报）', async () => {
    const predicted = await predictedSynth(stEntries(), TARGETS.TT, { extensionMode: 'full' });
    const actual = await actualSynth(stEntries(), TARGETS.TT, { extensionMode: 'full' });
    for (const p of predicted) {
      expect(actual).toContain(p);
    }
    // 实际确实会有 extension-sources 记录（夹具带 https homePage）——保持这条断言，
    // 一旦未来 plan-preview 能拿到 homePage 并开始预测，本用例提醒同步收紧为全等。
    expect(actual.some((p) => p.includes('extension-sources/'))).toBe(true);
  });
});
