import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ORIGINS } from '../src/storage/db.js';

// migrateRoleToOrigin / normalizeRecord 是模块私有逻辑的映射规则，
// 这里通过公开的 ORIGINS 枚举 + saveFile 推断路径验证映射语义。
// 真正的 v1→v2 onupgradeneeded 迁移在 Playwright 端到端用预置 v1 库验证。

describe('ORIGINS 来源枚举与映射语义', () => {
  it('枚举值齐全且冻结', () => {
    expect(ORIGINS.UPLOAD).toBe('upload');
    expect(ORIGINS.HOST_EXPORT).toBe('host-export');
    expect(ORIGINS.CONVERTED).toBe('converted');
    expect(ORIGINS.DELTA).toBe('delta');
    expect(ORIGINS.SPLIT_PART).toBe('split-part');
    expect(Object.isFrozen(ORIGINS)).toBe(true);
  });
});

// fake-indexeddb 不可用时（未安装），用纯逻辑路径模拟迁移映射验证
describe('role→origin 迁移映射规则', () => {
  // 从 db.js 源码提取的映射规则（与 migrateRoleToOrigin 实现同步）
  function migrateRoleToOrigin(record) {
    const meta = record.metadata || {};
    if (meta.isSplitPart || meta.partIndex != null || meta.partTotal != null) {
      return ORIGINS.SPLIT_PART;
    }
    if (meta.isDelta || meta.deltaBase) {
      return ORIGINS.DELTA;
    }
    if (record.role === 'output') {
      return ORIGINS.CONVERTED;
    }
    return ORIGINS.UPLOAD;
  }

  it('v1 source role → upload', () => {
    expect(migrateRoleToOrigin({ role: 'source', metadata: {} })).toBe(ORIGINS.UPLOAD);
  });

  it('v1 output role → converted', () => {
    expect(migrateRoleToOrigin({ role: 'output', metadata: {} })).toBe(ORIGINS.CONVERTED);
  });

  it('分卷标记 metadata 优先 → split-part', () => {
    expect(migrateRoleToOrigin({ role: 'output', metadata: { partIndex: 2, partTotal: 5 } })).toBe(ORIGINS.SPLIT_PART);
    expect(migrateRoleToOrigin({ role: 'source', metadata: { isSplitPart: true } })).toBe(ORIGINS.SPLIT_PART);
  });

  it('增量补丁标记 → delta', () => {
    expect(migrateRoleToOrigin({ role: 'output', metadata: { isDelta: true } })).toBe(ORIGINS.DELTA);
    expect(migrateRoleToOrigin({ role: 'output', metadata: { deltaBase: 'base.zip' } })).toBe(ORIGINS.DELTA);
  });

  it('分卷优先于增量（同时存在时）', () => {
    expect(migrateRoleToOrigin({ role: 'output', metadata: { isDelta: true, partIndex: 1 } })).toBe(ORIGINS.SPLIT_PART);
  });

  it('空 metadata 或无 role → upload 兜底', () => {
    expect(migrateRoleToOrigin({ role: 'source' })).toBe(ORIGINS.UPLOAD);
    expect(migrateRoleToOrigin({})).toBe(ORIGINS.UPLOAD);
  });
});

// saveFile 的 origin 越界门禁（P2）：非法值回落 migrateRoleToOrigin 并 logger.warn 一次。
describe('saveFile origin 枚举校验', () => {
  const g = globalThis;
  const savedWindow = g.window;
  let stored;
  let warnSpy;

  beforeEach(async () => {
    stored = [];
    const store = {
      put: (rec) => {
        stored.push({ ...rec });
        const putReq = {};
        queueMicrotask(() => { if (putReq.onsuccess) putReq.onsuccess(); });
        return putReq;
      },
    };
    const db = {
      transaction: () => ({
        objectStore: () => store,
      }),
    };
    const openRequest = { result: db, error: null };
    const fakeIDB = {
      open: () => {
        queueMicrotask(() => {
          if (openRequest.onsuccess) openRequest.onsuccess({ target: { result: db } });
        });
        return openRequest;
      },
    };
    g.window = { indexedDB: fakeIDB };
    vi.resetModules();
    const { logger } = await import('../src/core/logger.js');
    logger.clear();
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (warnSpy) warnSpy.mockRestore();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
    vi.resetModules();
  });

  it('合法 origin 原样落库，不告警', async () => {
    const { saveFile } = await import('../src/storage/db.js');
    await saveFile({ id: 'a', name: 'a.zip', origin: ORIGINS.HOST_EXPORT, blob: new Blob([]) });
    expect(stored[0].origin).toBe(ORIGINS.HOST_EXPORT);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('非法 origin（如 demo）回落 migrateRoleToOrigin 并 warn 一次', async () => {
    const { saveFile } = await import('../src/storage/db.js');
    await saveFile({ id: 'b', name: 'b.zip', origin: 'demo', role: 'source', blob: new Blob([]) });
    expect(stored[0].origin).toBe(ORIGINS.UPLOAD);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].join(' ')).toContain('demo');
  });

  it('未传 origin 时按 role 推断且 warn 次数为零', async () => {
    const { saveFile } = await import('../src/storage/db.js');
    await saveFile({ id: 'c', name: 'c.zip', role: 'output', blob: new Blob([]) });
    expect(stored[0].origin).toBe(ORIGINS.CONVERTED);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
