/**
 * 浏览器 storage provider —— 只读，照 Luker `browser-storage-inspector.js` 的 L0 五类与下钻。
 *
 * 与宿主无关：localStorage / sessionStorage 自算字节，IndexedDB / Cache Storage 只枚举
 * 名称与条目数（浏览器不提供单库大小 ⇒ `sizeBytes: null`，界面显示 `?`）。
 * 所有浏览器 API 经参数注入，Node 里可用假对象单测；任何 API 缺失都降级为「该类别无数据」，
 * 绝不抛出、绝不伪造数字。
 */

const ROOT = Object.freeze({ labelKey: 'si.root', path: [] });
const OPEN_TIMEOUT_MS = 3000;

function readGlobal(name) {
  try {
    return globalThis[name];
  } catch {
    return undefined;
  }
}

/** 有界等待：浏览器 API 可能永不 settle（例如被阻塞的 IndexedDB open）。 */
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    Promise.resolve(promise).then(
      (value) => finish(value),
      () => finish(fallback),
    );
  });
}

function storageUsage(storage) {
  if (!storage) return { available: false, bytes: null, count: 0 };
  try {
    const count = Number(storage.length) || 0;
    let bytes = 0;
    for (let i = 0; i < count; i += 1) {
      const key = storage.key(i) || '';
      const value = storage.getItem(key) || '';
      bytes += (key.length + value.length) * 2;
    }
    return { available: true, bytes, count };
  } catch {
    return { available: false, bytes: null, count: 0 };
  }
}

function storageKeys(storage) {
  const out = [];
  if (!storage) return out;
  try {
    const count = Number(storage.length) || 0;
    for (let i = 0; i < count; i += 1) {
      const key = storage.key(i);
      if (key === null || key === undefined) continue;
      const value = storage.getItem(key) || '';
      out.push({
        key: String(key),
        label: String(key),
        icon: 'key',
        kind: 'storage-key',
        categoryKey: null,
        sizeBytes: (String(key).length + value.length) * 2,
        childCount: null,
        canDrill: false,
      });
    }
  } catch {
    return [];
  }
  out.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
  return out;
}

/**
 * @param {{
 *   navigator?: object, localStorage?: object, sessionStorage?: object,
 *   indexedDB?: object, caches?: object,
 * }} [deps]
 */
