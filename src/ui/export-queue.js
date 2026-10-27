/**
 * 待导出区组件 (Export Queue)
 * 统一出口：所有产物（宿主直出/转换生成/增量补丁/分卷）先进待导出区，
 * 由用户统一处置：下载 / 存入工作区 / 写回宿主 / 移除，支持批量。
 *
 * 状态机说明：
 * - 队列条目 { id, name, blob, targetLayout, origin, ephemeral, autoDownload }
 *   ephemeral=true 表示"仅下载不入库"的临时产物（下载动作时才写入 files store）；
 * - stash() 将 ephemeral 条目永久入库；remove() 连带清理 ephemeral 记录；
 * - autoDownload 保留"完成后自动下载"习惯路径。
 */

import { saveFile, deleteFile, getFile } from '../storage/db.js';
import { ORIGINS } from '../storage/db.js';
import { mirrorArtifact } from '../storage/authority-store.js';
import { escapeHtml, trustedStaticMarkup } from './escape.js';
import { t } from '../i18n/index.js';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function triggerBlobDownload(blob, name) {
  // Node/Vitest 降级：无 DOM 时跳过浏览器下载动作（状态机路径仍被单测覆盖）
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a); // dom-scope:allow 下载锚点：临时 <a> 必须挂进文档 click() 才会触发下载，紧随其后即 removeChild
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 通过 File System Access API 选择位置写出文件；不支持或用户取消时回退普通下载。
 * @param {Blob} blob
 * @param {string} name
 */
export async function exportToLocation(blob, name) {
  if (typeof window === 'undefined' || !window.showSaveFilePicker) {
    triggerBlobDownload(blob, name);
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: name });
    const writable = await handle.createWritable();
    await blob.stream().pipeTo(writable);
  } catch (err) {
    if (err && err.name === 'AbortError') return; // 用户取消
    triggerBlobDownload(blob, name); // FS Access 写入异常兜底
  }
}

/**
 * 供拖出 (drag-out) 使用：Chromium 支持 DownloadURL 数据类型。
 * @param {DataTransfer} dataTransfer
 * @param {Blob} blob
 * @param {string} name
 * @returns {boolean} 是否注册成功
 */
export function setDragOutPayload(dataTransfer, blob, name) {
  if (typeof DataTransfer === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const probe = new DataTransfer();
    if (!probe.types || !probe.types.includes('DownloadURL')) return false;
  } catch {
    return false;
  }
  const url = URL.createObjectURL(blob);
  dataTransfer.setData('DownloadURL', `application/zip:${name}:${url}`);
  setTimeout(() => URL.revokeObjectURL(url), 120_000); // 拖放过程可能很长
  return true;
}

const ORIGIN_LABELS = {
  [ORIGINS.UPLOAD]: { key: 'queue.origin.upload', cls: 'origin-upload' },
  [ORIGINS.HOST_EXPORT]: { key: 'queue.origin.hostExport', cls: 'origin-host' },
  [ORIGINS.CONVERTED]: { key: 'queue.origin.converted', cls: 'origin-converted' },
  [ORIGINS.DELTA]: { key: 'queue.origin.delta', cls: 'origin-delta' },
  [ORIGINS.SPLIT_PART]: { key: 'queue.origin.split', cls: 'origin-split' },
  [ORIGINS.SOURCE_BACKUP]: { key: 'queue.origin.sourceBackup', cls: 'origin-source-backup' },
  [ORIGINS.TARGET_BACKUP]: { key: 'queue.origin.targetBackup', cls: 'origin-target-backup' },
  [ORIGINS.REPORT]: { key: 'queue.origin.report', cls: 'origin-report' },
};

let seq = 0;

/** 目标布局分组顺序与标签（与 #target-select 的 option 文案一字不差，R-A1） */
const LAYOUT_GROUP_ORDER = Object.freeze(['st', 'l', 'tt', 'pt']);
const LAYOUT_GROUP_LABELS = Object.freeze({
  st: 'SillyTavern',
  l: 'Luker',
  tt: 'TauriTavern',
  pt: 'PureTavern',
});

/** 折叠态（纯视图态，模块级 Set；选中态在渲染闭包内） */
const collapsedQueueGroups = new Set();

/**
 * 按目标平台给产物分组（纯函数，R-A1）
 * @param {Array<{targetLayout?: string}>} items
 * @returns {Array<{key: string, label: string, items: Array}>} 声明序在前、未登记键按字典序排后；空组不产出
 */
