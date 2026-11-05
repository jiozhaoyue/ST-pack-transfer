/**
 * 转换任务运行器（续传 / 暂停 / 中止）
 *
 * 2026-11-05 恢复接线：2026-10-27 的工作台重写把 `TaskManager` 与 `task-runtime` 留在
 * core/app 层却没有任何调用点，暂停与真增量续传因此只剩能力、没有入口。
 * 本模块是**唯一接线点**：控制器只把依赖注入进来，不重复实现状态机语义。
 *
 * 设计约束（与 core 的契约，改动前先读）：
 * - 断点必须挂 `onProgress`（`onEntryDone` 只在主线程降级分支触发，浏览器里永不触发）；
 * - 暂停走 `TaskManager.pause()` → abort → Worker 协作式收尾 → `onPaused` → `persistPartial`；
 * - 续传的跳过门是「半成品里真有这条字节」，台账只做 crc 冗余校验；
 * - 跨页面重载：OPFS 半成品仍在，断点清单可用 `readZipEntryManifest()` 从中重建，
 *   故只需在 localStorage 记一条「上次暂停的任务」（见 `readPausedMarker`）。
 */

import {
  TASK_KINDS, TASK_PREFIX, partialNameFor, persistPartial,
  createCheckpointThrottle, attachConversionProgress, convertExitForAbort,
} from './task-runtime.js';
import { readZipEntryManifest } from '../core/zip-io.js';

export const PAUSED_MARKER_KEY = 'st-pack-transfer:pausedTask';

function safeStorage(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** 读取「上次暂停的转换」标记；坏数据一律当没有（不抛错、不阻塞启动）。 */
export function readPausedMarker(storage = null) {
  const store = safeStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(PAUSED_MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.taskId !== 'string' || typeof parsed.pkgId !== 'string') return null;
    return parsed;
  } catch { return null; }
}

export function writePausedMarker(marker, storage = null) {
  const store = safeStorage(storage);
  if (!store) return false;
  try { store.setItem(PAUSED_MARKER_KEY, JSON.stringify(marker)); return true; } catch { return false; }
}

export function clearPausedMarker(storage = null) {
  const store = safeStorage(storage);
  if (!store) return false;
  try { store.removeItem(PAUSED_MARKER_KEY); return true; } catch { return false; }
}

/**
 * 断点 / 半成品 → 续传台账。
 *
 * @param {object|null} checkpoint `TaskManager` 落盘的清单（可能只有旧格式的 `doneEntries`）
 * @param {Array<{name:string,crc32:number|null}>|null} partialEntries 从半成品 zip 实际读出的条目
 * @returns {Map<string, number|null>}
 */
export function buildResumeEntries(checkpoint, partialEntries) {
  const source = Array.isArray(partialEntries) && partialEntries.length
    ? partialEntries
    : (Array.isArray(checkpoint?.partialEntries) ? checkpoint.partialEntries : null);
  if (source) {
    return new Map(
      source
        .filter((entry) => entry && typeof entry.name === 'string')
        .map((entry) => [entry.name, entry.crc32 ?? null]),
    );
  }
  if (checkpoint?.doneEntries && typeof checkpoint.doneEntries === 'object') {
    return new Map(Object.entries(checkpoint.doneEntries));
  }
  return new Map();
}

/**
 * @param {object} deps
 * @param {function(): Promise<import('../core/task-manager.js').TaskManager>} deps.getTaskManager 惰性取状态机
 * @param {function(object): Promise<object>} deps.runConversionTask 即 `worker-client.runConversionTask`
 * @param {{setProgress:function, setTask:function, toast:function}} deps.view
 * @param {object} deps.logger
 * @param {function(string, object=): string} deps.t i18n
 * @param {object} [deps.opfs] `{ tmpHandle, handleToFile, cleanup }`
 * @param {function(): number} [deps.now]
 * @param {function(): number} [deps.random]
 */
