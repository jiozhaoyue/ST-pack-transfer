/**
 * 任务运行时（批次 / 断点 / 半成品 / 调试探针）
 *
 * 2026-10-27 从旧控制器抽出：这些是**业务逻辑**，不是界面。
 * 控制器只负责编排，运行时只关心任务生命周期。
 */

import { logger } from '../core/logger.js';
import { TASK_STATES } from '../core/task-manager.js';
import { supportsOpfs, opfsTmpHandle, getRestoreProbe } from '../ui/host-bridge.js';
import { getChatStoreProbe } from '../ui/chat-store-bridge.js';

export const TASK_KINDS = Object.freeze({
  FETCH: 'fetch',
  CONVERT: 'convert',
  CONVERT_BATCH: 'convert-batch',
  RESTORE: 'restore',
});

/** 类型 → id 前缀 */
export const TASK_PREFIX = Object.freeze({
  [TASK_KINDS.FETCH]: 'fetch-',
  [TASK_KINDS.CONVERT]: 'convert-',
  [TASK_KINDS.CONVERT_BATCH]: 'convert-batch-',
  [TASK_KINDS.RESTORE]: 'restore-',
});

/**
 * 从任务 id 反解类型。
 *
 * ⚠️ **必须按前缀长度降序匹配**：`convert-batch-` 与 `convert-` 是**前缀重叠**的，
 * 按声明顺序遍历会让 `convert-batch-<ts>` 被 `convert-` 先吃掉 ⇒ **静默降级成单包语义**
 * （断点字段读不到、恢复走错执行体，且不报错）。
 * 故此处**显式排序**，**不依赖对象字面量的插入顺序** —— 依赖插入顺序的写法
 * 会在有人重排常量时无声失效。
 *
 * @param {string} id
 * @returns {'fetch'|'convert'|'convert-batch'|'restore'|null} 未知 id 返回 null（调用方须 warn，不得静默）
 */
export function taskKindOf(id) {
  if (typeof id !== 'string') return null;
  const entries = Object.entries(TASK_PREFIX).sort((a, b) => b[1].length - a[1].length);
  for (const [kind, prefix] of entries) {
    if (id.startsWith(prefix)) return kind;
  }
  return null;
}

/* ────────────────────── 断点清单节流（单包/批量共用） ────────────────────── */

// 与 `src/core/task-manager.js:23-25` **同源**的节流窗口 —— 不另立一套数字，
// 否则「什么时候落盘」在两处会有两种答案。
const CHECKPOINT_EVERY_ENTRIES = 64;
const CHECKPOINT_EVERY_MS = 2000;

/* ────────────────────── 半成品持久化（真增量续传） ────────────────────── */

/** 半成品文件名（OPFS `fetch-tmp/` 下）：按 taskId 归属，暂停/中止时按归属清理。
 *  ⚠️ **不再加 `convert-` 前缀**：taskId 本身已是 `convert-<ts>`（见 `TASK_PREFIX`），
 *  再加一层会拼出 `convert-convert-<ts>.partial.zip`。 */
export function partialNameFor(taskId) {
  return `${taskId}.partial.zip`;
}

/**
 * OPFS 配额预检：剩余空间放不下半成品（留 10% 余量）时返回 false。
 *
 * 拿不到 `estimate` 时**放行**：量不出来不等于没空间，因为量不出来就退化成「永不持久化」
 * 是**静默的能力退化**，比偶尔写到一半失败更糟。
 * @param {number} bytes
 * @param {any} [nav]
 * @returns {Promise<boolean>}
 */
export async function hasRoomForPartial(bytes, nav = (typeof navigator !== 'undefined' ? navigator : null)) {
  try {
    if (!nav?.storage?.estimate) return true;
    const { quota = 0, usage = 0 } = await nav.storage.estimate();
    if (!quota) return true;
    return (quota - usage) >= bytes * 1.1;
  } catch {
    return true;
  }
}