export function groupQueueItems(items) {
  const buckets = new Map();
  for (const it of items || []) {
    const key = it.targetLayout || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const rank = (key) => {
    const idx = LAYOUT_GROUP_ORDER.indexOf(key);
    return idx === -1 ? LAYOUT_GROUP_ORDER.length : idx;
  };
  return [...buckets.entries()]
    .sort((a, b) => (rank(a[0]) - rank(b[0])) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, groupItems]) => ({
      key,
      label: LAYOUT_GROUP_LABELS[key] || key.toUpperCase(),
      items: groupItems,
    }));
}

export class ExportQueue {
  constructor() {
    /** @type {Array<{id,name,blob,targetLayout,origin,ephemeral,autoDownload,storedId?}>} */
    this.items = [];
    /** @type {Set<function(): void>} */
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn();
  }

  /**
   * 产物入队
   * @param {object} item
   * @param {Blob} item.blob
   * @param {string} item.name
   * @param {string} [item.targetLayout]
   * @param {string} [item.origin] ORIGINS 枚举，默认 converted
   * @param {boolean} [item.ephemeral=true] 临时产物（不入库直到 stash/下载）
   * @param {boolean} [item.autoDownload=false] 入队即下载
   * @param {string|null} [item.taskId=null] 产出它的任务 id —— 批量转换的**跨重载失效检测**依赖它：
   *   断点说「前 k 个子项已完成」，但 `ephemeral` 产物只在内存、页面重载后即消失
   *   ⇒ 续传前必须核对「这批产物还在不在」（见 `index.js` 的 `handleBatchConvert`）。
   *   **加性字段**：既有消费者只读自己认识的字段，null 表示"非任务产出"。
   */
  enqueue({ blob, name, targetLayout = '', origin = ORIGINS.CONVERTED, ephemeral = true, autoDownload = false, taskId = null }) {
    const item = { id: `eq_${Date.now()}_${++seq}`, name, blob, targetLayout, origin, ephemeral, autoDownload, storedId: null, taskId };
    this.items.push(item);
    if (autoDownload) {
      triggerBlobDownload(blob, name);
    }
    this.notify();
    return item;
  }

  remove(id) {
    const idx = this.items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const [item] = this.items.splice(idx, 1);
    if (item.storedId) {
      deleteFile(item.storedId).catch(() => {});
    }
    this.notify();
  }

  clear() {
    for (const item of this.items) {
      if (item.storedId) deleteFile(item.storedId).catch(() => {});
    }
    this.items = [];
    this.notify();
  }

  async download(id) {
    const item = this.items.find((it) => it.id === id);
    if (!item) return;
    triggerBlobDownload(item.blob, item.name);
    // 临时产物下载时顺带入库，避免丢失
    if (item.ephemeral) {
      await this.stash(id);
    }
  }

  async downloadAll() {
    for (const item of [...this.items]) {
      await this.download(item.id);
    }
  }

  /**
   * 产物持久归档镜像：Authority 后端可用时把入库产物镜像到服务端
   * （fire-and-forget，失败/不可用只告警，绝不阻断本地入库路径）
   */
  _mirrorToAuthority(item) {
    if (!item?.blob) return;
    mirrorArtifact(item.name, item.blob).catch(() => {});
  }

  /**
   * 永久存入工作区（ephemeral 产物首次入库；已入库的空操作）
   */
  async stash(id) {
    const item = this.items.find((it) => it.id === id);
    if (!item) return;
    if (!item.storedId) {
      const storedId = await saveFile({
        name: item.name,
        size: item.blob.size,
        blob: item.blob,
        layout: item.targetLayout || 'unknown',
        role: 'output',
        origin: item.origin,
      });
      // saveFile 返回 null = 存储不可用（Node 降级），此时保持 ephemeral 状态
      if (storedId) {
        item.storedId = storedId;
        item.ephemeral = false;
        this._mirrorToAuthority(item);
      }
      this.notify();
    }
  }

  async stashAll() {
    for (const item of [...this.items]) {
      await this.stash(item.id);
    }
  }

