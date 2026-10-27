/**
 * IndexedDB 存储适配层 (零额外依赖，纯原生 Promise 封装)
 * 提供数据包暂存、会话工作区记忆、用户偏好持久化与存储容量统计。
 *
 * DB_VERSION 2 (ui-unify)：files store 增加 origin/group 字段，
 * 支持统一工作区单列表按来源分类（上传/宿主导出/转换生成/增量补丁/分卷）。
 * 旧 v1 记录在 onupgradeneeded 中按 role 映射 origin，升级无损。
 */

import { SESSION_SCHEMA_VERSION } from '../core/migration-session.js';

const DB_NAME = 'st_zip_converter_db';
const DB_VERSION = 2;

const STORES = {
  FILES: 'files',
  WORKSPACE: 'workspace',
  PREFERENCES: 'preferences',
};

/**
 * 数据包来源枚举（单列表来源徽标）
 * upload        用户上传/拖入的源包
 * host-export   宿主酒馆拉取的数据
 * converted     转换生成的产物
 * delta         增量补丁包（基于基准 ZIP 差量）
 * split-part    智能分卷切片（组内关联）
 * export-copy   导出区副本复制回导入区后的独立副本（与源解耦，删除互不影响）
 * vault         历史私有格式仓条目（旧 vault-store 写入；模块 2026-10-27 已删除，
 *               该取值仅用于读取旧记录，不再产生新条目）
 */
export const ORIGINS = Object.freeze({
  UPLOAD: 'upload',
  HOST_EXPORT: 'host-export',
  LAN: 'lan',
  CONVERTED: 'converted',
  DELTA: 'delta',
  SPLIT_PART: 'split-part',
  EXPORT_COPY: 'export-copy',
  SOURCE_BACKUP: 'source-backup',
  REPORT: 'report',
  TARGET_BACKUP: 'target-backup',
  VAULT: 'vault',
});

/**
 * v1 role → v2 origin 迁移映射
 * v1 metadata 中带分卷/增量标记的记录优先归类
 */
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

/**
 * 归一化记录：v1 残留记录（升级中断等）在读取时兜底补齐 origin 字段
 */
function normalizeRecord(record) {
  if (!record) return record;
  if (!record.origin) {
    record.origin = migrateRoleToOrigin(record);
  }
  return record;
}

let dbInstance = null;

/**
 * 检查当前环境是否支持 IndexedDB
 * @returns {boolean}
 */
export function isStorageSupported() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * 打开或获取数据库单例连接
 * @returns {Promise<IDBDatabase|null>}
 */
