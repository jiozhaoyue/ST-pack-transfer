import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/core/zip-io.js', () => ({
  readZipEntryManifest: vi.fn(async () => [{ name: 'a.txt', crc32: 11 }]),
}));

import {
  createConversionRunner, readPausedMarker, PAUSED_MARKER_KEY,
} from '../src/app/conversion-runner.js';
import { TASK_STATES } from '../src/core/task-manager.js';
import { readZipEntryManifest } from '../src/core/zip-io.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
}

function makeView() {
  return { setProgress: vi.fn(), setTask: vi.fn(), toast: vi.fn() };
}

function makeTaskManager(record) {
  const signal = new AbortController().signal;
  return {
    signal,
    adapter: { load: vi.fn(async () => null) },
    start: vi.fn(() => ({ signal, onCheckpoint: vi.fn(), setPauseCheckpoint: vi.fn() })),
    complete: vi.fn(async () => {}),
    abort: vi.fn(async () => true),
    pause: vi.fn(async () => true),
    get: vi.fn(() => record),
  };
}

function abortError() {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

const t = (key) => key;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('conversion-runner：续传 / 暂停 / 中止的接线', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readZipEntryManifest.mockResolvedValue([{ name: 'a.txt', crc32: 11 }]);
  });

  it('成功：把 signal / resumeCrcMap / finalizeOnAbort 传给转换器，并完成状态机', async () => {
    const tm = makeTaskManager(null);
    const view = makeView();
    const runConversionTask = vi.fn(async ({ onProgress }) => {
      onProgress(1, 2, 'a.txt', 11);
      return { report: { totals: {} }, resultBlob: new Blob(['out']) };
    });
    const runner = createConversionRunner({
      getTaskManager: async () => tm, runConversionTask, view, logger, t, storage: makeStorage(),
    });

    const out = await runner.convert({
      pkg: { id: 'p1', name: 'p.zip' },
      blob: new Blob(['src']),
      target: 'st',
      options: { excludedPaths: new Set() },
    });

    const arg = runConversionTask.mock.calls[0][0];
    expect(arg.options.signal).toBe(tm.signal);
    expect(arg.options.resumeCrcMap).toBeInstanceOf(Map);
    expect(arg.options.finalizeOnAbort).toBe(true);
    expect(arg.options.appendFrom).toBeNull();
    expect(out.resultBlob).toBeTruthy();
    expect(tm.complete).toHaveBeenCalledTimes(1);
    expect(view.setTask).toHaveBeenLastCalledWith(null);
  });

  it('暂停：走 persistPartial（不 fail），写暂停标记并显示暂停态', async () => {
    const tm = makeTaskManager({ state: TASK_STATES.PAUSED });
    const view = makeView();
    const storage = makeStorage();
    const runConversionTask = vi.fn(async ({ onPaused }) => {
      await onPaused({ partialBlob: null, manifest: [], partialError: 'test' });
      throw abortError();
    });
    const runner = createConversionRunner({
      getTaskManager: async () => tm, runConversionTask, view, logger, t, storage,
    });

    const out = await runner.convert({
      pkg: { id: 'p1', name: 'p.zip' },
      blob: new Blob(['src']),
      target: 'st',
    });

    expect(out).toEqual({ paused: true });
    expect(view.setTask).toHaveBeenCalledWith(expect.objectContaining({ state: 'paused' }));
    const marker = readPausedMarker(storage);
    expect(marker).toMatchObject({ pkgId: 'p1', target: 'st', name: 'p.zip' });
    expect(marker.taskId).toBeTruthy();
    expect(tm.complete).not.toHaveBeenCalled();
    expect(tm.get).toHaveBeenCalled();
  });

  it('中止：清理半成品与标记，返回 aborted，不抛错', async () => {
    const tm = makeTaskManager({ state: TASK_STATES.ABORTED });
    const view = makeView();
    const storage = makeStorage();
    storage.setItem(PAUSED_MARKER_KEY, JSON.stringify({ taskId: 't1', pkgId: 'p1', target: 'st' }));
    const cleanup = vi.fn();
    const runConversionTask = vi.fn(async () => { throw abortError(); });
    const runner = createConversionRunner({
      getTaskManager: async () => tm,
      runConversionTask,
      view,
      logger,
      t,
      storage,
      opfs: { tmpHandle: vi.fn(async () => null), handleToFile: vi.fn(), cleanup },
    });

    const out = await runner.convert({
      pkg: { id: 'p1', name: 'p.zip' },
      blob: new Blob(['src']),
      target: 'st',
    });

    expect(out).toEqual({ aborted: true });
    expect(tm.abort).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
    expect(readPausedMarker(storage)).toBeNull();
    expect(view.setTask).toHaveBeenLastCalledWith(null);
  });

  it('续传：从 OPFS 半成品重建台账，并复用暂停时的 taskId', async () => {
    const tm = makeTaskManager(null);
    tm.adapter.load = vi.fn(async () => ({ partialOpfsName: 'x.partial.zip', partialEntries: [] }));
    const view = makeView();
    const partialBlob = new Blob(['partial']);
    const runConversionTask = vi.fn(async () => ({ resultBlob: new Blob(['out']) }));
    const runner = createConversionRunner({
      getTaskManager: async () => tm,
      runConversionTask,
      view,
      logger,
      t,
      storage: makeStorage(),
      opfs: {
        tmpHandle: vi.fn(async () => ({ kind: 'handle' })),
        handleToFile: vi.fn(async () => partialBlob),
        cleanup: vi.fn(),
      },
    });

    await runner.convert({
      pkg: { id: 'p1', name: 'p.zip' },
      blob: new Blob(['src']),
      target: 'st',
      resume: { taskId: 'convert-123' },
    });

    expect(tm.start).toHaveBeenCalledWith('convert-123', 'p.zip', expect.objectContaining({ resumable: true }));
    const arg = runConversionTask.mock.calls[0][0];
    expect(arg.options.appendFrom).toBe(partialBlob);
    expect(arg.options.resumeCrcMap.get('a.txt')).toBe(11);
  });

  it('pause()/abort() 委托给状态机：无当前任务时安全空转', async () => {
    const tm = makeTaskManager(null);
    const runner = createConversionRunner({
      getTaskManager: async () => tm, runConversionTask: vi.fn(), view: makeView(), logger, t, storage: makeStorage(),
    });
    await expect(runner.pause()).resolves.toBe(false);
    await expect(runner.abort()).resolves.toBe(false);
    expect(tm.pause).not.toHaveBeenCalled();
  });
});
