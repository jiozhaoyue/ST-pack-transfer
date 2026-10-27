/**
 * Authority 后端可选适配器（ST-Delegation-of-authority 服务端插件）
 *
 * 探测 window.STAuthority（由宿主的 st-authority-sdk 扩展注入），不可用时全部
 * 接口安全降级返回 null/false，调用方无需分支处理。能力定位：存储与续传层
 * （大包持久暂存、断点 checkpoint），不迁移转换计算（Authority jobs 仅内置类型）。
 *
 * 复用约定：
 * - createCheckpointAdapter() 实现与 task-manager.js 持久化 adapter 相同的
 *   { save, load, remove } 接缝，注入 TaskManager 即接管断点持久化。
 * - blob 分块：storage.blob 为 base64 编码，大文件按 CHUNK_SIZE 切块落盘，
 *   清单（manifest）存 KV，读时按块重组，避免单请求超限与 base64 内存峰值。
 */

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB/块
const KV_MANIFEST_PREFIX = 'blob-manifest:';
const KV_CHECKPOINT_PREFIX = 'task-checkpoint:';

/** 测试注入钩子（生产路径不使用） */
let testClient = undefined;

/**
 * 探测并初始化 Authority client（结果缓存）
 * @returns {Promise<object|null>} client 或 null（未安装/未授权/初始化失败）
 */
export async function getAuthorityClient() {
  if (testClient !== undefined) return testClient;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const sdk = window.STAuthority && window.STAuthority.AuthoritySDK;
  if (!sdk) return null;
  try {
    return await sdk.init({
      extensionId: 'third-party/ST-pack-transfer',
      displayName: '数据包转运',
      version: '1.0.0',
      installType: 'local',
      declaredPermissions: {
        fs: { private: true },
        storage: { kv: true, blob: true },
      },
    });
  } catch (err) {
    console.warn('[authority-store] Authority 初始化失败，降级为本地存储:', err);
    return null;
  }
}

/** @private 测试专用：注入 mock client，传 undefined 恢复真实探测 */
export function __setAuthorityClientForTest(client) {
  testClient = client;
}

/** @returns {boolean} Authority 是否可用（同步粗探，最终以 getAuthorityClient 为准） */
export function isAuthorityAvailable() {
  if (testClient !== undefined) return testClient !== null;
  return typeof window !== 'undefined'
    && !!(window.STAuthority && window.STAuthority.AuthoritySDK);
}

// ===== KV 基础封装 =====
//
// ⚠️ **签名是位置参数，不是对象**（2026-10-13 实测取证，本仓曾整体调错）：
// `st-authority-sdk/client.js` 里 `kv.get/set/delete` 的定义是
// `get: async (key)` / `set: async (key, value)` / `delete: async (key)`。
// 早先本文件按 `set({ key, value })` 调用 ⇒ `key` 收到一个对象、`value` 是 `undefined`
// ⇒ 请求体里**没有 `value`** ⇒ 服务端 serde 报
// `missing field \`value\`` / HTTP **422** `validation_error`，**每一次 KV 调用都失败**。
// 单测没抓到是因为 `authority-store.test.js` 注入的是**自写 mock**（形状与真 SDK 不一致）
// ——「mock 与真实 API 漂移」的教科书形态（`L1-MR-5`：API 事实以官方实现为准）。

/** Authority KV 单值上限：core `crates/authority-core/src/constants.rs` 的 `MAX_KV_VALUE_BYTES` */
const KV_VALUE_LIMIT = 128 * 1024;

async function kvSet(client, key, value) {
  await client.storage.kv.set(key, value);
}

async function kvGet(client, key) {
  // SDK 已解包：`get(key)` 返回 `response.value`（`client.js` 的 kv.get）。
  // 只对**单键** `{value}` 形状再做一次兼容解包（防 SDK 版本回退成包装形态）；
  // 多键对象（本仓的清单）**原样返回** —— 否则业务字段名恰为 `value` 时会被误剥。
  const res = await client.storage.kv.get(key);
  if (res && typeof res === 'object' && !Array.isArray(res)
    && Object.keys(res).length === 1 && 'value' in res) return res.value ?? null;
  return res ?? null;
}

async function kvDelete(client, key) {
  await client.storage.kv.delete(key);
}

