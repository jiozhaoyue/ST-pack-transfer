/**
 * 目标清单对齐与冲突预检（S3 执行层 · 纯判定）。
 *
 * 存在原因：`src/core/migration-target.js` 的 `assessTargetConflicts` 已经会「有清单就真比、没清单就 unknown」，
 * 但它拿到的是**一份路径集合**——集合从哪来、可不可信，不在它的职责内。恢复流程此前一律喂 `null`，
 * 于是冲突**永远**是 `unknown`（`index.js` 的 `buildRestoreGateContext()`）。
 *
 * 本模块补的正是这一层：**先判这份清单能不能拿来比**，再决定是否交给 `assessTargetConflicts`。
 *
 * ⚠️ 核心不变量（`migration-safety-and-evidence.md` §3.2）：
 * **伪报「0 冲突 / 全部新增」比报 `unknown` 更危险**——前者会让用户跳过「同名可能被更新」的风险确认。
 * 因此凡无法确认清单与待写入集合**词汇一致**的场合，一律降级 `unknown`。
 *
 * 分层：`src/core/`（无 DOM、无网络、无宿主依赖），可在 Node/Vitest 直接测。
 * 归一路径（原始条目名 → hub 路径）**不在这里**——那是布局知识，归 `transform.js` 的 `routeSource`。
 */

import { assessTargetConflicts, CONFLICT_STATES } from './migration-target.js';

/** 对齐判定五态（外加「根本没跑预检」）。只有 `ALIGNED` 允许给出真实冲突数。 */
export const ALIGNMENT = Object.freeze({
  ALIGNED: 'aligned',
  PARTIAL: 'partial',
  MISMATCH: 'mismatch',
  TRUNCATED: 'truncated',
  EMPTY: 'empty',
  NOT_RUN: 'not-run',
});

/**
 * 一次**全量**宿主备份必然含有的根标记之一。四者全无 ⇒ 这份清单多半被选择过滤过，不可信。
 * 见 `alignInventories` 判据第 3 条。
 */
const STANDARD_ROOT_MARKERS = Object.freeze(['characters', 'chats', 'settings.json', 'secrets.json']);

/** 单条路径归一：NFKC + 反斜杠 + 去前导 `./` + 小写（与 `migration-target.js` 的比较口径一致）。 */
function normalizePath(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

/** 路径的顶层段：`a/b/c` → `a`；根文件 `settings.json` → `settings.json` 自身。 */
function topSegment(normalizedPath) {
  const i = normalizedPath.indexOf('/');
  return i < 0 ? normalizedPath : normalizedPath.slice(0, i);
}

/** 归一一个清单数组（去目录条目 / 空串 / 非串；去重；排序保证确定性）。 */
function normalizeList(entries) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(entries) ? entries : []) {
    const value = raw && typeof raw === 'object' ? raw.name : raw;
    if (typeof value !== 'string') continue;
    const norm = normalizePath(value);
    if (!norm || norm.endsWith('/')) continue; // 空 / 目录条目
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out.sort();
}

/**
 * 由条目清单构造目标清单。
 *
 * `entries` 既接受字符串数组，也接受 `readZipEntryManifest()` 的原样输出（`{name, crc32, …}[]`）。
 * 归一为**排序后**的 hub 路径集合，故同一份包在任何机器上得到同一清单（可快照断言）。
 *
 * 超出 `maxPaths` 时**截断并置 `truncated`** —— 截断清单比出的冲突数不完整，调用方必须据此降级
 * （见 `alignInventories` 判据第 1 条），**不得**当作「清单就这么多」。
 *
 * @param {Array<string|{name?: string}>|null|undefined} entries
 * @param {{maxPaths?: number}} [opts]
 * @returns {{paths: string[], count: number, truncated: boolean}}
 */
export function buildTargetManifest(entries, { maxPaths = 100_000 } = {}) {
  const all = normalizeList(entries);
  const limit = Number.isFinite(maxPaths) && maxPaths >= 0 ? Math.floor(maxPaths) : all.length;
  const truncated = all.length > limit;
  const paths = truncated ? all.slice(0, limit) : all;
  return { paths, count: paths.length, truncated };
}

