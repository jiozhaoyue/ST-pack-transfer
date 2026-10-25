import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * 私有格式仓存储层（vault-store）单测。
 *
 * 双后端各测一路：
 *  · authority：注入**形状逐条对齐真实 SDK** 的 mock client（位置参数 KV、
 *    blob.put 收对象 / get·delete 收 id —— 2026-10-13 实测的签名坑，
 *    见 authority-store.js 头注释），走 authority-store 的真实分块实现；
 *  · indexeddb：vi.mock db.js 的内存实现（Node 无 IndexedDB）。
 */

const dbState = vi.hoisted(() => ({ records: new Map(), supported: true }));

vi.mock('../src/storage/db.js', () => ({
  ORIGINS: Object.freeze({
    UPLOAD: 'upload',
    HOST_EXPORT: 'host-export',
    CONVERTED: 'converted',
    DELTA: 'delta',
    SPLIT_PART: 'split-part',
    SOURCE_BACKUP: 'source-backup',
    REPORT: 'report',
    TARGET_BACKUP: 'target-backup',
    VAULT: 'vault',
  }),
  isStorageSupported: () => dbState.supported,
  saveFile: async ({ id, name, size, blob, origin, metadata }) => {
    if (!dbState.supported) return null;
    const key = id || `rec_${dbState.records.size}`;
    dbState.records.set(key, { id: key, name, size, blob, origin, metadata, createdAt: Date.now() });
    return key;
  },
  getFile: async (id) => dbState.records.get(id) || null,
  deleteFile: async (id) => { dbState.records.delete(id); },
  listStoredFiles: async (_role, originFilter) =>
    [...dbState.records.values()]
      .filter((r) => !originFilter || r.origin === originFilter)
      .map(({ blob, ...rest }) => rest)
      .sort((a, b) => b.createdAt - a.createdAt),
}));

const { __setAuthorityClientForTest } = await import('../src/storage/authority-store.js');
const {
  vaultPut,
  vaultList,
  vaultGet,
  vaultDelete,
  vaultBackend,
  guessVaultFormat,
  normalizeFormatTag,
} = await import('../src/storage/vault-store.js');

/** mock Authority client：KV + blob 内存实现，签名逐条对齐真实 SDK（位置参数！） */
function mockClient() {
  const kv = new Map();
  const blobs = new Map();
  const blobsById = new Map();
  let seq = 0;
  return {
    storage: {
      kv: {
        set: async (key, value) => {
          if (typeof key !== 'string') throw new Error('kv.set 的 key 必须是字符串（位置参数）');
          if (value === undefined) throw new Error('kv.set 的 value 是 undefined（位置参数）');
          kv.set(key, value);
        },
        get: async (key) => kv.get(key) ?? null,
        delete: async (key) => { kv.delete(key); },
      },
      blob: {
        put: async ({ name, content, encoding, contentType }) => {
          if (typeof name !== 'string') throw new Error('blob.put 收 {name,...} 对象');
          seq += 1;
          const id = `blob-${seq}`;
          blobs.set(name, { id, name, content, encoding, contentType });
          blobsById.set(id, { id, name, content, encoding, contentType });
          return { id };
        },
        get: async (id) => {
          if (typeof id !== 'string') throw new Error('blob.get 收 id（位置参数）');
          return blobsById.get(id) || null;
        },
        delete: async (id) => {
          const rec = blobsById.get(id);
          if (rec) { blobs.delete(rec.name); blobsById.delete(id); }
        },
      },
    },
  };
}

beforeEach(() => {
  dbState.records.clear();
  dbState.supported = true;
});

describe('纯函数：格式标签', () => {
  it('guessVaultFormat 按本插件产物命名前缀识别四布局', () => {
    expect(guessVaultFormat('st_Alice_2026.zip')).toBe('st');
    expect(guessVaultFormat('l_default-user_part1.zip')).toBe('l');
    expect(guessVaultFormat('tt_x.zip')).toBe('tt');
    expect(guessVaultFormat('pt_x.zip')).toBe('pt');
    expect(guessVaultFormat('我的私有包.zip')).toBe('raw');
    expect(guessVaultFormat('')).toBe('raw');
  });

  it('normalizeFormatTag 未识别值一律落 raw', () => {
    expect(normalizeFormatTag('st')).toBe('st');
    expect(normalizeFormatTag('native')).toBe('raw');
    expect(normalizeFormatTag(undefined)).toBe('raw');
    expect(normalizeFormatTag(null)).toBe('raw');
  });
});