/**
 * 剥掉断点清单里的**冗余条目台账**，只留续传必需的指针与游标。
 *
 * 为什么可以剥：跳过一个条目的充分条件是「**半成品里真有它的字节**」
 * （`transform.js` 的 `appendedNames`），台账只是**冗余校验**
 * （见 `.trellis/spec/frontend/state-management.md` §8）⇒ 丢了它只会让
 * 「跨会话续传」少一层校验、退化为完整重做，**不会漏条目**。
 * @param {object} manifest
 * @returns {object}
 */
function slimCheckpoint(manifest) {
  if (!manifest || typeof manifest !== 'object') return manifest;
  const out = { ...manifest };
  delete out.doneEntries;
  delete out.partialEntries;
  return out;
}

/** 把清单序列化到 Authority KV；超上限时按上述理由精简，仍超则**跳过持久化**并留日志 */
async function kvSetCheckpoint(client, key, manifest) {
  const json = JSON.stringify(manifest);
  if (json && json.length > KV_VALUE_LIMIT) {
    const slimJson = JSON.stringify(slimCheckpoint(manifest));
    if (slimJson && slimJson.length <= KV_VALUE_LIMIT) {
      console.warn(`[authority-store] 断点清单 ${json.length} B 超 Authority KV 上限 ${KV_VALUE_LIMIT} B`
        + ` ⇒ 剥掉条目台账后存 ${slimJson.length} B（续传仍由半成品字节判定，不漏条目）`);
      await kvSet(client, key, slimCheckpoint(manifest));
      return;
    }
    // 精简后仍超 ⇒ 不写（写也必被 400 拒），内存断点保留；**必须留痕**，否则是静默降级
    console.warn(`[authority-store] 断点清单 ${json.length} B 精简后仍超 Authority KV 上限`
      + ` ⇒ 本次跳过 Authority 持久化（内存断点仍可用于本会话续传）`);
    return;
  }
  await kvSet(client, key, manifest);
}

// ===== KV 公开接缝（供其它存储模块复用）=====
//
// KV 私有封装在上面，位置参数的坑也在上面注释里——导出这三个薄封装是为了让
// 复用方不必重新踩一遍签名坑。返回值约定：Get 失败/不可用返回 null，
// Set/Delete 不可用返回 false（调用方自行决定降级路径）。

/** @returns {Promise<boolean>} 是否写入成功 */
export async function authorityKvSet(key, value) {
  const client = await getAuthorityClient();
  if (!client) return false;
  await kvSet(client, key, value);
  return true;
}

/** @returns {Promise<*|null>} 值或 null（不存在 / Authority 不可用） */
export async function authorityKvGet(key) {
  const client = await getAuthorityClient();
  if (!client) return null;
  return kvGet(client, key);
}

/** @returns {Promise<boolean>} 是否删除成功 */
export async function authorityKvDelete(key) {
  const client = await getAuthorityClient();
  if (!client) return false;
  await kvDelete(client, key);
  return true;
}

// ===== 断点 checkpoint（TaskManager adapter 接缝）=====

/**
 * 生成 TaskManager 兼容的断点持久化 adapter（Authority KV），不可用时返回 null，
 * 调用方回退默认 adapter（如 task-manager.memoryAdapter）。
 * @returns {Promise<{save,load,remove}|null>}
 */
export async function createCheckpointAdapter() {
  const client = await getAuthorityClient();
  if (!client) return null;
  return {
    async save(id, manifest) {
      await kvSetCheckpoint(client, KV_CHECKPOINT_PREFIX + id, manifest);
    },
    async load(id) {
      return await kvGet(client, KV_CHECKPOINT_PREFIX + id);
    },
    async remove(id) {
      await kvDelete(client, KV_CHECKPOINT_PREFIX + id);
    },
  };
}

// ===== 产物 blob 分块存取 =====

