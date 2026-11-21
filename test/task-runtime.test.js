/**
 * 零覆盖模块补测 · task-runtime（src/app/task-runtime.js）
 *
 * 依据：docs/HANDOFF-2026-11-21-quality-pass.md:85 列为「最高风险」零测试模块。
 * 本模块是业务逻辑（非 UI），把任务生命周期的纯判定抽成可单测函数。
 * 用 vi.mock 隔离四个外部依赖（logger / task-manager / host-bridge / chat-store-bridge），
 * 只锁定纯逻辑核的契约：
 *   ① taskKindOf 前缀**长度降序**匹配（convert-batch 不被 convert 吃掉）；
 *   ② hasRoomForPartial 量不到配额时**放行**（不静默能力退化）；
 *   ③ persistPartial 全失败路径降级为「无半成品」不抛错，且先落 zip 再写断点；
 *   ④ createCheckpointThrottle 首次必落盘、快照只含已完成条目；
 *   ⑤ resumedNote 读 report.totals.resumed（非不存在的 resumedCount）；
 *   ⑥ convertExitForAbort 暂停绝不经 fail（fail 会清断点）；
 *   ⑦ attachConversionProgress 只走 onProgress 一种签名即可落盘；
 *   ⑧ runBatchItems 从 startIndex 起、AbortError 必须终止循环；
 *   ⑨ batchResumeVerdict / seedEntriesFor 的续传前提与单子项播种。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { warnSpy, infoSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  infoSpy: vi.fn(),
}));

vi.mock('../src/core/logger.js', () => ({
  logger: { warn: warnSpy, info: infoSpy, error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/core/task-manager.js', () => ({
  TASK_STATES: Object.freeze({
    RUNNING: 'running', PAUSED: 'paused', ABORTED: 'aborted', DONE: 'done', FAILED: 'failed',
  }),
}));

vi.mock('../src/ui/host-bridge.js', () => ({
  supportsOpfs: vi.fn(() => true),
  opfsTmpHandle: vi.fn(),
  getRestoreProbe: vi.fn(() => Object.freeze({ capability: 'unknown' })),
}));

vi.mock('../src/ui/chat-store-bridge.js', () => ({
  getChatStoreProbe: vi.fn(() => Object.freeze({})),
}));

import {
  TASK_KINDS,
  TASK_PREFIX,
  taskKindOf,
  partialNameFor,
  hasRoomForPartial,
  persistPartial,
  createCheckpointThrottle,
  resumedNote,
  convertExitForAbort,
  attachConversionProgress,
  runBatchItems,
  batchResumeVerdict,
  seedEntriesFor,
} from '../src/app/task-runtime.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('task-runtime · 任务类型反解', () => {
  it('① TASK_KINDS / TASK_PREFIX 四个类型齐全且前缀冻结', () => {
    expect(Object.values(TASK_KINDS)).toEqual(['fetch', 'convert', 'convert-batch', 'restore']);
    expect(Object.isFrozen(TASK_PREFIX)).toBe(true);
    expect(TASK_PREFIX[TASK_KINDS.CONVERT_BATCH]).toBe('convert-batch-');
  });

  it('① taskKindOf 对 convert-batch-<ts> 返回 convert-batch（不被 convert 吃掉）', () => {
    expect(taskKindOf('convert-batch-123')).toBe('convert-batch');
    expect(taskKindOf('convert-123')).toBe('convert');
    expect(taskKindOf('fetch-123')).toBe('fetch');
    expect(taskKindOf('restore-123')).toBe('restore');
  });

  it('① 未知 id / 非字符串返回 null（调用方须 warn）', () => {
    expect(taskKindOf('weird-1')).toBeNull();
    expect(taskKindOf('')).toBeNull();
    expect(taskKindOf(null)).toBeNull();
    expect(taskKindOf(123)).toBeNull();
  });

  it('① 半成品文件名只加 .partial.zip，不再叠加 convert- 前缀', () => {
    expect(partialNameFor('convert-123')).toBe('convert-123.partial.zip');
    expect(partialNameFor('fetch-9')).toBe('fetch-9.partial.zip');
  });
});

describe('task-runtime · OPFS 配额预检', () => {
  it('② 无 navigator.storage.estimate ⇒ 放行（true）', async () => {
    expect(await hasRoomForPartial(1024, null)).toBe(true);
    expect(await hasRoomForPartial(1024, {})).toBe(true);
  });

  it('② 剩余空间足够（含 10% 余量）⇒ true', async () => {
    const nav = { storage: { estimate: async () => ({ quota: 1000, usage: 0 }) } };
    expect(await hasRoomForPartial(900, nav)).toBe(true);
  });

  it('② 剩余空间不足 ⇒ false', async () => {
    const nav = { storage: { estimate: async () => ({ quota: 1000, usage: 950 }) } };
    expect(await hasRoomForPartial(900, nav)).toBe(false);
  });

  it('② quota 为 0（量不到）⇒ 放行；estimate 抛错 ⇒ 放行', async () => {
    expect(await hasRoomForPartial(900, { storage: { estimate: async () => ({ quota: 0, usage: 0 }) } }))
      .toBe(true);
    expect(await hasRoomForPartial(900, { storage: { estimate: async () => { throw new Error('x'); } } }))
      .toBe(true);
  });
});

describe('task-runtime · 半成品持久化 persistPartial', () => {
  const base = {
    taskId: 'convert-1', target: 'st', totalBytes: 100,
    setPauseCheckpoint: vi.fn(),
  };

  it('③ 无 partialBlob ⇒ false/no-partial 且留 warn（带具体原因）', async () => {
    const res = await persistPartial({ ...base, partialBlob: null, partialError: '收尾超时' });
    expect(res).toEqual({ ok: false, reason: 'no-partial' });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('收尾超时');
  });

  it('③ 环境不支持 OPFS ⇒ false/no-opfs，不触碰句柄', async () => {
    const res = await persistPartial({
      ...base, partialBlob: new Blob(['x']), manifest: [],
      deps: { supportsOpfs: () => false },
    });
    expect(res).toEqual({ ok: false, reason: 'no-opfs' });
  });

  it('③ 配额不足 ⇒ false/quota', async () => {
    const res = await persistPartial({
      ...base, partialBlob: new Blob(['x']), manifest: [],
      deps: { quotaCheck: async () => false },
    });
    expect(res).toEqual({ ok: false, reason: 'quota' });
  });

  it('③ 句柄获取失败 ⇒ false/handle，且不写断点', async () => {
    const setPauseCheckpoint = vi.fn();
    const res = await persistPartial({
      ...base, partialBlob: new Blob(['x']), manifest: [], setPauseCheckpoint,
      deps: { opfsTmpHandle: async () => null },
    });
    expect(res).toEqual({ ok: false, reason: 'handle' });
    expect(setPauseCheckpoint).not.toHaveBeenCalled();
  });

  it('③ 写入抛错 ⇒ false/write-failed，不抛到调用方', async () => {
    const handle = {
      createWritable: async () => ({
        write: async () => { throw new Error('disk full'); },
        close: async () => {},
      }),
    };
    const res = await persistPartial({
      ...base, partialBlob: new Blob(['x']), manifest: [],
      deps: { opfsTmpHandle: async () => handle },
    });
    expect(res).toEqual({ ok: false, reason: 'write-failed' });
  });

  it('③ 成功路径：先落 zip（write→close）再写断点，返回 name', async () => {
    const order = [];
    const blob = new Blob(['x']);
    const handle = {
      createWritable: async () => ({
        write: async (b) => { order.push('write'); expect(b).toBe(blob); },
        close: async () => { order.push('close'); },
      }),
    };
    const setPauseCheckpoint = vi.fn(() => { order.push('checkpoint'); });
    const res = await persistPartial({
      ...base, partialBlob: blob,
      manifest: [{ name: 'a.txt', crc32: 7 }], setPauseCheckpoint,
      deps: { opfsTmpHandle: async (name, create) => {
        expect(name).toBe('convert-1.partial.zip');
        expect(create).toBe(true);
        return handle;
      } },
    });
    expect(res).toEqual({ ok: true, name: 'convert-1.partial.zip' });
    expect(order).toEqual(['write', 'close', 'checkpoint']);
    expect(setPauseCheckpoint).toHaveBeenCalledWith({
      partialOpfsName: 'convert-1.partial.zip',
      target: 'st',
      partialEntries: [{ name: 'a.txt', crc32: 7 }],
      totalEntries: 100,
    });
  });

  it('③ 自定义 buildCheckpoint 时按批量形状写入（单包形状不覆盖批量）', async () => {
    const handle = {
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    };
    const setPauseCheckpoint = vi.fn();
    await persistPartial({
      ...base, partialBlob: new Blob(['x']), manifest: [], setPauseCheckpoint,
      buildCheckpoint: ({ name, partialEntries }) => ({ kind: 'batch', name, partialEntries, itemIndex: 2 }),
      deps: { opfsTmpHandle: async () => handle },
    });
    expect(setPauseCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'batch', itemIndex: 2 }),
    );
  });
});

describe('task-runtime · 断点节流 createCheckpointThrottle', () => {
  it('④ 首次调用必落盘（lastFlushAt=0），即便 doneEntries 为空', () => {
    const onCheckpoint = vi.fn();
    const throttle = createCheckpointThrottle(onCheckpoint, new Map());
    throttle({ totalEntries: 10 });
    expect(onCheckpoint).toHaveBeenCalledTimes(1);
    expect(onCheckpoint.mock.calls[0][0]).toEqual({ doneEntries: {}, totalEntries: 10 });
  });

  it('④ 未到窗口（条数/时间）不落盘', () => {
    const onCheckpoint = vi.fn();
    const done = new Map([['a', 1]]);
    const throttle = createCheckpointThrottle(onCheckpoint, done, { everyEntries: 10, everyMs: 999999 });
    throttle({ totalEntries: 10 });   // 首次落盘
    onCheckpoint.mockClear();
    done.set('b', 2);                  // 仅 2 条，未到 10
    throttle({ totalEntries: 10 });
    expect(onCheckpoint).not.toHaveBeenCalled();
  });

  it('④ force=true 强制落盘且快照只含已完成条目', () => {
    const onCheckpoint = vi.fn();
    const done = new Map([['a', 1], ['b', 2]]);
    const throttle = createCheckpointThrottle(onCheckpoint, done, { everyMs: 999999 });
    throttle({ totalEntries: 5 });     // 首次
    onCheckpoint.mockClear();
    throttle({ force: true, totalEntries: 5, bytes: 42 });
    expect(onCheckpoint).toHaveBeenCalledTimes(1);
    expect(onCheckpoint.mock.calls[0][0]).toEqual({
      doneEntries: { a: 1, b: 2 }, totalEntries: 5,
    });
    expect(onCheckpoint.mock.calls[0][1]).toEqual({ bytes: 42, force: true });
  });

  it('④ 自定义 buildManifest 时按自定义形状形成 checkpoint', () => {
    const onCheckpoint = vi.fn();
    const throttle = createCheckpointThrottle(onCheckpoint, new Map(), {
      buildManifest: (doneObject, { totalEntries }) => ({ kind: 'batch', doneObject, totalEntries, itemIndex: 3 }),
    });
    throttle({ totalEntries: 8 });
    expect(onCheckpoint.mock.calls[0][0]).toEqual({
      kind: 'batch', doneObject: {}, totalEntries: 8, itemIndex: 3,
    });
  });
});

describe('task-runtime · 续传与收尾判定', () => {
  it('⑤ resumedNote 读 report.totals.resumed，>0 才给提示串', () => {
    expect(resumedNote({ totals: { resumed: 2 } })).toBe('（沿用断点跳过 2 项）');
    expect(resumedNote({ totals: { resumed: 0 } })).toBe('');
    expect(resumedNote({})).toBe('');
    // 不存在的 resumedCount 字段不得被误读
    expect(resumedNote({ totals: {}, resumedCount: 9 })).toBe('');
  });

  it('⑥ convertExitForAbort：非 AbortError ⇒ fail；暂停态 ⇒ paused（绝不 fail）', () => {
    expect(convertExitForAbort({ err: new Error('boom'), record: { state: 'paused' } }))
      .toEqual({ action: 'fail' });
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    expect(convertExitForAbort({ err: abort, record: { state: 'paused' } }))
      .toEqual({ action: 'paused' });
    expect(convertExitForAbort({ err: abort, record: { state: 'aborted' } }))
      .toEqual({ action: 'aborted' });
    expect(convertExitForAbort({ err: abort, record: null })).toEqual({ action: 'none' });
  });

  it('⑦ attachConversionProgress 只调 onProgress 即写入 Map 并触发 force 落盘', () => {
    const done = new Map();
    const maybeCheckpoint = vi.fn();
    const track = attachConversionProgress({ doneEntries: done, maybeCheckpoint });
    track(3, 3, 'a.txt', 123);          // 模拟 Worker 路径唯一签名：cur===total
    expect(done.get('a.txt')).toBe(123);
    expect(maybeCheckpoint).toHaveBeenCalledWith({ force: true, totalEntries: 3 });
  });

  it('⑦ 无名条目或 crc 为空不入 Map，但-force 判定仍走', () => {
    const done = new Map();
    const maybeCheckpoint = vi.fn();
    const track = attachConversionProgress({ doneEntries: done, maybeCheckpoint });
    track(2, 5, '', 1);
    track(3, 5, 'b.txt', null);
    expect(done.size).toBe(0);
    expect(maybeCheckpoint).toHaveBeenCalledWith({ force: false, totalEntries: 5 });
  });
});

describe('task-runtime · 批量编排核', () => {
  it('⑧ runBatchItems 从 startIndex 起处理，processed 计数正确', async () => {
    const seen = [];
    const res = await runBatchItems({
      items: ['a', 'b', 'c', 'd'], startIndex: 2,
      convertItem: async (item, i) => { seen.push([item, i]); },
    });
    expect(seen).toEqual([['c', 2], ['d', 3]]);
    expect(res).toEqual({ processed: 2, aborted: false, error: null });
  });

  it('⑧ 非中止错误记日志继续，不终止循环', async () => {
    const onItemError = vi.fn();
    const res = await runBatchItems({
      items: [1, 2, 3],
      convertItem: async (item) => { if (item === 2) throw new Error('bad'); },
      onItemError,
    });
    expect(onItemError).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(2);
    expect(res.aborted).toBe(false);
  });

  it('⑧ AbortError 必须立刻终止循环，后续子项不再执行', async () => {
    const seen = [];
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    const res = await runBatchItems({
      items: [1, 2, 3],
      convertItem: async (item) => {
        seen.push(item);
        if (item === 2) throw abort;
      },
    });
    expect(seen).toEqual([1, 2]);
    expect(res.aborted).toBe(true);
    expect(res.error).toBe(abort);
    expect(res.processed).toBe(1);
  });

  it('⑨ batchResumeVerdict 产物数相符才 valid，否则给出含原因的判据', () => {
    expect(batchResumeVerdict({ expectedOutputs: 2, productsPresent: 2 }))
      .toEqual({ valid: true, reason: '' });
    const bad = batchResumeVerdict({ expectedOutputs: 3, productsPresent: 1 });
    expect(bad.valid).toBe(false);
    expect(bad.reason).toContain('3');
    expect(bad.reason).toContain('1');
  });

  it('⑨ seedEntriesFor 只对断点游标指向的子项播种，其余返回空 Map', () => {
    const checkpoint = { doneEntries: { 'a.png': 1, 'b.png': 2 } };
    expect([...seedEntriesFor({ checkpoint, index: 0, startIndex: 0 })])
      .toEqual([['a.png', 1], ['b.png', 2]]);
    expect(seedEntriesFor({ checkpoint, index: 1, startIndex: 0 }).size).toBe(0);
    expect(seedEntriesFor({ checkpoint: null, index: 0, startIndex: 0 }).size).toBe(0);
  });
});
