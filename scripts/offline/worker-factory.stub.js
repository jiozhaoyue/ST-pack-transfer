/**
 * 离线单文件构建的 Worker 构造替身（**只在 `scripts/build-offline.mjs` 的构建期被 alias 进来**）。
 *
 * `file://` 下没有可用的 Worker：module worker 被 CORS 拒，且 IIFE 单包里
 * `import.meta.url` 不可解析。返回 `null` 让 `worker-client.js` 走既有主线程降级，
 * 而不是"构造一个必然失败的 Worker"。
 *
 * @returns {null}
 */
export function createConverterWorker() {
  return null;
}