/**
 * 把中止时的**半成品**持久化到 OPFS，并写下「暂停态专用断点」（`setPauseCheckpoint`）。
 *
 * 这是真增量续传的**持久化段**：没有它，续传只能完整重做 —— 正确但慢。
 * 因此**所有失败路径一律降级为「没有半成品」**并留一行**可观测**日志（`L0-11` / `L1-MR-1`）：
 * 半成品只是加速手段，不是主路径依赖，绝不抛错、绝不阻塞暂停语义。
 *
 * ⚠️ 写入的**顺序**不可颠倒：先落 zip、再写断点 —— 反过来的话，断点会指向一个不存在的半成品，
 * 续传时读不到就只能重做（功能不坏，但白写一次断点）。
 *
 * @param {object} p
 * @param {Blob|null} p.partialBlob 中止时收尾出来的**合法 zip**
 * @param {Array<{name:string,crc32:number|null}>|null} p.manifest 它的条目清单（断点的**真源**）
 * @param {string} p.taskId
 * @param {string} p.target 目标布局（诊断用；真正的续传判据是名字 + 内容能对上）
 * @param {number} p.totalBytes
 * @param {function} p.setPauseCheckpoint `TaskManager.start()` 返回的暂停态写入句柄
 * @param {function} [p.buildCheckpoint] 自定义断点形状（收到 `{name, partialEntries}`，返回要写入的清单）。
 *   缺省写**单包形状**；批量路径必须传它 —— 否则会把 `kind:'batch'` 的批次清单覆盖成单包形状，
 *   批次续传读不到 `itemIndex` / `outputs` ⇒ 静默重跑整批（或误判断点作废）。
 * @param {object} [p.deps] 仅测试注入（默认用真实 OPFS 助手与真实配额探测）
 * @returns {Promise<{ok: boolean, name?: string, reason?: string}>}
 */
export async function persistPartial({
  partialBlob, manifest, partialError = null, taskId, target, totalBytes, setPauseCheckpoint,
  buildCheckpoint = null, deps = {},
}) {
  const {
    opfsTmpHandle: getHandle = opfsTmpHandle,
    supportsOpfs: hasOpfs = supportsOpfs,
    quotaCheck = hasRoomForPartial,
  } = deps;

  if (!partialBlob) {
    // ⚠️ 这一支**必须留痕**：它意味着「暂停收尾没拿到半成品」⇒ 续传会整包重做。
    // 不记的话，用户与排查者都只能看到「跳过 0 项」而不知为何（静默降级同样是缺陷）。
    // `partialError` 是收尾侧（worker）回报的**具体原因**，带上它才可诊断。
    logger.warn(`[转换] 暂停收尾未产出半成品 ⇒ 续传将重做整包（产物仍会完整）`
      + `${partialError ? `，原因: ${partialError}` : ''}`);
    return { ok: false, reason: 'no-partial' };
  }
  if (!hasOpfs()) {
    logger.warn('[转换] 环境不支持 OPFS，无法保留半成品 ⇒ 续传将重做整包（产物仍会完整）');
    return { ok: false, reason: 'no-opfs' };
  }
  if (!(await quotaCheck(partialBlob.size))) {
    logger.warn('[转换] 存储配额不足，跳过半成品持久化 ⇒ 续传将重做整包（产物仍会完整）');
    return { ok: false, reason: 'quota' };
  }

  const name = partialNameFor(taskId);
  try {
    const handle = await getHandle(name, true);
    if (!handle) {
      logger.warn('[转换] 半成品文件句柄获取失败 ⇒ 续传将重做整包（产物仍会完整）');
      return { ok: false, reason: 'handle' };
    }
    const writable = await handle.createWritable();
    await writable.write(partialBlob);
    await writable.close();
  } catch (err) {
    logger.warn(`[转换] 半成品落盘失败 ⇒ 续传将重做整包（产物仍会完整）: ${err?.message ?? err}`);
    return { ok: false, reason: 'write-failed' };
  }

  const partialEntries = Array.isArray(manifest) ? manifest : [];
  const checkpoint = typeof buildCheckpoint === 'function'
    ? buildCheckpoint({ name, partialEntries })
    : { partialOpfsName: name, target, partialEntries, totalEntries: totalBytes };
  await setPauseCheckpoint(checkpoint);
  logger.info(`[转换] 已保留半成品 ${name}（${partialEntries.length} 条）—— 续传将原样搬运它，不重压缩、不丢条目`);
  return { ok: true, name };
}

