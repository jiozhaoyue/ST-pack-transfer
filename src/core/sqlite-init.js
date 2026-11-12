/**
 * sql.js 惰性加载器（唯一入口）。
 *
 * 采用**内联 WASM** 构建（`src/vendor/sqljs/sql-wasm-inline.js`）：
 * - 单文件自包含，不需要 `locateFile`、不需要 fetch wasm、不需要构建期 asset 路径；
 * - 浏览器主线程 / Web Worker / Node(Vitest) 三处走同一条路径（`L1-MR-6`）。
 *
 * 只在真正需要 SQLite 时才动态 import —— Vite 会把它切成独立 chunk，
 * 不用 SQLite 的转换不会付这 964 KB 的代价。
 */

let pending = null;

/** @returns {Promise<any>} sql.js 的 `SQL` 模块（带 `Database` 构造函数）。 */
export function loadSqlJs() {
  if (!pending) {
    pending = import('../vendor/sqljs/sql-wasm-inline.js').then(async (mod) => {
      const initSqlJs = mod?.default || mod;
      if (typeof initSqlJs !== 'function') {
        throw new Error('sql.js 初始化失败：vendor 模块未导出初始化函数');
      }
      return initSqlJs({});
    });
  }
  return pending;
}

/** 测试用：清掉缓存（生产路径不需要）。 */
export function resetSqlJsForTests() {
  pending = null;
}