function uint8ToBase64(bytes) {
  let bin = '';
  const STEP = 0x8000; // 分段避免 apply 参数上限
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 同进程内的代际计数（与时间戳组合，保证同一毫秒内的多次写入也互不覆盖） */
let genCounter = 0;

/** 生成写入代际标识（同一产物的不同写入批次互不覆盖，便于失败回滚与新旧隔离） */
function nextGeneration() {
  genCounter += 1;
  return `${Date.now().toString(36)}_${genCounter.toString(36)}`;
}

/** 分块名（含代际，避免新旧批次混写；读取端只认清单，不解析命名） */
function partNameOf(name, gen, index) {
  return `${name}__part_${gen}_${String(index).padStart(6, '0')}`;
}

/** 尽力删除一组分块（用于失败回滚与旧代际清理；单块失败不阻断） */
async function deleteParts(client, parts) {
  if (!Array.isArray(parts) || typeof client?.storage?.blob?.delete !== 'function') return;
  for (const part of parts) {
    try {
      // ⚠️ 位置参数：`blob.delete(id)`（不是 `delete({id, name})`）—— 同 KV 的签名坑
      await client.storage.blob.delete(part.id);
    } catch { /* 单块删除失败不阻断 */ }
  }
}

/**
 * 分块写入产物到 Authority blob 存储（按块 base64，清单存 KV）——**流式切分，不整包驻留**。
 *
 * 内存模型（审计 F-A / F-C）：按 `blob.stream()` 逐块读取，只持有「不足一块」的余量，
 * 峰值 ≈ `O(CHUNK_SIZE)`，与产物体积无关；不再出现整包 `arrayBuffer()` 与整包 base64 中间串。
 *
 * 失败清理与新旧隔离（审计 F-D / F-F）：
 * 1. 逐块写入**新代际**分块名（`__part_<gen>_<NNNNNN>`）；
 * 2. 全部成功后写清单（清单里的 `parts` 指向新代际）；
 * 3. 清单写入成功后，按**旧清单记录的 parts** 删除旧代际分块（不解析命名规律）；
 * 4. 任一步失败 → 删除本次已写分块后抛错；清单仍指向旧代际，旧数据保持可读。
 *
 * @param {string} name 逻辑名（同名单块覆盖，隔离由 Authority 按用户+扩展保证）
 * @param {Blob|File} blob 产物
 * @param {{ chunkSize?: number, onProgress?: (done:number,total:number)=>void }} [opts]
 * @returns {Promise<{ name: string, size: number, chunks: number }|null>} null=Authority 不可用
 */
export async function putArtifact(name, blob, opts = {}) {
  const client = await getAuthorityClient();
  if (!client) return null;
  const chunkSize = opts.chunkSize || CHUNK_SIZE;
  const contentType = blob.type || 'application/octet-stream';
  const size = blob.size || 0;
  // 分块总数由声明体积预先算出（不必先读完整包才知道长度）
  const total = Math.max(1, Math.ceil(size / chunkSize));
  const gen = nextGeneration();
  const parts = [];
  let writtenBytes = 0;

  /**
   * 写出一个完整分块。
   * @param {Uint8Array} bytes 恰好 chunkSize（末块可短）
   */
  const putBlock = async (bytes) => {
    const index = parts.length;
    const partName = partNameOf(name, gen, index);
    const content = uint8ToBase64(bytes);
    const put = await client.storage.blob.put({
      name: partName,
      content,
      encoding: 'base64',
      contentType,
    });
    // put 返回形状未固化：优先用返回 id，否则按名读取
    const id = (put && typeof put === 'object' && (put.id ?? put.blobId)) || partName;
    parts.push({ id, name: partName });
    if (opts.onProgress) opts.onProgress(parts.length, total);
  };

  try {
    const reader = blob.stream().getReader();
    let pending = new Uint8Array(chunkSize);
    let pendingLen = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (value && value.length > 0) {
        let offset = 0;
        while (offset < value.length) {
          const room = chunkSize - pendingLen;
          const take = Math.min(room, value.length - offset);
          pending.set(value.subarray(offset, offset + take), pendingLen);
          pendingLen += take;
          offset += take;
          writtenBytes += take;
          // 填满一块即写出并释放
          if (pendingLen === chunkSize) {
            await putBlock(pending);
            pending = new Uint8Array(chunkSize);
            pendingLen = 0;
          }
        }
      }
      if (done) break;
    }
    // 余量（末块）
    if (pendingLen > 0 || parts.length === 0) {
      await putBlock(pending.subarray(0, pendingLen));
    }
  } catch (err) {
    // 回滚：删除本次已写分块，清单不动 → 旧代际数据仍可读
    await deleteParts(client, parts);
    throw err;
  }

  const manifest = {
    name,
    size: writtenBytes,
    contentType,
    chunkSize,
    chunks: parts.length,
    parts,
    gen,
    savedAt: Date.now(),
  };

  // 旧代际清理：读旧清单 → 写新清单 → 删旧块（顺序不可颠倒）
  // **读旧清单也必须在 try 内**：读失败同样不得留下孤儿块（与「任一步失败即回滚」一致）
  let previous = null;
  try {
    previous = await kvGet(client, KV_MANIFEST_PREFIX + name);
    await kvSet(client, KV_MANIFEST_PREFIX + name, manifest);
  } catch (err) {
    // 清单读/写失败：本次分块成为孤儿 → 清理后抛错；清单未改，旧代际数据仍可读
    await deleteParts(client, parts);
    throw err;
  }
  if (previous && Array.isArray(previous.parts)) {
    await deleteParts(client, previous.parts);
  }

  return { name, size: writtenBytes, chunks: parts.length };
}

