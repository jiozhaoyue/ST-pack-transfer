/**
 * 传输分片与断点台账（纯函数）
 *
 * 存在原因：S3 / WebDAV 两侧都需要同一套「怎么切、切了哪些、还缺哪些」的判定。
 * 两处各写一份必然在边界（空文件 / 整除 / 尾片）与断点续传上分叉。
 *
 * 分层约束：`src/core/`，禁止 DOM / fetch / 平台判断。
 */

export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
export const MIN_CHUNK_SIZE = 1024 * 1024;
export const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

/** 分片大小归一到 [1 MiB, 64 MiB]，非法值回落 8 MiB。 */
export function normalizeChunkSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CHUNK_SIZE;
  return Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, Math.round(n)));
}

/**
 * 把总字节切成连续分片。
 * 空文件返回空数组（调用方需自行处理「零字节对象」）。
 * @param {number} totalBytes
 * @param {number} [chunkSize]
 * @returns {Array<{index:number,start:number,end:number,size:number}>}
 */
export function planChunks(totalBytes, chunkSize = DEFAULT_CHUNK_SIZE) {
  const total = Math.max(0, Math.trunc(Number(totalBytes) || 0));
  const size = normalizeChunkSize(chunkSize);
  const chunks = [];
  for (let start = 0; start < total; start += size) {
    const end = Math.min(total, start + size);
    chunks.push({ index: chunks.length, start, end, size: end - start });
  }
  return chunks;
}

/** 分片对象名：`pack.zip.part000`。 */
export function chunkKey(baseName, index) {
  return `${String(baseName)}.part${String(Math.trunc(Number(index) || 0)).padStart(3, '0')}`;
}

/** 清单对象名：`pack.zip.manifest.json`。 */
export function manifestKey(baseName) {
  return `${String(baseName)}.manifest.json`;
}

/**
 * 构建清单。`chunks` 只记录索引与大小，避免把整包元数据写得太重。
 * @param {object} params
 * @returns {object}
 */
export function buildManifest({
  name,
  size,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunks = [],
  sha256 = '',
  createdAt = new Date().toISOString(),
}) {
  return {
    schema: 1,
    name: String(name || ''),
    size: Math.max(0, Math.trunc(Number(size) || 0)),
    chunkSize: normalizeChunkSize(chunkSize),
    totalChunks: Array.isArray(chunks) ? chunks.length : 0,
    sha256: String(sha256 || ''),
    createdAt: String(createdAt || ''),
    chunks: (Array.isArray(chunks) ? chunks : []).map((c) => ({
      index: Math.trunc(Number(c.index) || 0),
      size: Math.max(0, Math.trunc(Number(c.size) || 0)),
    })),
  };
}

/**
 * 解析清单；形状不对返回 `null`，调用方不得把它当成「无清单就完整」。
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseManifest(raw) {
  const obj = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!obj || typeof obj !== 'object') return null;
  if (obj.schema !== 1) return null;
  if (!Array.isArray(obj.chunks)) return null;
  const size = Number(obj.size);
  if (!Number.isFinite(size) || size < 0) return null;
  const chunkSize = normalizeChunkSize(obj.chunkSize);
  const chunks = obj.chunks
    .filter((c) => c && Number.isFinite(Number(c.index)) && Number.isFinite(Number(c.size)))
    .map((c) => ({ index: Number(c.index), size: Number(c.size) }));
  return {
    schema: 1,
    name: String(obj.name || ''),
    size,
    chunkSize,
    totalChunks: chunks.length,
    sha256: String(obj.sha256 || ''),
    createdAt: String(obj.createdAt || ''),
    chunks,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 断点续传判定：`present` 是目标端已确认存在的分片索引。
 * @param {{totalBytes:number, chunkSize?:number, present?:number[]}} params
 * @returns {{chunks:Array, missing:Array, complete:boolean}}
 */
export function resumePlan({ totalBytes, chunkSize = DEFAULT_CHUNK_SIZE, present = [] } = {}) {
  const chunks = planChunks(totalBytes, chunkSize);
  const done = new Set((Array.isArray(present) ? present : []).map((n) => Math.trunc(Number(n))));
  const missing = chunks.filter((c) => !done.has(c.index));
  return { chunks, missing, complete: chunks.length > 0 && missing.length === 0 };
}

/**
 * 增量判定：只看证据，不猜。
 *
 * - 远端不存在 ⇒ 必须上传；
 * - 大小不同 ⇒ 必须上传；
 * - 双方都有 sha256 且相同 ⇒ 跳过；
 * - 双方都有 etag 且相同 ⇒ 跳过；
 * - 只有大小相同但无哈希 ⇒ `unverified`，默认**不跳**（宁可重传，不假成功）。
 * @param {{size:number,sha256?:string,etag?:string}} local
 * @param {{size:number,sha256?:string,etag?:string}|null|undefined} remote
 * @returns {{skip:boolean,reason:string}}
 */
export function incrementalVerdict(local, remote) {
  if (!remote) return { skip: false, reason: 'remote-missing' };
  const localSize = Number(local?.size) || 0;
  const remoteSize = Number(remote?.size) || 0;
  if (localSize !== remoteSize) return { skip: false, reason: 'size-mismatch' };
  const localSha = String(local?.sha256 || '');
  const remoteSha = String(remote?.sha256 || '');
  if (localSha && remoteSha && localSha === remoteSha) return { skip: true, reason: 'sha256-match' };
  const localEtag = String(local?.etag || '');
  const remoteEtag = String(remote?.etag || '');
  if (localEtag && remoteEtag && localEtag === remoteEtag) return { skip: true, reason: 'etag-match' };
  return { skip: false, reason: 'unverified' };
}
