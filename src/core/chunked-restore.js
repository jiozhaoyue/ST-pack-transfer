/**
 * 分片恢复上传的纯逻辑（Luker 原生协议）。
 *
 * 事实依据（2026-11-10 对照 Dev Luker 源码）：
 * - `POST   /api/users/restore-backup/uploads`            {handle, fileName, size} → {uploadId}
 * - `PUT    /api/users/restore-backup/uploads/{id}/chunks/{offset}`  application/octet-stream
 * - `POST   /api/users/restore-backup/uploads/{id}/finalize`          → {size}
 * - `POST   /api/users/restore-backup`                    {uploadId, handle, mode, selection}
 *
 * 分片 8 MiB 是为了穿过反向代理的单请求体上限（Cloudflare 100 MB）；
 * 413 时减半（最低 256 KiB），网络/5xx/429 重试 3 次（1/2/4 秒）。
 *
 * 本模块只做决策与请求体构造，不做 fetch —— `src/ui/host-bridge.js` 负责网络与宿主差异。
 */

export const RESTORE_UPLOAD_BASE = '/api/users/restore-backup/uploads';
export const RESTORE_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
export const RESTORE_UPLOAD_MIN_CHUNK_SIZE = 256 * 1024;
export const RESTORE_UPLOAD_MAX_RETRIES = 3;
export const RESTORE_UPLOAD_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000]);

/** 分片端点不存在（旧版 Luker / 非 Luker 宿主）时回退整包 POST。 */
export function isChunkEndpointMissing(status) {
  return status === 404 || status === 405;
}

/** 413 且还能继续减半时返回新长度，否则返回 null（到下限）。 */
export function halveChunkLength(length, min = RESTORE_UPLOAD_MIN_CHUNK_SIZE) {
  if (!Number.isFinite(length) || length <= min) return null;
  return Math.max(min, Math.floor(length / 2));
}

/** 该 HTTP 状态或网络错误是否值得重试（4xx 除 429 外不重试）。 */
export function shouldRetryStatus(status) {
  if (!status) return true; // 网络错误 / 超时
  if (status === 429) return true;
  return status >= 500;
}

/** 第 attempt 次重试前的等待毫秒（attempt 从 1 开始）。 */
export function retryDelayMs(attempt, delays = RESTORE_UPLOAD_RETRY_DELAYS_MS) {
  const i = Math.max(0, Math.min((Number(attempt) || 1) - 1, delays.length - 1));
  return delays[i] || 0;
}

/** 初始化上传会话的请求体。 */
export function buildUploadSessionBody({ handle, fileName = 'backup.zip', size }) {
  return JSON.stringify({ handle, fileName, size });
}

/** 触发恢复的请求体（**不含文件体**，文件已在服务端组装）。 */
export function buildRestoreBody({ uploadId, handle, mode = 'merge', selection = null }) {
  return JSON.stringify({ uploadId, handle, mode, selection: selection || {} });
}

/** 按 offset/length 生成分片计划（供测试与进度展示）。 */
export function planChunks(size, chunkSize = RESTORE_UPLOAD_CHUNK_SIZE) {
  const total = Math.max(0, Number(size) || 0);
  const step = Math.max(1, Number(chunkSize) || RESTORE_UPLOAD_CHUNK_SIZE);
  const out = [];
  for (let offset = 0; offset < total; offset += step) {
    out.push({ offset, length: Math.min(step, total - offset) });
  }
  return out;
}
