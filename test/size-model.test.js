import { describe, expect, it } from 'vitest';
import * as zip from '@zip.js/zip.js';
import {
  BYTES_PER_MB,
  SIZE_CATEGORIES,
  ZIP_OVERHEAD,
  bytesToMb,
  compressionRatio,
  estimateSize,
  mbToBytes,
  normalizeCompressionLevel,
} from '../src/core/size-model.js';

const entry = (category, mb, extra = {}) => ({
  path: `data/${category}/sample.bin`,
  category,
  bytes: mbToBytes(mb),
  ...extra,
});

describe('size-model · 压缩档位与类目', () => {
  it('兼容旧档位名并归一到 0/1/5/9', () => {
    expect(normalizeCompressionLevel('store')).toBe(0);
    expect(normalizeCompressionLevel('fast')).toBe(1);
    expect(normalizeCompressionLevel('maximum')).toBe(9);
    expect(normalizeCompressionLevel('5')).toBe(5);
    expect(normalizeCompressionLevel(undefined)).toBe(5);
  });

  it('store 档所有类目压缩比均为 1', () => {
    for (const category of SIZE_CATEGORIES) {
      expect(compressionRatio(category, 0)).toBe(1);
    }
  });

  it('每个类目都覆盖，且压缩级别越高体积越小', () => {
    const entries = SIZE_CATEGORIES.map((category) => entry(category, 10));
    const store = estimateSize({ entries, options: { compression: 0 } });
    const fast = estimateSize({ entries, options: { compression: 1 } });
    const balanced = estimateSize({ entries, options: { compression: 5 } });
    const maximum = estimateSize({ entries, options: { compression: 9 } });

    expect(store.breakdown).toHaveLength(SIZE_CATEGORIES.length);
    expect(store.compressedBytes ?? store.breakdown.reduce((s, b) => s + b.compressedBytes, 0))
      .toBeGreaterThan(0);
    expect(store.predictedBytes).toBeGreaterThan(maximum.predictedBytes);
    expect(fast.predictedBytes).toBeGreaterThan(balanced.predictedBytes);
    expect(balanced.predictedBytes).toBeGreaterThan(maximum.predictedBytes);
  });

  it('已压缩类目（附件/原生/备份）的压缩收益明显低于文本类目', () => {
    expect(compressionRatio('attachments', 9)).toBeGreaterThan(compressionRatio('chats', 9));
    expect(compressionRatio('native', 9)).toBeGreaterThan(compressionRatio('lorebooks', 9));
    expect(compressionRatio('backups', 9)).toBeGreaterThan(compressionRatio('presets', 9));
  });
});

describe('size-model · ZIP 开销与分卷', () => {
  it('计入本地头/中央目录/数据描述符，预测大于纯内容', () => {
    const one = estimateSize({ entries: [entry('chats', 1)], options: { compression: 0 } });
    expect(one.zipOverheadBytes).toBeGreaterThanOrEqual(
      ZIP_OVERHEAD.localHeader + ZIP_OVERHEAD.centralHeader + ZIP_OVERHEAD.eocd,
    );
    expect(one.predictedBytes).toBeGreaterThan(one.uncompressedBytes);
  });

  it('分卷会重复中央目录并增加卷数', () => {
    const entries = [entry('chats', 40), entry('attachments', 40), entry('lorebooks', 40)];
    const single = estimateSize({ entries, options: { compression: 0 } });
    const split = estimateSize({ entries, options: { compression: 0, splitMb: 32 } });

    expect(single.volumeCount).toBe(1);
    expect(split.volumeCount).toBe(4);
    expect(split.zipOverheadBytes).toBeGreaterThan(single.zipOverheadBytes);
    expect(split.predictedBytes).toBeGreaterThan(single.predictedBytes);
  });

  it('MB/字节换算保留精度', () => {
    expect(mbToBytes(1)).toBe(BYTES_PER_MB);
    expect(bytesToMb(BYTES_PER_MB)).toBe(1);
    expect(bytesToMb(0)).toBe(0);
  });
});

describe('size-model · 扩展模式与剔除', () => {
  it('仅清单模式显著缩小扩展类目', () => {
    const entries = [entry('extensions', 300), entry('chats', 100)];
    const full = estimateSize({ entries, options: { compression: 5, extensionMode: 'full' } });
    const manifest = estimateSize({ entries, options: { compression: 5, extensionMode: 'manifest' } });

    expect(manifest.predictedBytes).toBeLessThan(full.predictedBytes);
    expect(manifest.manifestAdjustedBytes).toBeGreaterThan(0);
    expect(manifest.confidence).toBe('medium');
  });

  it('dual（both）保留完整扩展实体', () => {
    const entries = [entry('extensions', 300), entry('chats', 100)];
    const full = estimateSize({ entries, options: { compression: 5, extensionMode: 'full' } });
    const both = estimateSize({ entries, options: { compression: 5, extensionMode: 'both' } });
    expect(both.predictedBytes).toBe(full.predictedBytes);
  });

  it('Git 剔除条目不计入未压缩体积，单独汇报', () => {
    const entries = [
      entry('extensions', 10),
      { path: 'data/extensions/x/.git/objects/a', category: 'extensions', bytes: mbToBytes(5), dropped: true },
    ];
    const out = estimateSize({ entries, options: { compression: 5 } });
    expect(out.droppedBytes).toBe(mbToBytes(5));
    expect(out.uncompressedBytes).toBe(mbToBytes(10));
  });
});

describe('size-model · 未知项不得假精确', () => {
  it('缺体积的条目进入 unknowns，并给出区间', () => {
    const out = estimateSize({
      entries: [
        entry('chats', 50),
        {
          path: '_engine_dump.bin',
          category: 'unknown',
          bytes: null,
          reason: 'engine-dump-size',
          estimateBytes: [mbToBytes(40), mbToBytes(80)],
        },
      ],
      options: { compression: 5 },
    });

    expect(out.unknowns).toHaveLength(1);
    expect(out.unknowns[0]).toMatchObject({ path: '_engine_dump.bin', reason: 'engine-dump-size' });
    expect(out.range.high).toBeGreaterThan(out.predictedBytes);
    expect(out.range.low).toBeGreaterThanOrEqual(out.predictedBytes);
    expect(out.confidence).toBe('low');
  });

  it('空计划不产生负数或假体积', () => {
    const out = estimateSize({ entries: [] });
    expect(out.predictedBytes).toBe(0);
    expect(out.uncompressedBytes).toBe(0);
    expect(out.range).toEqual({ low: 0, high: 0 });
  });
});

describe('size-model · 真实 ZIP 回归（level 0）', () => {
  it('store 档预测与实际 zip 字节误差 < 12%', async () => {
    const contents = [
      ['data/chats/alice/one.jsonl', 18000],
      ['data/characters/Mira.png', 9000],
      ['data/worldinfo/Lore.json', 7000],
    ];
    const blobWriter = new zip.BlobWriter('application/zip');
    const writer = new zip.ZipWriter(blobWriter, { level: 0 });
    for (const [name, size] of contents) {
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = i % 251;
      await writer.add(name, new zip.Uint8ArrayReader(bytes));
    }
    await writer.close();
    const actual = (await blobWriter.getData()).size;

    const estimate = estimateSize({
      entries: contents.map(([path, size]) => ({
        path,
        category: path.includes('/chats/') ? 'chats' : path.includes('/characters/') ? 'characters' : 'lorebooks',
        bytes: size,
      })),
      options: { compression: 0 },
    });

    const error = Math.abs(estimate.predictedBytes - actual) / actual;
    expect(error).toBeLessThan(0.12);
  });
});