export async function openDb() {
  if (!isStorageSupported()) return null;
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.FILES)) {
        db.createObjectStore(STORES.FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.WORKSPACE)) {
        db.createObjectStore(STORES.WORKSPACE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.PREFERENCES)) {
        db.createObjectStore(STORES.PREFERENCES, { keyPath: 'key' });
      }

      // v1 → v2：为存量记录补 origin/group/createdAt
      if (event.oldVersion < 2) {
        const store = event.target.transaction.objectStore(STORES.FILES);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (!cursor) return;
          const record = cursor.value;
          if (!record.origin) {
            record.origin = migrateRoleToOrigin(record);
            if (!record.createdAt) record.createdAt = Date.now();
            cursor.update(record);
          }
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.warn('打开 IndexedDB 失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 通用事务 Promise 执行包装
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @param {function(IDBObjectStore): IDBRequest} operation
 * @returns {Promise<any>}
 */
async function runTransaction(storeName, mode, operation) {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 暂存上传的原始数据包或生成包
 * @param {object} item
 * @param {string} [item.id] 唯一标识
 * @param {string} item.name 文件名
 * @param {number} [item.size] 字节数
 * @param {Blob|File} item.blob 实际二进制数据
 * @param {string} [item.layout] 识别出的布局
 * @param {'source'|'output'} [item.role='source'] 文件角色
 * @param {object} [item.metadata] 附加元数据
 * @returns {Promise<string|null>}
 */
/**
 * 大 Blob 写入序列化队列：
 * 大包 put 会占据 IndexedDB 事务与磁盘 IO，多个大包同时写会造成写入抖动与
 * 事件循环长任务。所有 saveFile 请求进入单队列串行执行，调用方 promise 语义
 * 不变（await 到自己那条写完），但避免与压缩/转换热路径同时争抢 IO。
 */
let writeQueue = Promise.resolve();
const LARGE_BLOB_THRESHOLD = 16 * 1024 * 1024; // 16MB 以上视为大包，走队列

/**
 * 暂存上传的原始数据包或生成包
 * @param {object} item
 * @param {string} [item.id] 唯一标识
 * @param {string} item.name 文件名
 * @param {number} [item.size] 字节数
 * @param {Blob|File} item.blob 实际二进制数据
 * @param {string} [item.layout] 识别出的布局
 * @param {'source'|'output'} [item.role='source'] 文件角色（v1 兼容字段）
 * @param {string} [item.origin] 来源标记 (ORIGINS 枚举)，未提供时按 role 推断
 * @param {string} [item.group] 分卷组/增量链归属 id
 * @param {object} [item.metadata] 附加元数据
 * @returns {Promise<string|null>}
 */
export async function saveFile({ id, name, size, blob, layout, role = 'source', origin, group = null, metadata = {} }) {
  if (!isStorageSupported()) return null;
  const fileId = id || `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id: fileId,
    name,
    size: size || blob?.size || 0,
    blob,
    layout: layout || 'unknown',
    role,
    origin: origin || migrateRoleToOrigin({ role, metadata }),
    group,
    metadata,
    createdAt: Date.now(),
  };

  const doPut = () => runTransaction(STORES.FILES, 'readwrite', (store) => store.put(record));

  if (record.size >= LARGE_BLOB_THRESHOLD) {
    // 大包串行排队：前一个大包写完再写下一个，IO 与转换管线解耦
    const task = writeQueue.then(doPut, doPut);
    writeQueue = task.catch(() => {});
    await task;
  } else {
    await doPut();
  }
  return fileId;
}

/**
 * 获取暂存数据包记录
 * @param {string} id
 * @returns {Promise<{id: string, name: string, size: number, blob: Blob, layout: string, role: string, origin: string, group: string|null, metadata: object}|null>}
 */
export async function getFile(id) {
  if (!isStorageSupported() || !id) return null;
  const record = await runTransaction(STORES.FILES, 'readonly', (store) => store.get(id));
  return normalizeRecord(record);
}

/**
 * 删除指定暂存的数据包
 * @param {string} id
 */
export async function deleteFile(id) {
  if (!isStorageSupported() || !id) return;
  return runTransaction(STORES.FILES, 'readwrite', (store) => store.delete(id));
}

/**
 * 获取暂存文件清单（不含 blob 大对象）
 * @param {'source'|'output'|null} [roleFilter] v1 兼容过滤
 * @param {string|null} [originFilter] v2 来源过滤 (ORIGINS 枚举)
 * @returns {Promise<Array<{id: string, name: string, size: number, layout: string, role: string, origin: string, group: string|null, metadata: object, createdAt: number}>>}
 */
export async function listStoredFiles(roleFilter = null, originFilter = null) {
  if (!isStorageSupported()) return [];
  const db = await openDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILES, 'readonly');
    const store = tx.objectStore(STORES.FILES);
    const list = [];
    const cursorReq = store.openCursor();

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const val = normalizeRecord(cursor.value);
        const role = val.role || 'source';
        const origin = val.origin || ORIGINS.UPLOAD;
        const roleOk = !roleFilter || role === roleFilter;
        const originOk = !originFilter || origin === originFilter;
        if (roleOk && originOk) {
          list.push({
            id: val.id,
            name: val.name,
            size: val.size,
            layout: val.layout,
            role,
            origin,
            group: val.group || null,
            metadata: val.metadata || {},
            createdAt: val.createdAt,
          });
        }
        cursor.continue();
      } else {
        resolve(list.sort((a, b) => b.createdAt - a.createdAt));
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * 获取所有已上传/暂存的源包
 */
export async function listSourceFiles() {
  return listStoredFiles('source');
}

/**
 * 获取所有已转换生成的产物包
 */
export async function listOutputFiles() {
  return listStoredFiles('output');
}

/**
 * 统计暂存用量（含按来源分组明细，供用量看板渲染）
 * @returns {Promise<{ count: number, totalBytes: number, byOrigin: Record<string, {count: number, totalBytes: number}> }>}
 */
export async function getStorageUsage() {
  const files = await listStoredFiles();
  let totalBytes = 0;
  const byOrigin = {};
  for (const f of files) {
    totalBytes += (f.size || 0);
    const bucket = byOrigin[f.origin] || (byOrigin[f.origin] = { count: 0, totalBytes: 0 });
    bucket.count += 1;
    bucket.totalBytes += (f.size || 0);
  }
  return {
    count: files.length,
    totalBytes,
    byOrigin,
  };
}

/**
 * 查询浏览器存储配额（用量看板配额条）
 * @returns {Promise<{ usage: number, quota: number }>}
 */
export async function getStorageQuota() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return { usage: 0, quota: 0 };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

/**
 * 构造要落盘的 `active_session` 记录（**纯函数**，供单测直接验证版本签名）。
 *
 * `schemaVersion` 强制为当前值，且**位于展开之后**——调用方传入同名字段也无法覆盖，
 * 避免"旧会话对象带着自己的 schemaVersion 被原样存回去"。
 *
 * @param {object} state
 * @param {number} [updatedAt=Date.now()]
 * @returns {object}
 */
export function buildWorkspaceRecord(state, updatedAt = Date.now()) {
  return {
    key: 'active_session',
    ...state,
    schemaVersion: SESSION_SCHEMA_VERSION,
    updatedAt,
  };
}

/**
 * 保存工作区状态（当前正在处理的文件、目标平台、类目选择与排除列表）。
 *
 * 写入时**强制带上当前会话版本签名**（`SESSION_SCHEMA_VERSION`）——这是 U-1（2026-10-13）
 * 「禁止兼容旧数据」的写入侧：没有签名的记录下一次读取即被判为不兼容。
 *
 * 覆盖前仍把现有 `active_session` 备份为 `active_session_prev`：那是**不丢用户数据**，
 * 与「兼容旧格式」是两件事（备份保留，格式照样作废）。
 *
 * @param {object} state
 */
export async function saveWorkspaceState(state) {
  if (!isStorageSupported()) return;
  const existing = await loadWorkspaceState();
  if (existing) {
    await runTransaction(STORES.WORKSPACE, 'readwrite',
      (store) => store.put({ ...existing, key: 'active_session_prev' }));
  }
  return runTransaction(STORES.WORKSPACE, 'readwrite', (store) => store.put(buildWorkspaceRecord(state)));
}

/**
 * 加载工作区状态。**原样返回**——不迁移、不清除、不补齐字段。
 * 兼容判定是上层的事（`classifySessionCompatibility`），本层不替用户做「猜着兼容」。
 *
 * @returns {Promise<object|null>}
 */
export async function loadWorkspaceState() {
  if (!isStorageSupported()) return null;
  return runTransaction(STORES.WORKSPACE, 'readonly', (store) => store.get('active_session'));
}

/**
 * 保存用户全局偏好
 * @param {object} preferences
 */
export async function savePreferences(preferences) {
  if (!isStorageSupported()) return;
  const record = {
    key: 'user_preferences',
    ...preferences,
    updatedAt: Date.now(),
  };
  return runTransaction(STORES.PREFERENCES, 'readwrite', (store) => store.put(record));
}

/**
 * 读取用户全局偏好
 * @returns {Promise<object|null>}
 */
export async function loadPreferences() {
  if (!isStorageSupported()) return null;
  return runTransaction(STORES.PREFERENCES, 'readonly', (store) => store.get('user_preferences'));
}

/**
 * 清空所有暂存文件与工作区数据
 */
export async function clearAll() {
  if (!isStorageSupported()) return;
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.FILES, STORES.WORKSPACE], 'readwrite');
    tx.objectStore(STORES.FILES).clear();
    tx.objectStore(STORES.WORKSPACE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
