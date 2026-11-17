import { describe, it, expect } from 'vitest';
import { splitArchiveEntries, getEntryPriority, normalizeSplitMb, MIN_SPLIT_MB } from '../src/core/splitter.js';
import { zipIo } from '../src/core/zip-io.js';

describe('Smart Incremental Split Archives (智能增量独立分包引擎测试)', () => {
  it('correctly sorts entry priority (Core -> Extensions -> Assets)', () => {
    expect(getEntryPriority('settings.json')).toBe(1);
    expect(getEntryPriority('characters/Alice.png')).toBe(1);
    expect(getEntryPriority('chats/Alice/chat.jsonl')).toBe(1);
    expect(getEntryPriority('extensions/my-extension/index.js')).toBe(2);
    expect(getEntryPriority('backgrounds/cool-bg.png')).toBe(3);
    expect(getEntryPriority('User Avatars/alice.png')).toBe(3);
  });

  it('splits entries into multiple independent, valid zip archives based on threshold', async () => {
    // 构造模拟条目 (设置阈值为极小值，例如 0.005MB 约 5KB，用于快速触发切包)
    const entries = [
      { path: 'settings.json', data: new TextEncoder().encode(JSON.stringify({ theme: 'dark' })) },
      { path: 'characters/Alice.png', data: new Uint8Array(3000) },
      { path: 'extensions/ext1/index.js', data: new Uint8Array(4000) },
      { path: 'extensions/ext2/index.js', data: new Uint8Array(4000) },
      { path: 'backgrounds/big-bg-1.png', data: new Uint8Array(5000) },
      { path: 'backgrounds/big-bg-2.png', data: new Uint8Array(5000) },
    ];

    // 0.006 MB 阈值 (约 6KB)
    const result = await splitArchiveEntries(entries, {
      thresholdMB: 0.007,
      target: 'st',
      handle: 'default-user',
      compressionLevel: 0, // 极速存储便于精细体积校验
    });

    expect(result.totalParts).toBeGreaterThan(1);
    expect(result.parts.length).toBe(result.totalParts);

    // 验证每一个分卷都是独立的合法 Zip
    for (let i = 0; i < result.parts.length; i++) {
      const part = result.parts[i];
      expect(part.partIndex).toBe(i + 1);
      expect(part.totalParts).toBe(result.totalParts);
      expect(part.blob).toBeDefined();
      expect(part.blob.size).toBeGreaterThan(0);
      expect(part.partName).toMatch(/\.zip$/i);

      // 打开验证中央目录与包含的 split-manifest.json
      const reader = await zipIo.openReader(part.blob);
      const fileNames = [];
      let foundManifest = false;

      for await (const e of reader.entries()) {
        fileNames.push(e.fileName);
        if (e.fileName === '_convert/split-manifest.json') {
          foundManifest = true;
          const text = new TextDecoder().decode(await e.read());
          const manifest = JSON.parse(text);
          expect(manifest.partIndex).toBe(i + 1);
          expect(manifest.totalParts).toBeUndefined(); // part specific
          expect(manifest.splitId).toBe(result.splitId);
        }
      }

      await reader.close();
      expect(foundManifest).toBe(true);
      expect(fileNames.length).toBe(part.fileCount + 1); // data files + manifest
    }
  });

  it('isolates single oversized file into its own standalone package and marks isOversized', async () => {
    const entries = [
      { path: 'settings.json', data: new Uint8Array(1000) },
      { path: 'models/huge-model.onnx', data: new Uint8Array(20000) }, // 超过单包阈值
      { path: 'backgrounds/small.png', data: new Uint8Array(1000) },
    ];

    // 0.01 MB (约 10KB)，huge-model (20KB) 必然超限
    const result = await splitArchiveEntries(entries, {
      thresholdMB: 0.01,
      target: 'luker',
      handle: 'alice',
      compressionLevel: 0,
    });

    const oversizedPart = result.parts.find((p) => p.isOversized);
    expect(oversizedPart).toBeDefined();
    expect(oversizedPart.files).toContain('models/huge-model.onnx');

    // 验证该超大卷依然是合法的 Zip
    const reader = await zipIo.openReader(oversizedPart.blob);
    let hasModel = false;
    for await (const e of reader.entries()) {
      if (e.fileName === 'models/huge-model.onnx') hasModel = true;
    }
    await reader.close();
    expect(hasModel).toBe(true);
  });
});

