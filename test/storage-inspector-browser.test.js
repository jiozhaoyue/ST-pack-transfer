import { describe, expect, it } from 'vitest';
import { createBrowserStorageProvider } from '../src/ui/storage-inspector-browser.js';

function fakeStorage(entries) {
  const keys = Object.keys(entries);
  return {
    get length() { return keys.length; },
    key(i) { return keys[i] ?? null; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(entries, k) ? entries[k] : null; },
    setItem(k, v) { entries[k] = String(v); if (!keys.includes(k)) keys.push(k); },
  };
}

function fakeIdb(dbs) {
  return {
    databases: async () => Object.keys(dbs).map((name) => ({ name })),
    open(name) {
      const req = {};
      queueMicrotask(() => {
        const stores = dbs[name];
        if (!stores) {
          req.onerror?.();
          return;
        }
        req.result = {
          objectStoreNames: stores,
          close() {},
          transaction() {
            return {
              objectStore() {
                return {
                  count() {
                    const r = {};
                    queueMicrotask(() => {
                      r.result = 3;
                      r.onsuccess?.();
                    });
                    return r;
                  },
                };
              },
            };
          },
        };
        req.onsuccess?.();
      });
      return req;
    },
  };
}

function fakeCaches(names) {
  return {
    keys: async () => names.slice(),
    open: async () => ({ keys: async () => [{}, {}] }),
  };
}

function makeProvider(overrides = {}) {
  return createBrowserStorageProvider({
    navigator: {
      storage: {
        estimate: async () => ({
          usage: 1000,
          quota: 0,
          usageDetails: { indexedDB: 400, caches: 300 },
        }),
      },
    },
    localStorage: fakeStorage({ a: 'bb' }),
    sessionStorage: fakeStorage({}),
    indexedDB: fakeIdb({ dbA: ['store1', 'store2'], dbB: ['store3'] }),
    caches: fakeCaches(['cache-a']),
    ...overrides,
  });
}

describe('storage-inspector-browser · L0 四类', () => {
  it('根层固定四类，配额只在面板头', async () => {
    const resp = await makeProvider().fetch([]);
    expect(resp.entries.map((e) => e.key))
      .toEqual(['localStorage', 'sessionStorage', 'indexeddb', 'cachestorage']);
    expect(resp.entries.some((e) => e.key === 'quota')).toBe(false);
    expect(resp.isLeaf).toBe(false);
    expect(resp.breadcrumbs).toEqual([{ labelKey: 'si.root', path: [] }]);
  });

  it('localStorage 字节自算（UTF-16 近似），条目数可见', async () => {
    const resp = await makeProvider().fetch([]);
    const ls = resp.entries.find((e) => e.key === 'localStorage');
    expect(ls.sizeBytes).toBe((1 + 2) * 2);
    expect(ls.childCount).toBe(1);
    expect(ls.canDrill).toBe(true);
    expect(ls.labelKey).toBe('si.cat.localStorage');
  });

  it('IndexedDB / Cache Storage 用浏览器分项总量，配额为 0 时视为未知', async () => {
    const resp = await makeProvider().fetch([]);
    const idb = resp.entries.find((e) => e.key === 'indexeddb');
    const caches = resp.entries.find((e) => e.key === 'cachestorage');
    expect(idb.sizeBytes).toBe(400);
    expect(idb.childCount).toBe(2);
    expect(caches.sizeBytes).toBe(300);
    expect(caches.childCount).toBe(1);
    expect(resp.quota).toEqual({ usedBytes: 1000, quotaBytes: null, over: false });
  });

  it('配额读数只走响应头，不伪装成分类条目', async () => {
    const resp = await makeProvider().fetch([]);
    expect(resp.quota).toEqual({ usedBytes: 1000, quotaBytes: null, over: false });
  });

  it('estimate 不可用时不伪造数字（size 为 null）', async () => {
    const resp = await makeProvider({ navigator: {} }).fetch([]);
    expect(resp.entries.find((e) => e.key === 'indexeddb').sizeBytes).toBeNull();
    expect(resp.entries.find((e) => e.key === 'cachestorage').sizeBytes).toBeNull();
    expect(resp.entries.some((e) => e.key === 'quota')).toBe(false);
    expect(resp.quota).toEqual({ usedBytes: null, quotaBytes: null, over: false });
  });
});

describe('storage-inspector-browser · 下钻', () => {
  it('localStorage 按键列出、按大小降序', async () => {
    const provider = makeProvider({
      localStorage: fakeStorage({ small: 'x', big: 'yyyyyyyy' }),
    });
    const resp = await provider.fetch(['localStorage']);
    expect(resp.isLeaf).toBe(true);
    expect(resp.entries.map((e) => e.key)).toEqual(['big', 'small']);
    expect(resp.entries[0].sizeBytes).toBe((3 + 8) * 2);
    expect(resp.breadcrumbs[1]).toMatchObject({ labelKey: 'si.cat.localStorage', path: ['localStorage'] });
  });

  it('IndexedDB 列出库名与表数，再下一层列出记录数', async () => {
    const provider = makeProvider();
    const dbs = await provider.fetch(['indexeddb']);
    expect(dbs.entries.map((e) => e.key)).toEqual(['dbA', 'dbB']);
    expect(dbs.entries[0].childCount).toBe(2);
    expect(dbs.entries[0].countUnit).toBe('stores');
    expect(dbs.entries[0].sizeBytes).toBeNull();

    const stores = await provider.fetch(['indexeddb', 'dbA']);
    expect(stores.isLeaf).toBe(true);
    expect(stores.entries.map((e) => e.key)).toEqual(['store1', 'store2']);
    expect(stores.entries[0].childCount).toBe(3);
    expect(stores.entries[0].countUnit).toBe('records');
    expect(stores.breadcrumbs[2]).toMatchObject({ label: 'dbA', path: ['indexeddb', 'dbA'] });
  });

  it('Cache Storage 列出缓存名与请求数', async () => {
    const resp = await makeProvider().fetch(['cachestorage']);
    expect(resp.isLeaf).toBe(true);
    expect(resp.entries.map((e) => e.key)).toEqual(['cache-a']);
    expect(resp.entries[0].childCount).toBe(2);
    expect(resp.entries[0].countUnit).toBe('requests');
  });

  it('未知类目与越级下钻一律 E_INVALID_PATH', async () => {
    const provider = makeProvider();
    await expect(provider.fetch(['nope'])).rejects.toMatchObject({ code: 'E_INVALID_PATH' });
    await expect(provider.fetch(['localStorage', 'deeper'])).rejects.toMatchObject({ code: 'E_INVALID_PATH' });
    await expect(provider.fetch(['cachestorage', 'deeper'])).rejects.toMatchObject({ code: 'E_INVALID_PATH' });
  });

  it('只读：provider 不提供任何删除入口', () => {
    const provider = makeProvider();
    expect(provider.deleteAtPath).toBeUndefined();
    expect(Object.keys(provider).sort()).toEqual(['fetch', 'id']);
  });
});
