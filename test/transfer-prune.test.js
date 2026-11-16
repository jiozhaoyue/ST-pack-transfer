import { describe, expect, it } from 'vitest';
import { chunkKey, manifestKey } from '../src/core/transfer-plan.js';
import { pruneFullSnapshots } from '../src/core/transfer-prune.js';

/**
 * 全量快照修剪（full 模式「保留最近 N 份」）的单测。
 * 2026-11-14 从 index.js 抽到 src/core/transfer-prune.js 后建立——此前该逻辑零测试覆盖。
 * 判定口径：清单条目识别快照；排序键 = 清单 createdAt，缺了回落条目 lastModified；
 * 列表不可用 ⇒ 跳过修剪（不阻断备份）。
 * 快照基名与真实落盘一致（transfer-runner）：`<pack>.zip` + `.partNNN` + `.manifest.json`。
 */

/** 内存版传输目标：list/get/remove/put 的最小实现，键→{bytes,lastModified}。 */
function fakeTarget(seed = new Map()) {
  const store = new Map(seed);
  return {
    store,
    async list(prefix) {
      const items = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ key: k, lastModified: store.get(k).lastModified || '' }));
      return { ok: true, items };
    },
    async get(key) {
      const hit = store.get(key);
      return hit ? { ok: true, bytes: hit.bytes } : { ok: false };
    },
    async remove(key) {
      return { ok: store.delete(key) };
    },
    async put(key, bytes) {
      store.set(key, { bytes, lastModified: '' });
      return { ok: true };
    },
  };
}

const manifestJson = (createdAt) => JSON.stringify({
  schema: 1, name: 'pack.zip', size: 3, chunkSize: 8388608,
  createdAt, chunks: [{ index: 0, size: 3 }],
});

/** 预置 N 张快照（names 按时间旧→新），每张带 manifest + 1 个分片 + 1 个包体键。 */
function seedSnapshots(names, { createdAtOf } = {}) {
  const seed = new Map();
  for (const name of names) {
    const base = `snapshots/${name}`;
    seed.set(manifestKey(base), {
      bytes: new TextEncoder().encode(manifestJson(createdAtOf ? createdAtOf(name) : name)),
      lastModified: createdAtOf ? createdAtOf(name) : name,
    });
    seed.set(chunkKey(base, 0), { bytes: new TextEncoder().encode('abc'), lastModified: '' });
    seed.set(base, { bytes: new TextEncoder().encode('RAW'), lastModified: '' });
  }
  return seed;
}

describe('transfer-prune 全量快照修剪（2026-11-14 抽出 + 补测）', () => {
  it('keep=2 时四张快照保留最新两张，最旧两张连同分片与清单被删', async () => {
    const target = fakeTarget(seedSnapshots(['s1.zip', 's2.zip', 's3.zip', 's4.zip']));
    const res = await pruneFullSnapshots({ target, keep: 2 });
    expect(res.ok).toBe(true);
    expect(res.removed).toEqual(['snapshots/s2.zip', 'snapshots/s1.zip']);

    for (const name of ['s1.zip', 's2.zip']) {
      const base = `snapshots/${name}`;
      expect(target.store.has(manifestKey(base))).toBe(false);
      expect(target.store.has(chunkKey(base, 0))).toBe(false);
    }
    for (const name of ['s3.zip', 's4.zip']) {
      const base = `snapshots/${name}`;
      expect(target.store.has(manifestKey(base))).toBe(true);
      expect(target.store.has(chunkKey(base, 0))).toBe(true);
    }
  });

  it('修剪只动快照自身，不碰快照之外的键（备份集对象 / 最新快照）', async () => {
    const target = fakeTarget(seedSnapshots(['s1.zip', 's2.zip', 's3.zip']));
    target.store.set('sets/default/objects/abc', { bytes: new TextEncoder().encode('shared'), lastModified: '' });
    const res = await pruneFullSnapshots({ target, keep: 1 });
    expect(res.ok).toBe(true);
    expect(res.removed).toEqual(['snapshots/s2.zip', 'snapshots/s1.zip']);
    expect(target.store.has('sets/default/objects/abc')).toBe(true);
    expect(target.store.has(manifestKey('snapshots/s3.zip'))).toBe(true);
  });

  it('清单缺 createdAt 时回落条目 lastModified 排序（不伪造时间）', async () => {
    const target = fakeTarget(seedSnapshots(['s1.zip', 's2.zip'], {
      createdAtOf: (n) => (n === 's2.zip' ? '2026-11-14T10:00:00Z' : ''),
    }));
    const res = await pruneFullSnapshots({ target, keep: 1 });
    expect(res.ok).toBe(true);
    expect(res.removed).toEqual(['snapshots/s1.zip']);
    expect(target.store.has(manifestKey('snapshots/s2.zip'))).toBe(true);
  });

  it('目标无 list 能力 ⇒ 跳过修剪（不阻断备份）', async () => {
    const res = await pruneFullSnapshots({
      target: { get: async () => ({ ok: false }), remove: async () => ({ ok: true }) },
      keep: 2,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('list-unavailable');
  });

  it('list 失败时透传原因码，同样跳过', async () => {
    const target = fakeTarget();
    target.list = async () => ({ ok: false, code: 'propfind-denied' });
    const res = await pruneFullSnapshots({ target, keep: 2 });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('propfind-denied');
  });

  it('清单条目之外的对象（如裸分片）不计入保留判定', async () => {
    const target = fakeTarget(seedSnapshots(['s1.zip']));
    target.store.set(chunkKey('snapshots/s1.zip', 1), { bytes: new TextEncoder().encode('x'), lastModified: '' });
    const res = await pruneFullSnapshots({ target, keep: 5 });
    expect(res.ok).toBe(true);
    expect(res.removed).toEqual([]);
    expect(target.store.has(chunkKey('snapshots/s1.zip', 1))).toBe(true);
    expect(target.store.has(manifestKey('snapshots/s1.zip'))).toBe(true);
  });

  it('keep 非法输入的两种回落：0/NaN → 默认 10（不清空）；负数 → 收敛 1（至少留最新）', async () => {
    const t0 = fakeTarget(seedSnapshots(['s1.zip', 's2.zip']));
    const res0 = await pruneFullSnapshots({ target: t0, keep: 0 });
    expect(res0.ok).toBe(true);
    expect(res0.removed).toEqual([]);
    expect(t0.store.has(manifestKey('snapshots/s1.zip'))).toBe(true);
    expect(t0.store.has(manifestKey('snapshots/s2.zip'))).toBe(true);

    const tn = fakeTarget(seedSnapshots(['s1.zip', 's2.zip']));
    const resN = await pruneFullSnapshots({ target: tn, keep: -3 });
    expect(resN.ok).toBe(true);
    expect(resN.removed).toEqual(['snapshots/s1.zip']);
    expect(tn.store.has(manifestKey('snapshots/s2.zip'))).toBe(true);
    expect(tn.store.has(manifestKey('snapshots/s1.zip'))).toBe(false);
  });
});