/**
 * 对齐判据：这份目标清单能不能与「本次将写入的条目」比较？
 *
 * 判据**按序**（先命中先返回）：
 *  1. `truncated` —— 清单被上限截断，比较结果不完整 ⇒ `truncated`；
 *  2. 目标清单为空 ⇒ `empty`（「读到了但里面什么都没有」仍不是「0 冲突」）；
 *  3. 待写入为空 ⇒ `aligned`（没有要写的东西，就不存在冲突可言）；
 *  4. 目标清单缺**全部**标准根标记 ⇒ `partial`（多半是被选择过滤过的备份）；
 *  5. 待写入的某个顶层段不在目标清单的顶层段集合里 ⇒ `mismatch`；
 *  6. 其余 ⇒ `aligned`。
 *
 * 第 5 条对「目标确实没有这个新类目」也会保守降级 —— **刻意选择保守**：无法区分
 * 「目标没有」与「清单不全」时，宁可 `unknown`（用户仍可显式确认风险），不可伪报无冲突。
 *
 * @param {{targetPaths?: string[], incomingPaths?: string[], truncated?: boolean}} [input]
 * @returns {{state: string, reason: string}}
 */
export function alignInventories({ targetPaths, incomingPaths, truncated = false } = {}) {
  const target = normalizeList(targetPaths);
  const incoming = normalizeList(incomingPaths);

  if (truncated) {
    return { state: ALIGNMENT.TRUNCATED, reason: '目标清单超出条目上限被截断，无法完整比较' };
  }
  if (target.length === 0) {
    return { state: ALIGNMENT.EMPTY, reason: '目标清单为空，无法判断同名条目' };
  }
  if (incoming.length === 0) {
    return { state: ALIGNMENT.ALIGNED, reason: '' };
  }

  const targetTops = new Set(target.map(topSegment));
  if (!STANDARD_ROOT_MARKERS.some((marker) => targetTops.has(marker))) {
    return {
      state: ALIGNMENT.PARTIAL,
      reason: '目标清单缺少全部标准根标记（characters/chats/settings.json/secrets.json），清单可能不完整',
    };
  }

  const missing = [...new Set(incoming.map(topSegment))].filter((seg) => !targetTops.has(seg));
  if (missing.length > 0) {
    return {
      state: ALIGNMENT.MISMATCH,
      reason: `目标清单中不存在本次将写入的顶层段：${missing.join('、')}（清单与本次写入不是同一套词汇）`,
    };
  }

  return { state: ALIGNMENT.ALIGNED, reason: '' };
}

/**
 * 对齐 + 真实比较。**只有 `aligned` 才把清单交给 `assessTargetConflicts`**。
 *
 * 非 `aligned` 时直接复用 `assessTargetConflicts({ targetManifest: null })` 的返回值
 * ——冲突语义与呈现保持**单一来源**（不重写一份 unknown）。
 *
 * @param {object} [input]
 * @param {{paths?: string[], truncated?: boolean}|null} [input.targetManifest] `buildTargetManifest` 的产物
 * @param {string[]} [input.incomingPaths] 本次将写入的条目（hub 路径）
 * @returns {{state: string, conflictCount: number|null, newCount: number|null, conflicts: string[],
 *            alignment: string, alignmentReason: string}}
 */
export function assessInventoryConflicts({ targetManifest, incomingPaths } = {}) {
  if (!targetManifest || !Array.isArray(targetManifest.paths)) {
    return {
      ...assessTargetConflicts({ targetManifest: null }),
      alignment: ALIGNMENT.NOT_RUN,
      alignmentReason: '未执行目标预检',
    };
  }

  const incoming = normalizeList(incomingPaths);
  const alignment = alignInventories({
    targetPaths: targetManifest.paths,
    incomingPaths: incoming,
    truncated: targetManifest.truncated === true,
  });

  if (alignment.state !== ALIGNMENT.ALIGNED) {
    return {
      ...assessTargetConflicts({ targetManifest: null }),
      alignment: alignment.state,
      alignmentReason: alignment.reason,
    };
  }

  return {
    ...assessTargetConflicts({ targetManifest: { paths: targetManifest.paths }, incomingPaths: incoming }),
    alignment: ALIGNMENT.ALIGNED,
    alignmentReason: '',
  };
}

export { CONFLICT_STATES };
