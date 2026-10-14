import { describe, expect, it, vi } from 'vitest';
import { TimeoutError, readStreamChunkBounded } from '../src/ui/fetch-bounds.js';

/**
 * 传输停滞守卫（`L1-MR-7` 有界等待）单测。
 *
 * 用**极短阈值 + 可控替身 reader** 验证行为，不靠真实网络、不靠长等待。
 */

/** 永不 settle 的 reader（模拟「连接不死、也不再来字节」）。 */
function stalledReader() {
  return {
    read: () => new Promise(() => {}),
    cancel: vi.fn(async () => {}),
  };
}

/** 按脚本依次返回 chunk 的 reader。 */
function scriptedReader(chunks, { delayMs = 0 } = {}) {
  let i = 0;
  return {
    read: async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (i >= chunks.length) return { done: true, value: undefined };
      const value = chunks[i++];
      return { done: false, value };
    },
    cancel: vi.fn(async () => {}),
  };
}

describe('readStreamChunkBounded（传输停滞守卫）', () => {
  it('【AC-1】停滞 ⇒ 在阈值内以 TimeoutError settle，并释放流', async () => {
    const reader = stalledReader();
    const started = Date.now();
    await expect(
      readStreamChunkBounded(reader, { timeoutMs: 30, label: '接收数据包' }),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
  });

  it('【AC-1 判别力】去掉守卫（timeoutMs=0）⇒ 同一夹具永不 settle', async () => {
    const reader = stalledReader();
    const outcome = await Promise.race([
      readStreamChunkBounded(reader, { timeoutMs: 0 }).then(() => 'settled', () => 'settled'),
      new Promise((r) => setTimeout(() => r('pending'), 200)),
    ]);
    expect(outcome).toBe('pending');
    expect(reader.cancel).not.toHaveBeenCalled();
  });

  it('【AC-2】字节持续到达时守卫不触发（即使总时长远超阈值）', async () => {
    // 6 块 × 25ms ≈ 150ms 总时长，阈值只有 40ms —— 只要间隔 < 阈值就不该触发
    const reader = scriptedReader(['a', 'b', 'c', 'd', 'e', 'f'], { delayMs: 25 });
    const seen = [];
    for (;;) {
      const { done, value } = await readStreamChunkBounded(reader, { timeoutMs: 40 });
      if (done) break;
      seen.push(value);
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(reader.cancel).not.toHaveBeenCalled();
  });

  it('透传 {done, value}（含结束块）', async () => {
    const reader = scriptedReader(['x']);
    expect(await readStreamChunkBounded(reader, { timeoutMs: 1000 })).toEqual({ done: false, value: 'x' });
    expect(await readStreamChunkBounded(reader, { timeoutMs: 1000 })).toEqual({ done: true, value: undefined });
  });

  it('reader.read() 自身 reject ⇒ 原样上抛（不被吞成超时）', async () => {
    const reader = {
      read: async () => { throw new Error('boom'); },
      cancel: vi.fn(async () => {}),
    };
    await expect(readStreamChunkBounded(reader, { timeoutMs: 1000 })).rejects.toThrow('boom');
    expect(reader.cancel).not.toHaveBeenCalled();
  });
});
