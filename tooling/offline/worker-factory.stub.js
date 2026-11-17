/**
 * 离线单文件构建的 Worker 工厂空实现（只供 tooling/build-offline.mjs 的构建期 alias 使用）。
 *
 * `file://` 下没有可用的 Worker：module worker 会被 CORS 拒绝，IIFE 构建里
 * `import.meta.url` 也无法解析出可用地址（得到 `null`）。worker-client.js 见到
 * `null` 会走主线程降级——这比“创建一个必然失败的 Worker”更稳。
 *
 * @returns {null}
 */
export function createConverterWorker() {
  return null;
}
