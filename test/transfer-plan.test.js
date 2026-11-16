import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  buildManifest,
  chunkKey,
  incrementalVerdict,
  manifestKey,
  normalizeChunkSize,
  parseManifest,
  planChunks,
  resumePlan,
} from '../src/core/transfer-plan.js';

describe('transfer-plan 分片台账', () => {
  it('归一分片大小并夹在 1–64 MiB', () => {
    expect(normalizeChunkSize(undefined)).toBe(DEFAULT_CHUNK_SIZE);
    expect(normalizeChunkSize(0)).toBe(DEFAULT_CHUNK_SIZE);
    expect(normalizeChunkSize(1)).toBe(MIN_CHUNK_SIZE);
    expect(normalizeChunkSize(MAX_CHUNK_SIZE * 2)).toBe(MAX_CHUNK_SIZE);
  });

  it('空文件不产生分片', () => {
    expect(planChunks(0, 1024)).toEqual([]);
  });

  it('整除与尾片边界正确', () => {
    const MB = 1024 * 1024;
    expect(planChunks(10 * MB, 4 * MB)).toEqual([
      { index: 0, start: 0, end: 4 * MB, size: 4 * MB },
      { index: 1, start: 4 * MB, end: 8 * MB, size: 4 * MB },
      { index: 2, start: 8 * MB, end: 10 * MB, size: 2 * MB },
    ]);
    expect(planChunks(8 * MB, 4 * MB).map((c) => c.size)).toEqual([4 * MB, 4 * MB]);
  });

  it('分片与清单对象名稳定', () => {
    expect(chunkKey('a.zip', 0)).toBe('a.zip.part000');
    expect(chunkKey('a.zip', 12)).toBe('a.zip.part012');
    expect(manifestKey('a.zip')).toBe('a.zip.manifest.json');
  });

  it('断点续传只补缺失分片', () => {
    const MB = 1024 * 1024;
    const { chunks, missing, complete } = resumePlan({
      totalBytes: 10 * MB,
      chunkSize: 4 * MB,
      present: [0, 2],
    });
    expect(chunks.length).toBe(3);
    expect(missing.map((c) => c.index)).toEqual([1]);
    expect(complete).toBe(false);
    expect(resumePlan({ totalBytes: 8 * MB, chunkSize: 4 * MB, present: [0, 1] }).complete).toBe(true);
  });

  it('清单可往返且拒绝非法形状', () => {
    const MB = 1024 * 1024;
    const manifest = buildManifest({
      name: 'a.zip',
      size: 10 * MB,
      chunkSize: 4 * MB,
      chunks: planChunks(10 * MB, 4 * MB),
      sha256: 'abc',
      createdAt: '2026-11-09T00:00:00.000Z',
    });
    expect(parseManifest(manifest)).toMatchObject({
      name: 'a.zip',
      size: 10 * MB,
      chunkSize: 4 * MB,
      totalChunks: 3,
      sha256: 'abc',
    });
    expect(parseManifest('not json')).toBeNull();
    expect(parseManifest({ schema: 2 })).toBeNull();
    expect(parseManifest({ schema: 1, size: -1, chunks: [] })).toBeNull();
  });

  it('增量判定只认证据，大小相同但无哈希不跳', () => {
    expect(incrementalVerdict({ size: 10 }, null)).toEqual({ skip: false, reason: 'remote-missing' });
    expect(incrementalVerdict({ size: 10 }, { size: 11 })).toEqual({ skip: false, reason: 'size-mismatch' });
    expect(incrementalVerdict({ size: 10, sha256: 'a' }, { size: 10, sha256: 'a' }))
      .toEqual({ skip: true, reason: 'sha256-match' });
    expect(incrementalVerdict({ size: 10, etag: 'e' }, { size: 10, etag: 'e' }))
      .toEqual({ skip: true, reason: 'etag-match' });
    expect(incrementalVerdict({ size: 10 }, { size: 10 })).toEqual({ skip: false, reason: 'unverified' });
  });
});