/**
 * 造一个断点清单节流器（转换路径专用）。
 *
 * **为什么必须节流**：`Object.fromEntries(doneEntries)` 是 O(n)。若每个进度回调都建一次对象，
 * n 个条目就是 O(n²) 次属性分配 + 大量短命对象（8683 条目的包 ≈ 7500 万次分配），
 * 制造 GC 压力与长任务（`L1-MR-9` 的相邻风险）。
 * **未到窗口时不建对象** —— 这是与「只在 adapter.save 处节流」的关键差别
 * （后者仍会每 tick materialize 一次）。
 *
 * ⚠️ **首次调用一定落盘**（`lastFlushAt` 初值 0 ⇒ 时间条件立刻成立）—— 这是**载荷属性，别"修掉"**：
 * `TaskManager.pause()` 落盘的是**内存里的 `task.checkpoint`**，而它只在 `onCheckpoint`
 * **被调用时**才更新 ⇒ 若首次调用被节流掉，「任务刚开始就暂停」会因 `checkpoint === null`
 * 而 `resume()` 返回 null ⇒ **无法续传**（正是 R-16 的形态）。
 * 该行为与 `src/core/task-manager.js` 自身的节流一致（其时间条件同样在首调用成立）。
 *
 * **方向纪律（不可颠倒）**：快照**只含已完成条目**。滞后窗口 ≤63 条 ⇒ 续传时这 ≤63 条被**重做**（安全）；
 * 若让快照**超前**（把未完成的条目算进去）⇒ 续传时被**错误跳过** ⇒ **产物缺条目**。
 *
 * **必须挂在 `onProgress` 上**：`runConversionTask` 的 `onEntryDone` 只在**主线程降级**分支触发，
 * Worker 路径（= 真浏览器）**永不触发**（见 `src/core/worker-client.js:89` 的 JSDoc）
 * ⇒ 只挂 `onEntryDone` 会让断点在浏览器里永不落盘、`npm test` 却全绿。
 *
 * @param {function} onCheckpoint TaskManager.start() 返回的落盘句柄
 * @param {Map<string, number>} doneEntries 已完成条目（**累积中**，本函数只读它的 size 与内容）
 * @returns {function({force?: boolean, totalEntries?: number, bytes?: number}): void}
 */
export function createCheckpointThrottle(onCheckpoint, doneEntries, {
  everyEntries = CHECKPOINT_EVERY_ENTRIES,
  everyMs = CHECKPOINT_EVERY_MS,
  buildManifest = null,
} = {}) {
  let lastFlushAt = 0;
  let lastFlushedSize = -1;
  return function maybeCheckpoint({ force = false, totalEntries = 0, bytes = 0 } = {}) {
    const now = Date.now();
    const due = force
      || doneEntries.size - lastFlushedSize >= everyEntries
      || now - lastFlushAt >= everyMs;
    if (!due) return;
    lastFlushedSize = doneEntries.size;
    lastFlushAt = now;
    const doneObject = Object.fromEntries(doneEntries);
    // ⚠️ 这里造出来的对象会**原样**成为 `task.checkpoint` —— `TaskManager.onCheckpoint` 直接
    // `task.checkpoint = manifest`（`task-manager.js:106`），`pause()` 落盘它（`:142`），
    // `resume()` 还原它（`:186`）。**故它必须承载续传所需的全部状态**。
    // 反面教材（本仓实修过）：此处曾恒为 `{doneEntries, totalEntries}` ⇒ 批量的
    // `itemIndex` / `outputs` / `itemIds` **全被丢掉** ⇒ 续传读不到游标与产物清单
    // ⇒ 失效检测必然判定「数目不符」⇒ **每次续传都作废重跑整批**，跳过语义永不生效。
    const manifest = typeof buildManifest === 'function'
      ? buildManifest(doneObject, { totalEntries })
      : { doneEntries: doneObject, totalEntries };
    void onCheckpoint(manifest, { bytes, force });
  };
}

/* ────────────────── 续传命中的可观测面 ────────────────── */

/**
 * 「本轮沿用了断点」的提示串（`> 0` 才给，避免正常转换被噪音污染）。
 *
 * ⚠️ 字段名是 **`report.totals.resumed`**（计数；`report.resumed` 是命中条目**名单**）。
 * 仓里曾有注释与用例名写作 `resumedCount` —— **该字段从来不存在**（全仓零赋值零读取）。
 * 续传是否真的生效必须**可观测**（E2E 要断言它），故把它显式渲染进完成文案与日志。
 *
 * @param {object} report `convert()` 的 Report（或其 toJSON()）
 * @returns {string} 形如「（沿用断点跳过 2 项）」，无命中时为空串
 */
export function resumedNote(report) {
  const n = report?.totals?.resumed ?? 0;
  return n > 0 ? `（沿用断点跳过 ${n} 项）` : '';
}

/* ────────────────── 转换收尾出口的判定（单一入口） ────────────────── */