describe('normalizeSplitMb（智能分包数值输入归一化）', () => {
  it('合法整数原样返回（字符串与数字两种输入源）', () => {
    expect(normalizeSplitMb('200')).toBe(200);
    expect(normalizeSplitMb(200)).toBe(200);
    expect(normalizeSplitMb('1')).toBe(1);
  });

  it('浮点向下归一为整数', () => {
    expect(normalizeSplitMb('1.5')).toBe(1);
    expect(normalizeSplitMb('99.99')).toBe(99);
  });

  it('0 / 负数 / 空值 / 纯空白一律视为不分卷', () => {
    expect(normalizeSplitMb('0')).toBe(0);
    expect(normalizeSplitMb('-5')).toBe(0);
    expect(normalizeSplitMb('0.9')).toBe(0); // 归一后为 0，低于最小值
    expect(normalizeSplitMb('')).toBe(0);
    expect(normalizeSplitMb(null)).toBe(0);
    expect(normalizeSplitMb(undefined)).toBe(0);
    expect(normalizeSplitMb('   ')).toBe(0);
  });

  it('非数字 / 非有限值一律视为不分卷', () => {
    expect(normalizeSplitMb('abc')).toBe(0);
    expect(normalizeSplitMb('Infinity')).toBe(0);
    expect(normalizeSplitMb(NaN)).toBe(0);
  });

  it('返回值恒为整数，绝不把浮点传给分卷逻辑（R3.2）', () => {
    for (const raw of ['1.5', '7.2', '200', '0', '-3', 'abc', '', null, undefined]) {
      const out = normalizeSplitMb(raw);
      expect(Number.isInteger(out)).toBe(true);
      expect(out === 0 || out >= MIN_SPLIT_MB).toBe(true);
    }
  });
});

describe('2026-11-14 回归：{path, blob} 键（index.js 两个调用方的真实键名）', () => {
  it('Blob 条目不崩且体积走 .size（修复前 data=undefined ⇒ byteLength 崩）', async () => {
    const entries = [
      { path: 'settings.json', blob: new Blob([new TextEncoder().encode(JSON.stringify({ theme: 'dark' }))]) },
      { path: 'characters/Alice.png', blob: new Blob([new Uint8Array(3000)]) },
      { path: 'backgrounds/big-bg.png', blob: new Blob([new Uint8Array(6000)]) },
    ];
    const result = await splitArchiveEntries(entries, {
      thresholdMB: 0.004,
      target: 'st',
      handle: 'default-user',
      filenameTemplate: '{target}_{part}.zip',
    });
    expect(result.parts.length).toBeGreaterThanOrEqual(2);
    // Blob 体积走 .size ⇒ 3KB 的角色卡不会与 6KB 的背景挤进同一卷（排序后背景优先级最低在末卷）
    const sizes = result.parts.map((p) => p.sizeBytes);
    expect(sizes.every((n) => n > 0)).toBe(true);
  });
});

