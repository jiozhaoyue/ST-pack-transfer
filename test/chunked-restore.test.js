import { describe, expect, it } from 'vitest';
import {
  buildRestoreBody,
  buildUploadSessionBody,
  halveChunkLength,
  isChunkEndpointMissing,
  planChunks,
  retryDelayMs,
  shouldRetryStatus,
} from '../src/core/chunked-restore.js';

describe('分片恢复纯逻辑', () => {
  it('9 MiB 计划为 8 MiB + 余量', () => {
    const size = 9 * 1024 * 1024;
    expect(planChunks(size)).toEqual([
      { offset: 0, length: 8 * 1024 * 1024 },
      { offset: 8 * 1024 * 1024, length: 1024 * 1024 },
    ]);
  });

  it('413 减半，最低 256 KiB', () => {
    expect(halveChunkLength(8 * 1024 * 1024)).toBe(4 * 1024 * 1024);
    expect(halveChunkLength(512 * 1024)).toBe(256 * 1024);
    expect(halveChunkLength(256 * 1024)).toBeNull();
  });

  it('404/405 视为端点不存在，4xx 不重试、5xx/429/网络错误重试', () => {
    expect(isChunkEndpointMissing(404)).toBe(true);
    expect(isChunkEndpointMissing(405)).toBe(true);
    expect(isChunkEndpointMissing(400)).toBe(false);
    expect(shouldRetryStatus(0)).toBe(true);
    expect(shouldRetryStatus(500)).toBe(true);
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(400)).toBe(false);
  });

  it('重试退避 1/2/4 秒并封顶', () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n))).toEqual([1000, 2000, 4000, 4000]);
  });

  it('请求体字段正确', () => {
    expect(JSON.parse(buildUploadSessionBody({ handle: 'u', size: 9 })))
      .toEqual({ handle: 'u', fileName: 'backup.zip', size: 9 });
    expect(JSON.parse(buildRestoreBody({ uploadId: 'id', handle: 'u', mode: 'merge', selection: { chats: true } })))
      .toEqual({ uploadId: 'id', handle: 'u', mode: 'merge', selection: { chats: true } });
  });
});