describe('Authority 后端路径（后端完整存储）', () => {
  beforeEach(() => { __setAuthorityClientForTest(mockClient()); });
  afterEach(() => { __setAuthorityClientForTest(undefined); });

  it('vaultBackend 报告 authority', async () => {
    expect(await vaultBackend()).toBe('authority');
  });

  it('存入→列出→取出：多条目互不覆盖，元数据齐全', async () => {
    const e1 = await vaultPut({ name: 'st_包A.zip', blob: new Blob([new Uint8Array([1, 2, 3])]), formatTag: 'st' });
    const e2 = await vaultPut({ name: 'tt_private.db', blob: new Blob([new Uint8Array([9, 8, 7, 6])]), note: 'TT 原生包' });
    expect(e1.id).not.toBe(e2.id);
    expect(e1.formatTag).toBe('st');
    expect(e2.formatTag).toBe('tt');
    expect(e2.note).toBe('TT 原生包');
    expect(e1.logical.startsWith('vault:')).toBe(true);

    const list = await vaultList();
    expect(list.map((e) => e.name).sort()).toEqual(['st_包A.zip', 'tt_private.db'].sort());
    expect(list.every((e) => e.backend === 'authority')).toBe(true);
  });

  it('roundtrip 字节精确：含 >4MB 跨块文件（4MB 分块边界）', async () => {
    const chunk4mb = 4 * 1024 * 1024;
    const big = new Uint8Array(chunk4mb + 12345);
    big[0] = 0xaa; big[chunk4mb] = 0x55; big[big.length - 1] = 0xff;
    const entry = await vaultPut({ name: 'big.bin', blob: new Blob([big]) });
    expect(entry.size).toBe(big.length);
    expect(entry.chunks).toBeGreaterThanOrEqual(2);

    const full = await vaultGet(entry.id);
    expect(full).not.toBeNull();
    expect(full.blob.size).toBe(big.length);
    const out = new Uint8Array(await full.blob.arrayBuffer());
    expect(out.length).toBe(big.length);
    expect(out[0]).toBe(0xaa);
    expect(out[chunk4mb]).toBe(0x55);
    expect(out[out.length - 1]).toBe(0xff);
  });

  it('删除一个条目不影响其余（数据+元数据+索引同步清理）', async () => {
    const e1 = await vaultPut({ name: 'keep.zip', blob: new Blob(['keep-bytes']) });
    const e2 = await vaultPut({ name: 'drop.zip', blob: new Blob(['drop-bytes']) });
    expect(await vaultDelete(e2.id)).toBe(true);

    const list = await vaultList();
    expect(list.map((e) => e.id)).toEqual([e1.id]);
    expect(await vaultGet(e2.id)).toBeNull();
    const kept = await vaultGet(e1.id);
    expect(await kept.blob.text()).toBe('keep-bytes');
  });

  it('取出时字节数不符要抛错（完全存储的完整性读数）', async () => {
    const entry = await vaultPut({ name: 'x.zip', blob: new Blob(['12345678']) });
    // 白盒篡改条目元数据的 size，模拟后端数据损坏 → 取出必须抛错而不是静默给坏数据
    const { authorityKvSet } = await import('../src/storage/authority-store.js');
    await authorityKvSet(`vault-entry:${entry.id}`, { ...entry, size: entry.size + 1 });
    await expect(vaultGet(entry.id)).rejects.toThrow('字节数不符');
  });

  it('同名文件可多次存入（唯一 id，不覆盖）', async () => {
    const a = await vaultPut({ name: 'same.zip', blob: new Blob(['v1']) });
    const b = await vaultPut({ name: 'same.zip', blob: new Blob(['v2-更长的内容']) });
    expect(a.id).not.toBe(b.id);
    const list = await vaultList();
    expect(list.filter((e) => e.name === 'same.zip')).toHaveLength(2);
    expect(await (await vaultGet(b.id)).blob.text()).toBe('v2-更长的内容');
    expect(await (await vaultGet(a.id)).blob.text()).toBe('v1');
  });
});

describe('IndexedDB 降级路径（Authority 不可用）', () => {
  beforeEach(() => { __setAuthorityClientForTest(null); });

  it('vaultBackend 报告 indexeddb', async () => {
    expect(await vaultBackend()).toBe('indexeddb');
  });

  it('存取列删全链路 + origin=vault 过滤', async () => {
    const e = await vaultPut({ name: 'l_本地包.zip', blob: new Blob(['idb-bytes']), formatTag: 'l' });
    expect(e.backend).toBe('indexeddb');
    expect(dbState.records.get(e.id).origin).toBe('vault');

    const list = await vaultList();
    expect(list).toHaveLength(1);
    expect(list[0].formatTag).toBe('l');

    const full = await vaultGet(e.id);
    expect(await full.blob.text()).toBe('idb-bytes');

    expect(await vaultDelete(e.id)).toBe(true);
    expect(await vaultList()).toHaveLength(0);
  });

  it('formatTag 缺省按文件名猜', async () => {
    const e = await vaultPut({ name: 'pt_纯前端包.zip', blob: new Blob(['x']) });
    expect(e.formatTag).toBe('pt');
  });
});

describe('两层都不可用', () => {
  beforeEach(() => {
    __setAuthorityClientForTest(null);
    dbState.supported = false;
  });

  it('vaultBackend 返回 null，put 返回 null，list 空，delete false', async () => {
    expect(await vaultBackend()).toBeNull();
    expect(await vaultPut({ name: 'x.zip', blob: new Blob(['x']) })).toBeNull();
    expect(await vaultList()).toEqual([]);
    expect(await vaultDelete('any')).toBe(false);
    expect(await vaultGet('any')).toBeNull();
  });
});