/**
 * 转换路径的**收尾出口判定**：给定错误与任务记录，决定走哪个出口。
 *
 * ⚠️ **为什么必须抽出来**：`design.md` 说这是"最容易写错的一处" ——
 * 暂停是**正常用户操作**，若误走 `fail()`，`fail` 会 `adapter.remove(id)`
 * 清掉**刚落盘的断点** ⇒ 续传能力当场失效，且 UI 显示"失败"。
 * 内联在 `main()` 的 catch 里时这段逻辑**单测够不着**（`main()` 需要 DOM），
 * 抽成纯函数后「暂停**绝不**走 fail」这条才成为可断言契约。
 *
 * 「静默」的正确含义：**不调 `fail()`、不 `logger.error`、不显示"失败"**；
 * **不是**"什么都不做" —— 暂停必须**显示暂停态**（`showPaused` + `setPausedCheckpoint`）。
 *
 * @param {object} p
 * @param {Error} p.err 执行体抛出的错误
 * @param {object|null} p.record `taskManager.get(taskId)` 的结果
 * @returns {{action: 'fail'|'paused'|'aborted'|'none'}}
 */
export function convertExitForAbort({ err, record }) {
  if (err?.name !== 'AbortError') return { action: 'fail' };
  if (record?.state === TASK_STATES.PAUSED) return { action: 'paused' };
  if (record?.state === TASK_STATES.ABORTED) return { action: 'aborted' };
  return { action: 'none' };
}

/* ────────────────── 转换路径的进度记账（单一入口） ────────────────── */

/**
 * 造「转换进度回调核」：**唯一**允许挂断点落盘的地方（单包与批量共用，避免两处漂移）。
 *
 * ⚠️ **为什么必须有这个函数**：落盘**只能**挂 `onProgress`。
 * `runConversionTask` 的 `onEntryDone` 是顶层参数，只被传进**主线程降级分支**；
 * Worker 分支走 `postMessage`，**函数过不了结构化克隆** ⇒ **真浏览器里永不触发**
 * （见 `src/core/worker-client.js:89` 的 JSDoc：*"主线程路径直通；Worker 路径由 onProgress 累积"*）。
 * 若把落盘改挂到 `onEntryDone` 上：断点在**浏览器里永不落盘** ⇒ 暂停后无法续传，
 * 而 `npm test` 全绿（Vitest 无 `Worker`，走主线程路径，`onEntryDone` 会触发）**⇒ 缺陷被测试掩盖**。
 *
 * 所以这条契约被拆成可断言的形式：本函数的单测**只调 `onProgress` 一种签名**（模拟 Worker 路径），
 * 断言断点仍然被喂到。「是否真的接在 `onProgress` 上」这一层由 **E2E（真浏览器）** 守 —— 两者缺一不可。
 *
 * @param {object} p
 * @param {Map<string, number>} p.doneEntries 已完成条目（**就地累积**，供续传时命中即跳过）
 * @param {function} p.maybeCheckpoint 断点节流器（`createCheckpointThrottle` 的产物）
 * @returns {function(number, number, string, number|undefined): void}
 */
export function attachConversionProgress({ doneEntries, maybeCheckpoint }) {
  return function trackConversionProgress(cur, total, name, crc32) {
    // 只做 Map.set + 节流判定，**不碰 DOM** —— 渲染由调用方在下一行做（已由 view 侧合帧，L1-MR-9）
    if (name && crc32 != null) doneEntries.set(name, crc32);
    maybeCheckpoint({ force: total > 0 && cur === total, totalEntries: total });
  };
}

/* ────────────────── 批量转换的纯编排核（可 Node 直测） ────────────────── */

/**
 * 批量子项循环核：**纯编排**（无 DOM / 存储 / 任务管理器依赖），故可在 Node 下直测。
 * `main()` 内的接线代码够不着测试，把语义放这里才对得上「纯逻辑必须可单测」的规格要求。
 *
 * 被测试锁定的两条语义：
 * 1. **从 `startIndex` 开始**（子项游标续传：已完成的子项不重跑）；
 * 2. **`AbortError` 必须终止循环** —— 其余错误"记日志继续"是既有语义（单个坏包不该打断整批），
 *    但暂停/中止是**用户意图**，必须是"停"：否则用户点了暂停，界面显示已暂停，
 *    后台却还在往下跑后续子项，且断点游标与实际进度脱节。
 *
 * @param {object} p
 * @param {Array<*>} p.items 子项列表（**下标即游标**）
 * @param {number} [p.startIndex=0] 下一个待处理的子项下标
 * @param {function(*, number): Promise<void>} p.convertItem (item, index) => Promise
 * @param {function(Error, number): void} [p.onItemError] 非中止错误的回调（**不终止循环**）
 * @returns {Promise<{processed: number, aborted: boolean, error: Error|null}>}
 */