export function createBrowserStorageProvider(deps = {}) {
  const nav = deps.navigator ?? readGlobal('navigator');
  const local = deps.localStorage ?? readGlobal('localStorage');
  const session = deps.sessionStorage ?? readGlobal('sessionStorage');
  const idb = deps.indexedDB ?? readGlobal('indexedDB');
  const cacheStore = deps.caches ?? readGlobal('caches');

  async function estimate() {
    try {
      const fn = nav?.storage?.estimate;
      if (typeof fn !== 'function') return { usedBytes: null, quotaBytes: null, usageDetails: null, over: false };
      const est = await withTimeout(Promise.resolve(fn.call(nav.storage)), OPEN_TIMEOUT_MS, null);
      if (!est || typeof est !== 'object') return { usedBytes: null, quotaBytes: null, usageDetails: null, over: false };
      const usage = Number(est.usage);
      const quota = Number(est.quota);
      const usedBytes = Number.isFinite(usage) ? usage : null;
      const quotaBytes = Number.isFinite(quota) && quota > 0 ? quota : null;
      return {
        usedBytes,
        quotaBytes,
        usageDetails: est.usageDetails && typeof est.usageDetails === 'object' ? est.usageDetails : null,
        over: quotaBytes !== null && usedBytes !== null && usedBytes > quotaBytes,
      };
    } catch {
      return { usedBytes: null, quotaBytes: null, usageDetails: null, over: false };
    }
  }

  async function listDatabases() {
    try {
      if (!idb || typeof idb.databases !== 'function') return [];
      const list = await withTimeout(Promise.resolve(idb.databases()), OPEN_TIMEOUT_MS, []);
      return Array.isArray(list) ? list.filter((db) => db && db.name) : [];
    } catch {
      return [];
    }
  }

  function openDatabase(name) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (db) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), OPEN_TIMEOUT_MS);
      try {
        const req = idb.open(String(name));
        req.onsuccess = () => finish(req.result);
        req.onerror = () => finish(null);
        req.onblocked = () => finish(null);
        // 不升级：vendor 库若缺失结构，直接放弃这一行，不写用户数据。
        req.onupgradeneeded = () => {
          try {
            req.transaction?.abort();
          } catch {
            /* 忽略 */
          }
        };
      } catch {
        finish(null);
      }
    });
  }

  function countRecords(db, storeName) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).count();
        req.onsuccess = () => resolve(Number(req.result) || 0);
        req.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }

  async function listStoreNames(dbName) {
    const db = await openDatabase(dbName);
    if (!db) return null;
    try {
      return Array.from(db.objectStoreNames || []);
    } catch {
      return [];
    } finally {
      try {
        db.close();
      } catch {
        /* 忽略 */
      }
    }
  }

  async function countStores(dbName) {
    const names = await listStoreNames(dbName);
    return names === null ? null : names.length;
  }

  async function listCacheNames() {
    try {
      if (!cacheStore || typeof cacheStore.keys !== 'function') return [];
      const names = await withTimeout(Promise.resolve(cacheStore.keys()), OPEN_TIMEOUT_MS, []);
      return Array.isArray(names) ? names.map(String) : [];
    } catch {
      return [];
    }
  }

  async function countRequests(name) {
    try {
      const cache = await withTimeout(Promise.resolve(cacheStore.open(name)), OPEN_TIMEOUT_MS, null);
      if (!cache) return 0;
      const keys = await withTimeout(Promise.resolve(cache.keys()), OPEN_TIMEOUT_MS, []);
      return Array.isArray(keys) ? keys.length : 0;
    } catch {
      return 0;
    }
  }

  function category(key, labelKey, icon, sizeBytes, childCount, countUnit) {
    return {
      key,
      labelKey,
      icon,
      kind: 'category',
      categoryKey: key,
      sizeBytes: Number.isFinite(Number(sizeBytes)) && sizeBytes !== null ? Number(sizeBytes) : null,
      childCount: childCount ?? null,
      countUnit: countUnit || '',
      canDrill: (childCount ?? 0) > 0,
    };
  }

  function crumbs(path, lastLabel) {
    const out = [{ ...ROOT }];
    path.forEach((seg, i) => {
      const isCategory = i === 0;
      const crumb = isCategory
        ? { labelKey: `si.cat.${seg}`, path: path.slice(0, i + 1) }
        : { label: lastLabel ?? seg, path: path.slice(0, i + 1) };
      out.push(crumb);
    });
    return out;
  }

  function response(quota, path, breadcrumbs, entries, isLeaf) {
    return {
      path,
      breadcrumbs,
      quota: quota
        ? { usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes, over: quota.over }
        : null,
      entries,
      isLeaf,
    };
  }

  async function root(quota) {
    const ls = storageUsage(local);
    const ss = storageUsage(session);
    const dbs = await listDatabases();
    const cacheNames = await listCacheNames();
    const details = quota.usageDetails || {};
    const detailNumber = (name) => (Number.isFinite(Number(details[name])) ? Number(details[name]) : null);
    const entries = [
      category('localStorage', 'si.cat.localStorage', 'hard-drive', ls.bytes, ls.count, 'keys'),
      category('sessionStorage', 'si.cat.sessionStorage', 'clock', ss.bytes, ss.count, 'keys'),
      category('indexeddb', 'si.cat.indexeddb', 'database', detailNumber('indexedDB'), dbs.length, 'dbs'),
      category('cachestorage', 'si.cat.cachestorage', 'layer-group', detailNumber('caches'), cacheNames.length, 'caches'),
      {
        key: 'quota',
        labelKey: 'si.cat.quota',
        icon: 'chart-pie',
        kind: 'category',
        categoryKey: 'quota',
        sizeBytes: quota.usedBytes,
        childCount: null,
        countUnit: '',
        canDrill: false,
      },
    ];
    return response(quota, [], [{ ...ROOT }], entries, false);
  }

  async function storagePath(quota, kind, rest, storage) {
    if (rest.length !== 0) throw pathError(`${kind} has no drilldown beyond L2`);
    const entries = storageKeys(storage).map((e) => ({ ...e, categoryKey: kind }));
    return response(
      quota,
      [kind],
      crumbs([kind]),
      entries,
      true,
    );
  }

  async function indexedDbPath(quota, rest) {
    if (rest.length === 0) {
      const dbs = await listDatabases();
      const entries = [];
      for (const db of dbs) {
        const storeCount = await countStores(db.name);
        entries.push({
          key: String(db.name),
          label: String(db.name),
          icon: 'database',
          kind: 'idb-db',
          categoryKey: 'indexeddb',
          sizeBytes: null,
          childCount: storeCount,
          countUnit: 'stores',
          canDrill: (storeCount ?? 0) > 0,
        });
      }
      return response(quota, ['indexeddb'], crumbs(['indexeddb']), entries, false);
    }
    if (rest.length !== 1) throw pathError('IndexedDB has no drilldown beyond L3');
    const dbName = String(rest[0]);
    const db = await openDatabase(dbName);
    if (!db) throw pathError(`Cannot open ${dbName}`);
    const entries = [];
    try {
      for (const storeName of Array.from(db.objectStoreNames || [])) {
        const records = await countRecords(db, storeName);
        entries.push({
          key: String(storeName),
          label: String(storeName),
          icon: 'table',
          kind: 'idb-store',
          categoryKey: 'indexeddb',
          sizeBytes: null,
          childCount: records,
          countUnit: 'records',
          canDrill: false,
        });
      }
    } finally {
      try {
        db.close();
      } catch {
        /* 忽略 */
      }
    }
    return response(quota, ['indexeddb', dbName], crumbs(['indexeddb', dbName], dbName), entries, true);
  }

  async function cacheStoragePath(quota, rest) {
    if (rest.length !== 0) throw pathError('Cache Storage has no drilldown beyond L2');
    const names = await listCacheNames();
    const entries = [];
    for (const name of names) {
      const requests = await countRequests(name);
      entries.push({
        key: name,
        label: name,
        icon: 'file-lines',
        kind: 'cache',
        categoryKey: 'cachestorage',
        sizeBytes: null,
        childCount: requests,
        countUnit: 'requests',
        canDrill: false,
      });
    }
    return response(quota, ['cachestorage'], crumbs(['cachestorage']), entries, true);
  }

  return {
    id: 'browser',
    async fetch(pathArr = []) {
      const path = Array.isArray(pathArr) ? pathArr.map(String) : [];
      const quota = await estimate();
      if (path.length === 0) return root(quota);
      const [cat, ...rest] = path;
      switch (cat) {
        case 'localStorage':
          return storagePath(quota, 'localStorage', rest, local);
        case 'sessionStorage':
          return storagePath(quota, 'sessionStorage', rest, session);
        case 'indexeddb':
          return indexedDbPath(quota, rest);
        case 'cachestorage':
          return cacheStoragePath(quota, rest);
        default:
          throw pathError(`Unknown category: ${cat}`);
      }
    },
  };
}

function pathError(message) {
  const err = new Error(message);
  err.code = 'E_INVALID_PATH';
  return err;
}