export function createConversionRunner({
  getTaskManager,
  runConversionTask,
  view,
  logger,
  t,
  opfs = {},
  storage = null,
  now = Date.now,
  random = Math.random,
} = {}) {
  /** @type {{taskId:string,pkgId:string,target:string,name:string}|null} */
  let paused = null;
  /** @type {{taskId:string,taskManager:object,state:'running'|'paused'}|null} */
  let current = null;

  const opfsTmpHandle = opfs.tmpHandle;
  const opfsHandleToFile = opfs.handleToFile;
  const opfsCleanup = opfs.cleanup;

  async function readPartial(checkpoint, taskId) {
    const name = checkpoint?.partialOpfsName || partialNameFor(taskId);
    if (!name || typeof opfsTmpHandle !== 'function') return { name, blob: null, entries: null };
    try {
      const handle = await opfsTmpHandle(name, false);
      const blob = handle && typeof opfsHandleToFile === 'function' ? await opfsHandleToFile(handle) : null;
      if (!blob) return { name, blob: null, entries: null };
      let entries = null;
      try { entries = await readZipEntryManifest(blob); } catch { entries = null; }
      return { name, blob, entries };
    } catch (err) {
      logger?.warn?.(`[转换] 半成品读取失败（将完整重做整包）: ${err?.message ?? err}`);
      return { name, blob: null, entries: null };
    }
  }

  function cleanupPartial(name) {
    if (name && typeof opfsCleanup === 'function') {
      try { opfsCleanup(name); } catch { /* 清理失败不影响主流程 */ }
    }
  }

  function emitTask(state, info) {
    paused = state === 'paused' ? { ...info } : (state === null ? null : paused);
    current = state === 'running' ? { ...info, state } : (state === 'paused' ? current : null);
    view?.setTask?.(state === null ? null : { state, label: info?.name || '' });
  }

  /**
   * 跑一次转换。
   *
   * @param {object} p
   * @param {{id:string,name:string}} p.pkg
   * @param {Blob} p.blob
   * @param {string} p.target 布局码 `st|l|tt|pt`
   * @param {object} p.options 传给 `convert()` 的选项（不含续传三项）
   * @param {number} [p.pctBase=3]
   * @param {number} [p.pctSpan=92]
   * @param {{taskId:string}|null} [p.resume] 续传：复用暂停任务的 id
   * @returns {Promise<{report?:object,resultBlob?:Blob,paused?:true,aborted?:true}>}
   */
  async function convert({ pkg, blob, target, options = {}, pctBase = 3, pctSpan = 92, resume = null }) {
    const taskManager = await getTaskManager();
    const suffix = String(random()).slice(2, 6);
    const taskId = resume?.taskId || `${TASK_PREFIX[TASK_KINDS.CONVERT]}${now()}${suffix}`;
    const totalBytes = blob?.size || 0;
    const label = pkg?.name || pkg?.id || '';

    const { signal, onCheckpoint, setPauseCheckpoint } = taskManager.start(taskId, label, {
      resumable: true,
      totalBytes,
    });

    const checkpoint = resume?.taskId ? await readCheckpoint(taskManager, taskId) : null;
    const partial = await readPartial(checkpoint, taskId);
    const entries = buildResumeEntries(checkpoint, partial.entries);
    const maybeCheckpoint = createCheckpointThrottle(onCheckpoint, entries);
    const trackProgress = attachConversionProgress({ doneEntries: entries, maybeCheckpoint });
    if (partial.blob) {
      logger?.info?.(`[转换] 续传 ${taskId}：半成品 ${partial.name} 可用（${entries.size} 条，命中即跳过）`);
    } else if (checkpoint) {
      logger?.warn?.('[转换] 断点存在但半成品不可用 ⇒ 本次完整重做整包（产物仍完整）');
    }

    current = { taskId, pkgId: pkg?.id || '', target, name: label, state: 'running' };
    view?.setTask?.({ state: 'running', label });

    try {
      const outcome = await runConversionTask({
        source: blob,
        target,
        options: {
          ...options,
          signal,
          resumeCrcMap: entries,
          appendFrom: partial.blob,
          finalizeOnAbort: true,
        },
        onProgress: (currentCount, total, filename, crc32) => {
          trackProgress(currentCount, total, filename, crc32);
          const pct = total > 0
            ? pctBase + Math.round((currentCount / total) * pctSpan)
            : pctBase;
          view?.setProgress?.(pct, t('progress.convertingN', {
            current: currentCount,
            total,
            file: filename ? ` · ${filename}` : '',
          }));
        },
        onPaused: async ({ partialBlob, manifest, partialError }) => persistPartial({
          partialBlob,
          manifest,
          partialError,
          taskId,
          target,
          totalBytes,
          setPauseCheckpoint,
          buildCheckpoint: ({ name, partialEntries }) => ({
            partialOpfsName: name,
            target,
            partialEntries,
            totalEntries: totalBytes,
            sourcePkgId: pkg?.id || '',
            sourceName: label,
          }),
        }),
      });

      await taskManager.complete(taskId);
      cleanupPartial(partial.name);
      clearPausedMarker(storage);
      paused = null;
      current = null;
      view?.setTask?.(null);
      return outcome || {};
    } catch (err) {
      const record = readRecord(taskManager, taskId);
      const exit = convertExitForAbort({ err, record });
      if (exit.action === 'paused') {
        const marker = { taskId, pkgId: pkg?.id || '', target, name: label, at: now() };
        paused = marker;
        writePausedMarker(marker, storage);
        current = { taskId, pkgId: pkg?.id || '', target, name: label, state: 'paused' };
        view?.setTask?.({ state: 'paused', label });
        view?.setProgress?.(0, t('progress.paused'));
        logger?.info?.(t('log.taskPaused'));
        return { paused: true };
      }
      if (exit.action === 'aborted') {
        await taskManager.abort(taskId).catch?.(() => {});
        cleanupPartial(partial.name);
        clearPausedMarker(storage);
        paused = null;
        current = null;
        view?.setTask?.(null);
        view?.setProgress?.(0, t('progress.aborted'));
        logger?.info?.(t('log.taskAborted'));
        return { aborted: true };
      }
      current = null;
      paused = null;
      clearPausedMarker(storage);
      view?.setTask?.(null);
      if (typeof taskManager.fail === 'function') {
        try { await taskManager.fail(taskId); } catch { /* 状态机失败不改写原始错误 */ }
      }
      throw err;
    }
  }

  async function readCheckpoint(taskManager, taskId) {
    try {
      if (typeof taskManager.adapter?.load === 'function') {
        return await taskManager.adapter.load(taskId);
      }
    } catch { /* 断点读取失败 = 没有断点 */ }
    return null;
  }

  function readRecord(taskManager, taskId) {
    try {
      if (typeof taskManager.get === 'function') return taskManager.get(taskId);
      return taskManager.tasks?.get?.(taskId) || null;
    } catch { return null; }
  }

  return {
    convert,
    getPaused: () => paused,
    getCurrent: () => current,
    /** 暂停当前任务；返回是否真的触发了暂停。 */
    async pause() {
      if (!current || current.state !== 'running') return false;
      const taskManager = await getTaskManager();
      return taskManager.pause(current.taskId);
    },
    /** 中止：暂停态走 abort + 清理；运行态只 abort（收尾由 onPaused/abort 分支处理）。 */
    async abort() {
      if (!current) {
        clearPausedMarker(storage);
        paused = null;
        view?.setTask?.(null);
        return false;
      }
      const taskManager = await getTaskManager();
      const taskId = current.taskId;
      const wasPaused = current.state === 'paused';
      const ok = await taskManager.abort(taskId);
      if (wasPaused) {
        cleanupPartial(partialNameFor(taskId));
        clearPausedMarker(storage);
        paused = null;
        current = null;
        view?.setTask?.(null);
        view?.setProgress?.(0, t('progress.aborted'));
      }
      return ok;
    },
  };
}