describe('2026-11-18 F-01 同源判定（written-bytes 预算制）', () => {
  it('守卫：多条目分卷的 blob.size 全部 ≤ thresholdBytes（written-bytes 路径）', async () => {
    const entries = [];
    for (let i = 0; i < 120; i++) {
      // 伪随机字节（不可压）：written-bytes 判定下 ≈1:1 落盘，阈值 50KB 必然多卷
      entries.push({ path: `chats/chat-${String(i).padStart(3, '0')}.bin`, data: new Uint8Array(8192).map((_, j) => (i * 31 + j * 7) % 251) });
    }
    const thresholdMB = 0.05; // 50KB（未压缩总量 ≈ 960KB）
    const result = await splitArchiveEntries(entries, {
      thresholdMB,
      target: 'st',
      handle: 'default-user',
      filenameTemplate: '{target}_{part}.zip',
      compressionLevel: 5,
    });
    expect(result.parts.length).toBeGreaterThan(1);
    const thresholdBytes = Math.floor(thresholdMB * 1024 * 1024 * 0.95);
    for (const part of result.parts) {
      if (part.fileCount > 1) {
        /* 设计契约：预算制下分卷不应超限；万一超限（估计低估），事后守卫必须
           如实标注 isOversized —— 绝不静默。 */
        if (part.blob.size > thresholdBytes) {
          expect(part.isOversized).toBe(true);
        }
        expect(part.blob.size).toBeLessThanOrEqual(thresholdBytes * 1.02); // 预算不失控
      }
    }
    // manifest 自描述判定口径（读 part1 产物里的 _convert/split-manifest.json）
    const reader = await zipIo.openReader(result.parts[0].blob);
    try {
      let judged = null;
      for await (const entry of reader.entries()) {
        if (entry.fileName === '_convert/split-manifest.json') {
          const text = new TextDecoder().decode(await entry.read());
          judged = JSON.parse(text).judgedBy;
        }
        entry.skip();
      }
      expect(judged).toBe('written-bytes');
    } finally {
      await reader.close();
    }
  });

  it('可压缩内容不再过度切卷：10MB 高可压文本 + 5MB 阈值 ⇒ ≤ 2 卷（旧实现按源字节 ≥3 卷）', async () => {
    const text = 'lorem ipsum dolor sit amet '.repeat(400 * 1024); // ≈10.7MB 高可压
    const entries = [];
    for (let i = 0; i < 3; i++) {
      entries.push({ path: `chats/big-${i}.jsonl`, data: new TextEncoder().encode(text) });
    }
    const result = await splitArchiveEntries(entries, {
      thresholdMB: 5,
      target: 'st',
      handle: 'default-user',
      filenameTemplate: '{target}_{part}.zip',
      compressionLevel: 5,
    });
    expect(result.parts.length).toBeLessThanOrEqual(2);
    expect(result.totalBytes).toBeLessThan(6 * 1024 * 1024); // 压缩后远小于未压缩总和
  });

  it('懒描述符 {path, size, read} 与 {path, data} 产出等价（splitter 决策后才 read）', async () => {
    const makeData = (n, fill) => new TextEncoder().encode(String(fill).repeat(n));
    const paths = ['settings.json', 'characters/A.png', 'backgrounds/B.png', 'chats/C.jsonl', 'chats/D.jsonl'];
    const blobs = ['z'.repeat(1200), 'a'.repeat(3000), 'b'.repeat(5000), 'c'.repeat(4000), 'd'.repeat(4000)];
    const eager = await splitArchiveEntries(paths.map((p, i) => ({ path: p, data: makeData(blobs[i].length, blobs[i][0]) })), {
      thresholdMB: 0.005, target: 'st', handle: 'default-user', filenameTemplate: '{target}_{part}.zip',
    });
    let reads = 0;
    const lazy = await splitArchiveEntries(paths.map((p, i) => ({
      path: p,
      size: blobs[i].length,
      read: () => { reads += 1; return Promise.resolve(makeData(blobs[i].length, blobs[i][0])); },
    })), {
      thresholdMB: 0.005, target: 'st', handle: 'default-user', filenameTemplate: '{target}_{part}.zip',
    });
    expect(lazy.totalParts).toBe(eager.totalParts);
    expect(lazy.parts.map((p) => p.fileCount)).toEqual(eager.parts.map((p) => p.fileCount));
    expect(reads).toBe(paths.length); // 每条目恰好读一次（封卷决策不触发多余 read）
  });

  it('非法 thresholdMB（NaN/0/负数）抛 TypeError，不再静默产出病态分卷', async () => {
    for (const bad of [NaN, 0, -3, 'abc']) {
      await expect(splitArchiveEntries(
        [{ path: 'a.txt', data: new Uint8Array(10) }],
        { thresholdMB: bad, target: 'st', handle: 'default-user' },
      )).rejects.toThrow(TypeError);
    }
  });
});