  /**
   * 临时产物首次入库（stash 首次会 saveFile），返回存储 id —— 供"下载"路径复用
   */
  async ensureStored(id) {
    const item = this.items.find((it) => it.id === id);
    if (!item) return null;
    if (!item.storedId) {
      item.storedId = await saveFile({
        name: item.name,
        size: item.blob.size,
        blob: item.blob,
        layout: item.targetLayout || 'unknown',
        role: 'output',
        origin: item.origin,
      });
      if (item.storedId) this._mirrorToAuthority(item);
      this.notify();
    }
    return item.storedId;
  }
}

/**
 * 渲染待导出区面板
 * @param {object} params
 * @param {HTMLElement} params.containerEl
 * @param {ExportQueue} params.queue
 * @param {boolean} [params.isHostAvailable]
 * @param {boolean} [params.restoreInFlight] 是否有恢复事务在途（在途时禁用全部「写回宿主」入口）
 * @param {object|null} [params.restoreBatch] 批量恢复状态快照（`createRestoreBatch().getState()`）——
 *   传 `null`（缺省）时行为与既有单条恢复完全一致
 * @param {string} [params.restoreUnsupportedReason] 宿主无整包恢复能力时的原因文案；
 *   非空即禁用全部恢复入口并把它作为 `title`（R1.6 死按钮规则）
 * @param {function(): void} [params.onCancelRestore] 取消在途恢复（批量与单条共用）
 * @param {function(object): void} [params.onRestoreToHost] (item) => void（单条目入口）
 * @param {function(Array<object>): void} [params.onRestoreBatch] (items) => void 批量入口；
 *   未注入时「已选 N 项 → 写回宿主」退化为只处理第一项（**仅兼容旧调用方**，产品内不得依赖）
 * @param {function(): void} [params.onRetryFailedBatch] 重跑本批失败项（只重跑 failed）
 * @param {function(): void} [params.onRefreshPage] 用户点击「刷新页面生效」（由调用方决定是否 reload）
 * @param {function(): void} [params.onWorkspaceChanged] 工作区列表刷新回调
 */