export async function runBatchItems({ items, startIndex = 0, convertItem, onItemError }) {
  let processed = 0;
  for (let i = startIndex; i < items.length; i += 1) {
    try {
      await convertItem(items[i], i);
      processed += 1;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // 原样上抛中止信号：状态迁移（PAUSED / ABORTED）与 UI 由调用方完成
        return { processed, aborted: true, error: err };
      }
      if (typeof onItemError === 'function') onItemError(err, i);
    }
  }
  return { processed, aborted: false, error: null };
}

/**
 * 批量续传的**可验证前提**（R-16 / U-6）：断点说「前 k 个子项已完成」，
 * 但那 k 个产物是 `ephemeral`（只在内存 `ExportQueue.items` 里），断点却是持久化的
 * ⇒ 两者可能不一致（产物被删除、被清空、或页面重载过）。
 *
 * 判据刻意取**真正依赖的那个东西**（产物还在不在），而**不是**「会话是否同一个」这类代理量 ——
 * 代理量会在「同会话但用户手动删了产物」时误判为可续。
 *
 * @param {object} p
 * @param {number} p.expectedOutputs 断点记录的已完成产物数
 * @param {number} p.productsPresent 内存队列里该 taskId 的产物数
 * @returns {{valid: boolean, reason: string}}
 */
export function batchResumeVerdict({ expectedOutputs, productsPresent }) {
  if (expectedOutputs === productsPresent) return { valid: true, reason: '' };
  return {
    valid: false,
    reason: `断点记 ${expectedOutputs} 个已完成产物，内存队列里只有 ${productsPresent} 个`
      + '（产物已不在内存：可能被移除，或页面已重载过）',
  };
}

/**
 * 为**指定子项**播种条目级断点。
 *
 * ⚠️ 断点里的 `doneEntries` **只对断点游标指向的那个子项有效**：
 * 不同源包可能含**同名条目**（`characters/X.png`、`settings.json` 几乎必然重名），
 * 跨子项复用 crc 清单会让第二个子项**错误跳过**那些条目 ⇒ **产物缺条目**。
 *
 * @param {object} p
 * @param {object|null} p.checkpoint 断点清单
 * @param {number} p.index 当前子项下标
 * @param {number} p.startIndex 断点游标
 * @returns {Map<string, number>}
 */
export function seedEntriesFor({ checkpoint, index, startIndex }) {
  if (!checkpoint || index !== startIndex || !checkpoint.doneEntries) return new Map();
  return new Map(Object.entries(checkpoint.doneEntries));
}

/**
 * 挂载只读调试探针 `window.__stZipConverterDebug`（R-19）。
 *
 * **规格依据**：`.trellis/spec/frontend/hook-guidelines.md` 的「无全局命名空间」一节明文写着
 * 「若后续确需自动化钩子，应新增**显式命名**的接缝**并在本节登记**，**不要**恢复隐式全局对象」
 * ⇒ 本挂载走的是规格**已预留**的那条路，并已在同节完成登记。
 *
 * **三条约束**（`design.md` D3.2，违约即缺陷）：
 * 1. **只读**：命名空间对象 `Object.freeze`，且 `getRestoreProbe()` 返回的**快照**本身也冻结
 *    —— 防伪能力主要来自后者：E2E 拿到的 `capability` 改不动，断言才有判别力；
 * 2. **不覆盖已占用者**：宿主或别的扩展可能同名，已存在时**不覆盖**并 warn（静默覆盖会
 *    悄悄弄坏别人的对象）；
 * 3. **不泄漏**：只暴露**能力枚举 + 原因文案**，**不含** CSRF token / user handle / 文件路径
 *    （那些各有受控获取路径，不从这里漏出）。
 *
 * 导出面仅为了让单测能覆盖「已占用时不覆盖」这条分支（`test/restore-probe.test.js`）；
 * 生产路径由 `bootstrap()` 调用。
 */
export function mountDebugProbe() {
  if (typeof window === 'undefined') return;
  const DEBUG_KEY = '__stZipConverterDebug';
  if (Object.prototype.hasOwnProperty.call(window, DEBUG_KEY)) {
    logger.warn(`window.${DEBUG_KEY} 已被占用，跳过挂载（不覆盖既有对象）`);
    return;
  }
  window[DEBUG_KEY] = Object.freeze({
    getRestoreProbe,
    getChatStoreProbe,
  });
}