/**
 * 读取分块产物并重组为 Blob
 *
 * 内存模型（审计 F-C）：边读边产出**分块 Blob**，最后交给 `new Blob([...])` 由浏览器
 * 管理底层存储；**不再**把全部块先拼成一份整包 `Uint8Array`（少一次整包拷贝）。
 * @returns {Promise<Blob|null>} null=不存在或 Authority 不可用
 */
export async function getArtifact(name) {
  const client = await getAuthorityClient();
  if (!client) return null;
  const manifest = await kvGet(client, KV_MANIFEST_PREFIX + name);
  if (!manifest || !Array.isArray(manifest.parts)) return null;
  const chunkBlobs = [];
  for (const part of manifest.parts) {
    // ⚠️ 位置参数：`blob.get(id)`（不是 `get({id, name})`）；返回 `{record, content, encoding:'base64'}`
    const got = await client.storage.blob.get(part.id);
    // 兼容多种返回形状：base64 字符串 / { content } / ArrayBuffer|Uint8Array / Blob
    let chunkBytes = null;
    if (typeof got === 'string') {
      chunkBytes = base64ToUint8(got);
    } else if (got && typeof got === 'object') {
      const raw = got.content ?? got.data ?? got.bytes ?? got;
      if (typeof raw === 'string') {
        chunkBytes = base64ToUint8(raw);
      } else if (raw instanceof Blob) {
        // 已经是 Blob：直接入列，省去一次字节拷贝
        chunkBlobs.push(raw);
        continue;
      } else if (raw instanceof ArrayBuffer) {
        chunkBytes = new Uint8Array(raw);
      } else if (raw && raw.buffer instanceof ArrayBuffer) {
        chunkBytes = new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength);
      }
    }
    if (!chunkBytes) return null;
    chunkBlobs.push(chunkBytes);
  }
  return new Blob(chunkBlobs, { type: manifest.contentType || 'application/octet-stream' });
}

/**
 * 产物入库时镜像归档到 Authority（fire-and-forget 语义，错误只告警不阻断）
 * Authority 不可用时静默跳过；同名覆盖（最新产物为准）。
 * @param {string} name 逻辑名
 * @param {Blob|File} blob 产物
 * @returns {Promise<boolean>} 是否成功镜像
 */
export async function mirrorArtifact(name, blob) {
  try {
    const res = await putArtifact(name, blob);
    if (res) {
      console.info(`[authority-store] 产物已归档到 Authority: ${name} (${(res.size / 1048576).toFixed(1)} MB, ${res.chunks} 块)`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[authority-store] 产物镜像失败（不影响本地入库）: ${name}`, err);
    return false;
  }
}

/**
 * 删除产物（清单 + 全部分块）
 * @returns {Promise<boolean>}
 */
export async function deleteArtifact(name) {
  const client = await getAuthorityClient();
  if (!client) return false;
  const manifest = await kvGet(client, KV_MANIFEST_PREFIX + name);
  await deleteParts(client, manifest?.parts);
  await kvDelete(client, KV_MANIFEST_PREFIX + name);
  return true;
}