export function renderExportQueue({
  containerEl, queue, isHostAvailable = false, restoreInFlight = false,
  restoreBatch = null, restoreUnsupportedReason = '',
  onCancelRestore, onRestoreToHost, onRestoreBatch, onRetryFailedBatch, onRefreshPage,
  onWorkspaceChanged, confirmFn = null,
  groupBy = 'targetLayout',
}) {
  if (!containerEl) return;
  // 破坏性操作确认走宿主原生弹窗（由调用方注入 host-bridge 的 confirmDialog），
  // 未注入时降级为 window.confirm——保持本组件可脱离宿主单测。
  const askConfirm = typeof confirmFn === 'function'
    ? confirmFn
    : (msg) => Promise.resolve(typeof window !== 'undefined' ? window.confirm(msg) : true);
  /** 宿主无恢复能力：禁用全部恢复入口（含单条目），并把原因作为 title */
  const restoreBlocked = Boolean(restoreUnsupportedReason);
  const restoreBlockedTitle = restoreUnsupportedReason || t('queue.restoreBusy');
  const selected = new Set();

  const render = () => {
    containerEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'export-queue-header';
    header.innerHTML = `<span class="eq-title"><i class="fa-solid fa-file-export"></i> ${escapeHtml(t('queue.title', { n: queue.items.length }))}</span>`;

    if (queue.items.length > 0) {
      const batchBar = document.createElement('div');
      batchBar.className = 'eq-batch-bar';
      const mkBtn = (html, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu_button btn-tool';
        b.innerHTML = trustedStaticMarkup(html);
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        return b;
      };
      batchBar.appendChild(mkBtn(`<i class="fa-solid fa-download"></i> ${escapeHtml(t('queue.downloadAll'))}`, '', () => queue.downloadAll()));
      batchBar.appendChild(mkBtn(`<i class="fa-solid fa-box-archive"></i> ${escapeHtml(t('queue.stashAll'))}`, '', async () => {
        await queue.stashAll();
        if (typeof onWorkspaceChanged === 'function') onWorkspaceChanged();
      }));
      batchBar.appendChild(mkBtn(`<i class="fa-solid fa-trash"></i> ${escapeHtml(t('queue.clear'))}`, '', async () => {
        if (await askConfirm(t('queue.clearConfirm'))) queue.clear();
      }));
      header.appendChild(batchBar);
    }
    containerEl.appendChild(header);

    // 恢复条：批量进度 / 收尾引导 / 取消入口。
    // - 批量（restoreBatch 非空）：进行中显示「已完成 x/N（部分数据已生效）」，
    //   收尾显示逐项结果 + 「重试失败项」/「刷新页面生效」；绝不显示「合并完成」类表述。
    // - 单条（restoreInFlight 且无批次）：保留原有取消入口（审计 R-01）。
    // - 空队列时同样要出现，故置于空状态提前返回之前。
    if (restoreBatch || (restoreInFlight && typeof onCancelRestore === 'function')) {
      const bar = document.createElement('div');
      bar.className = 'eq-batch-bar eq-restore-bar';
      const mkBarBtn = (html, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu_button btn-tool';
        b.innerHTML = trustedStaticMarkup(html);
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        return b;
      };
      const askCancel = () => askConfirm(t('queue.cancelRestoreConfirm'));
      const hint = document.createElement('span');
      hint.className = 'eq-selected-label';

      if (restoreBatch) {
        const { status, total, doneCount, failedCount, unconfirmedCount } = restoreBatch;
        const settled = doneCount + failedCount + unconfirmedCount;
        if (status === 'running') {
          // 非原子性如实展示：逐项恢复期间部分数据已生效
          hint.textContent = t('queue.restoreRunning', { done: settled, total });
          if (typeof onCancelRestore === 'function') {
            bar.appendChild(mkBarBtn(
              `<i class="fa-solid fa-ban"></i> ${escapeHtml(t('queue.cancelRestoreBatch'))}`,
              t('queue.cancelRestoreBatchHint'),
              async () => { if (await askCancel()) onCancelRestore(); },
            ));
          }
        } else {
          const parts = [];
          if (status === 'done') parts.push(t('queue.restoreAllDone', { total }));
          else if (status === 'aborted') parts.push(t('queue.restoreAborted', { done: doneCount, total }));
          else {
            parts.push(t('queue.restoreSummary', { done: doneCount, total }));
            if (failedCount) parts.push(t('queue.failedCount', { n: failedCount }));
            if (unconfirmedCount) parts.push(t('queue.unconfirmedCount', { n: unconfirmedCount }));
            parts.push(t('queue.partialApplied'));
          }
          hint.textContent = parts.join(t('queue.partJoin'));
          if (restoreBatch.canRetryFailed && typeof onRetryFailedBatch === 'function') {
            bar.appendChild(mkBarBtn(
              `<i class="fa-solid fa-rotate-right"></i> ${escapeHtml(t('queue.retryFailed'))}`,
              t('queue.retryFailedHint'),
              onRetryFailedBatch,
            ));
          }
          if (settled > 0 && typeof onRefreshPage === 'function') {
            bar.appendChild(mkBarBtn(
              `<i class="fa-solid fa-rotate"></i> ${escapeHtml(t('queue.refreshPage'))}`,
              t('queue.refreshHint'),
              onRefreshPage,
            ));
          }
        }
        bar.appendChild(hint);

        // 逐项失败/未确认原因（纯文本，避免注入面）
        const bad = restoreBatch.items.filter((i) => i.status === 'failed' || i.status === 'unconfirmed');
        if (bad.length > 0) {
          const detail = document.createElement('span');
          detail.className = 'eq-selected-label';
          detail.textContent = bad
            .map((i) => `${i.name}: ${i.status === 'unconfirmed' ? t('queue.statusUnconfirmed') : (i.reason || t('queue.statusFailed'))}`)
            .join(t('queue.listSep'));
          bar.appendChild(detail);
        }
      } else {
        bar.appendChild(mkBarBtn(
          `<i class="fa-solid fa-ban"></i> ${escapeHtml(t('queue.cancelRestore'))}`,
          t('queue.cancelRestoreHint'),
          async () => { if (await askCancel()) onCancelRestore(); },
        ));
        hint.textContent = t('queue.restoring');
        bar.appendChild(hint);
      }
      containerEl.appendChild(bar);
    }

    if (queue.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'export-queue-empty';
      empty.textContent = t('queue.empty');
      containerEl.appendChild(empty);
      return;
    }

    // 选中批操作条（勾选 ≥1 时出现）
    const selBar = document.createElement('div');
    selBar.className = 'eq-batch-bar eq-selected-bar';
    const refreshSelBar = () => {
      selBar.innerHTML = '';
      if (selected.size === 0) return;
      const mkSelBtn = (html, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu_button btn-tool';
        b.innerHTML = trustedStaticMarkup(html);
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        return b;
      };
      const label = document.createElement('span');
      label.className = 'eq-selected-label';
      label.textContent = t('queue.selectedCount', { n: selected.size });
      selBar.appendChild(label);
      selBar.appendChild(mkSelBtn(`<i class="fa-solid fa-download"></i> ${escapeHtml(t('queue.download'))}`, '', () => {
        for (const id of selected) queue.download(id);
      }));
      selBar.appendChild(mkSelBtn(`<i class="fa-solid fa-folder-open"></i> ${escapeHtml(t('queue.exportTo'))}`, t('queue.exportToHint'), async () => {
        for (const id of selected) {
          const item = queue.items.find((it) => it.id === id);
          if (item) await exportToLocation(item.blob, item.name);
        }
      }));
      selBar.appendChild(mkSelBtn(`<i class="fa-solid fa-box-archive"></i> ${escapeHtml(t('queue.stash'))}`, '', async () => {
        for (const id of selected) await queue.stash(id);
        if (typeof onWorkspaceChanged === 'function') onWorkspaceChanged();
      }));
      if (isHostAvailable && typeof onRestoreToHost === 'function') {
        // 批量入口：把「已选 N 项」**整批**交给调用方。
        // 此前实现是 `const first = [...selected][0]`——勾 3 项只恢复 1 项且无任何提示
        // （静默部分执行），本任务将其修正为整批编排。
        const btnRestore = mkSelBtn(`<i class="fa-solid fa-rotate"></i> ${escapeHtml(t('queue.restore'))}`, '', () => {
          const items = [...selected]
            .map((id) => queue.items.find((it) => it.id === id))
            .filter(Boolean);
          if (items.length === 0) return;
          if (typeof onRestoreBatch === 'function') onRestoreBatch(items);
          // 兼容旧调用方（产品内恒注入 onRestoreBatch）
          else onRestoreToHost(items[0]);
        });
        if (restoreInFlight || restoreBlocked) {
          btnRestore.disabled = true;
          btnRestore.title = restoreBlockedTitle;
        }
        selBar.appendChild(btnRestore);
      }
      selBar.appendChild(mkSelBtn(`<i class="fa-solid fa-trash"></i> ${escapeHtml(t('queue.remove'))}`, '', () => {
        for (const id of [...selected]) { selected.delete(id); queue.remove(id); }
      }));
    };
    refreshSelBar();
    containerEl.appendChild(selBar);

    const list = document.createElement('div');
    list.className = 'export-queue-list';

    /** 单行构建（分组/平铺两条路径共用，改动只改这一处） */
    const buildRow = (item) => {
      const row = document.createElement('div');
      row.className = 'export-queue-item';
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        setDragOutPayload(e.dataTransfer, item.blob, item.name);
      });

      const info = document.createElement('div');
      info.className = 'eq-info';
      const originLabel = ORIGIN_LABELS[item.origin] || ORIGIN_LABELS[ORIGINS.CONVERTED];
      const layoutBadge = item.targetLayout
        ? `<span class="meta-badge">${escapeHtml(String(item.targetLayout).toUpperCase())}</span>`
        : '';
      const storedBadge = item.storedId
        ? `<span class="eq-stored">${escapeHtml(t('queue.stored'))}</span>`
        : `<span class="eq-ephemeral">${escapeHtml(t('queue.ephemeral'))}</span>`;
      info.innerHTML = `
        <div class="eq-name-row">
          <input type="checkbox" class="eq-select-box" data-id="${escapeHtml(item.id)}" ${trustedStaticMarkup(selected.has(item.id) ? 'checked' : '')}>
          <span class="eq-name">${escapeHtml(item.name)}</span>
        </div>
        <div class="eq-meta">
          <span class="origin-badge ${escapeHtml(originLabel.cls)}">${escapeHtml(t(originLabel.key))}</span>
          ${trustedStaticMarkup(layoutBadge)}
          <span>${escapeHtml(formatBytes(item.blob.size))}</span>
          ${trustedStaticMarkup(storedBadge)}
        </div>
      `;
      row.appendChild(info);

      const btns = document.createElement('div');
      btns.className = 'eq-buttons';
      const mkBtn = (cls, html, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn-archive-action ${cls}`;
        b.innerHTML = trustedStaticMarkup(html);
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        return b;
      };
      btns.appendChild(mkBtn('download', t('queue.download'), '', () => queue.download(item.id)));
      btns.appendChild(mkBtn('load-source', t('queue.exportTo'), t('queue.exportToHint'), () => exportToLocation(item.blob, item.name)));
      const btnStash = mkBtn('load-source', t('queue.stash'), '', async () => {
        await queue.stash(item.id);
        if (typeof onWorkspaceChanged === 'function') onWorkspaceChanged();
      });
      btnStash.disabled = Boolean(item.storedId);
      btns.appendChild(btnStash);
      if (isHostAvailable && typeof onRestoreToHost === 'function') {
        const btnRestoreRow = mkBtn('restore', `<i class="fa-solid fa-rotate"></i> ${escapeHtml(t('queue.restore'))}`, '', () => onRestoreToHost(item));
        if (restoreInFlight || restoreBlocked) {
          btnRestoreRow.disabled = true;
          btnRestoreRow.title = restoreBlockedTitle;
        }
        btns.appendChild(btnRestoreRow);
      }
      btns.appendChild(mkBtn('delete', t('queue.remove'), '', () => { selected.delete(item.id); queue.remove(item.id); }));
      row.appendChild(btns);
      return row;
    };

    if (groupBy === 'targetLayout') {
      // R-A1 按目标平台分组：组头 = 折叠钮 + 三态组勾选 + 徽标计数；空组不渲染
      for (const group of groupQueueItems(queue.items)) {
        const section = document.createElement('div');
        section.className = 'eq-group';
        section.dataset.group = group.key;

        const head = document.createElement('div');
        head.className = 'eq-group-head';
        const body = document.createElement('div');
        body.className = 'eq-group-body';

        const collapsed = collapsedQueueGroups.has(group.key);
        body.hidden = collapsed;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'menu_button eq-group-toggle';
        toggle.textContent = collapsed ? '▸' : '▾';
        toggle.title = collapsed ? t('queue.expand') : t('queue.collapse');
        toggle.addEventListener('click', () => {
          const now = !collapsedQueueGroups.has(group.key);
          if (now) collapsedQueueGroups.add(group.key);
          else collapsedQueueGroups.delete(group.key);
          body.hidden = now;
          toggle.textContent = now ? '▸' : '▾';
          toggle.title = now ? t('queue.expand') : t('queue.collapse');
        });

        const groupBox = document.createElement('input');
        groupBox.type = 'checkbox';
        groupBox.className = 'eq-group-box';
        groupBox.title = t('queue.selectGroup');
        const syncGroupBox = () => {
          const hit = group.items.filter((it) => selected.has(it.id)).length;
          groupBox.checked = hit === group.items.length && hit > 0;
          groupBox.indeterminate = hit > 0 && hit < group.items.length;
        };
        groupBox.addEventListener('change', () => {
          const allIn = group.items.every((it) => selected.has(it.id));
          for (const box of body.querySelectorAll('.eq-select-box')) {
            box.checked = !allIn;
            if (allIn) selected.delete(box.dataset.id);
            else selected.add(box.dataset.id);
          }
          syncGroupBox();
          refreshSelBar();
        });

        const label = document.createElement('span');
        label.className = 'eq-group-label';
        label.textContent = group.label;
        const totalBytes = group.items.reduce((sum, it) => sum + (it.blob?.size || 0), 0);
        const count = document.createElement('span');
        count.className = 'eq-group-count';
        count.textContent = t('queue.groupCount', { n: group.items.length, size: formatBytes(totalBytes) });

        head.append(toggle, groupBox, label, count);
        for (const item of group.items) body.appendChild(buildRow(item));
        syncGroupBox();
        section.append(head, body);
        list.appendChild(section);
      }
    } else {
      for (const item of queue.items) list.appendChild(buildRow(item));
    }
    containerEl.appendChild(list);

    // 复选框事件委托（列表重渲染后仍生效）
    list.addEventListener('change', (e) => {
      const box = e.target.closest('.eq-select-box');
      if (!box) return;
      if (box.checked) selected.add(box.dataset.id);
      else selected.delete(box.dataset.id);
      refreshSelBar();
    });
  };

  // 渲染合帧：批量转换时 notify 高频触发，整表 innerHTML 重建按帧合并
  // （与 view.js 进度条 rAF 合帧同款策略），避免每条产物一次全量重绘
  let renderScheduled = false;
  const renderCoalesced = () => {
    if (renderScheduled) return;
    renderScheduled = true;
    const run = () => {
      renderScheduled = false;
      render();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  };

  queue.subscribe(renderCoalesced);
  render();
}
