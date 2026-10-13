/**
 * Worker 构造的唯一落点。
 *
 * 抽出来是为了让**离线单文件构建**能在构建期把它换成空实现
 * （`scripts/build-offline.mjs` 用 `resolve.alias` 指向 `scripts/offline/worker-factory.stub.js`）。
 *
 * 为什么不靠运行期判据：`new URL('./converter-worker.js', import.meta.url)` 是 **Vite 的
 * 编译期语法**（`vite:worker-import-meta-url`），IIFE 单包构建会直接失败
 * （"UMD and IIFE output formats are not supported for code-splitting builds"），
 * 即运行期根本到不了——必须在构建期把它换掉。
 *
 * 运行期判据（`__ST_ZIP_OFFLINE__`）仍保留在 `worker-client.js`：它管的是
 * "即便拿到了 worker 实例也不要用"，与"能不能构造"是两件事。
 *
 * @returns {Worker|null} 不支持 Worker 的环境返回 `null`
 */
export function createConverterWorker() {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./converter-worker.js', import.meta.url), { type: 'module' });
}
