/**
 * 私有格式仓面板（vault-store 的 UI 模块）。
 *
 * 职责与 stash-list 同形：读仓列表 → 渲染行（名称/格式徽标/体积/日期 + 行内动作），
 * 动作经注入接缝回调（onRestore / confirmFn / logger），本组件不认识宿主。
 * 后端徽标明示当前存储层：服务端（Authority）/ 本地（浏览器降级）/ 不可用。
 */

import {
  vaultPut,
  vaultList,
  vaultGet,
  vaultDelete,
  vaultBackend,
  normalizeFormatTag,
} from '../storage/vault-store.js';
import { escapeHtml } from './escape.js';

const FORMAT_LABELS = Object.freeze({
  st: 'ST',
  l: 'Luker',
  tt: 'TT',
  pt: 'PT',
  raw: '原始',
});

const BACKEND_LABELS = Object.freeze({
  authority: { text: '服务端', cls: 'vault-backend-server', title: 'Authority 后端存储' },
  indexeddb: { text: '本地', cls: 'vault-backend-local', title: '浏览器降级存储' },
});

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

/**
 * 恢复可用性（纯函数）：条目格式与当前宿主布局一致才给恢复入口。
 * @param {{formatTag?: string}} entry
 * @param {string|null} hostLayout 宿主布局码（st|l|tt|pt|null）
 * @returns {boolean}
 */
export function canRestoreEntry(entry, hostLayout) {
  if (!hostLayout) return false;
  return normalizeFormatTag(entry?.formatTag) === hostLayout;
}

function triggerDownload(name, blob) {
  if (!blob || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a); // dom-scope:allow 下载锚点：临时 <a> 挂进文档 click() 才触发下载，随即移除
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 渲染仓面板。
 * @param {object} params
 * @param {HTMLElement} params.containerEl #vault-list
 * @param {HTMLElement} params.badgeEl #vault-backend-badge
 * @param {string|null} [params.hostLayout] 宿主布局码（st|l|tt|pt|null）
 * @param {(file:{name:string,blob:Blob})=>void} [params.onRestore] 恢复到宿主（未注入不渲染该动作）
 * @param {(msg:string)=>Promise<boolean>} [params.confirmFn] 删除确认（未注入降级 window.confirm）
 * @param {{info:Function,warn:Function,error:Function}} [params.logger]
 * @param {()=>void} [params.onChanged] 列表变化后回调（调用方刷新配额等）
 */
export async function renderVaultPanel({
  containerEl,
  badgeEl = null,
  hostLayout = null,
  onRestore,
  confirmFn = null,
  logger = console,
  onChanged,
} = {}) {
  if (!containerEl) return;
  const askConfirm = typeof confirmFn === 'function'
    ? confirmFn
    : (msg) => Promise.resolve(typeof window !== 'undefined' ? window.confirm(msg) : true);

  const backend = await vaultBackend();
  if (badgeEl) {
    badgeEl.innerHTML = '';
    if (backend && BACKEND_LABELS[backend]) {
      const meta = BACKEND_LABELS[backend];
      badgeEl.innerHTML = `<span class="badge ${escapeHtml(meta.cls)}" title="${escapeHtml(meta.title)}">${escapeHtml(meta.text)}</span>`;
    } else {
      badgeEl.innerHTML = '<span class="badge vault-backend-none">不可用</span>';
    }
  }

  containerEl.innerHTML = '';
  if (!backend) {
    const empty = document.createElement('div');
    empty.className = 'archive-empty';
    empty.textContent = '仓不可用';
    containerEl.appendChild(empty);
    return;
  }

  const entries = await vaultList();
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'archive-empty';
    empty.textContent = '仓为空';
    containerEl.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'archive-item-list vault-list';

  for (const entry of entries) {
    // 行构建全走真实元素 + textContent（用户数据零 innerHTML 路径，dom-injection 守卫零违规）
    const item = document.createElement('div');
    item.className = 'archive-card';
    const tag = normalizeFormatTag(entry.formatTag);

    const info = document.createElement('div');
    info.className = 'archive-info';
    const nameRow = document.createElement('div');
    nameRow.className = 'eq-name-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'archive-name';
    nameSpan.textContent = entry.name;
    nameRow.appendChild(nameSpan);

    const meta = document.createElement('div');
    meta.className = 'archive-meta';
    const mkMeta = (cls, text, title) => {
      const s = document.createElement('span');
      if (cls) s.className = cls;
      if (title) s.title = title;
      s.textContent = text;
      return s;
    };
    meta.appendChild(mkMeta('origin-badge origin-host', FORMAT_LABELS[tag] || tag));
    meta.appendChild(mkMeta('meta-badge', formatBytes(entry.size)));
    meta.appendChild(mkMeta('', formatDate(entry.savedAt)));
    if (entry.note) {
      meta.appendChild(mkMeta('meta-badge', String(entry.note).slice(0, 24), entry.note));
    }
    info.append(nameRow, meta);
    item.appendChild(info);
    const btns = document.createElement('div');
    btns.className = 'archive-buttons';
    const mkBtn = (cls, text, title, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn-archive-action ${cls}`;
      b.textContent = text;
      if (title) b.title = title;
      b.addEventListener('click', onClick);
      return b;
    };
    btns.appendChild(mkBtn('load', '导出', '下载该条目', async () => {
      try {
        const full = await vaultGet(entry.id);
        if (full?.blob) triggerDownload(entry.name, full.blob);
        else logger.warn?.(`仓条目读取失败: ${entry.name}`);
      } catch (err) {
        logger.error?.(`仓条目导出失败: ${entry.name}`, err);
      }
    }));
    if (canRestoreEntry(entry, hostLayout) && typeof onRestore === 'function') {
      btns.appendChild(mkBtn('load', '恢复', '恢复到当前宿主', async () => {
        try {
          const full = await vaultGet(entry.id);
          if (full?.blob) onRestore({ name: entry.name, blob: full.blob });
        } catch (err) {
          logger.error?.(`仓条目读取失败: ${entry.name}`, err);
        }
      }));
    }
    btns.appendChild(mkBtn('more', '删除', '删除该条目', async () => {
      if (!(await askConfirm(`确定从仓中删除「${entry.name}」吗？`))) return;
      try {
        await vaultDelete(entry.id);
        logger.info?.(`已从仓删除: ${entry.name}`);
        if (typeof onChanged === 'function') onChanged();
      } catch (err) {
        logger.error?.(`仓条目删除失败: ${entry.name}`, err);
      }
    }));
    item.appendChild(btns);
    list.appendChild(item);
  }
  containerEl.appendChild(list);
}

/**
 * 把一组文件存入仓（文件选择入口的执行体；逐个存入，单个失败不阻断其余）。
 * @param {FileList|Iterable<File>} files
 * @param {{formatTag?: string, logger?: object, onProgress?: Function, onChanged?: Function}} [opts]
 * @returns {Promise<{ok: number, fail: number}>}
 */
export async function saveFilesToVault(files, opts = {}) {
  const logger = opts.logger || console;
  let ok = 0;
  let fail = 0;
  for (const file of files || []) {
    if (!file) continue;
    try {
      const entry = await vaultPut({
        name: file.name,
        blob: file,
        formatTag: opts.formatTag,
        onProgress: opts.onProgress,
      });
      if (entry) {
        ok += 1;
        logger.info?.(`已存入仓: ${entry.name} (${formatBytes(entry.size)}) [${entry.formatTag}]`);
      } else {
        fail += 1;
        logger.warn?.(`仓不可用，未存入: ${file.name}`);
      }
    } catch (err) {
      fail += 1;
      logger.error?.(`存入仓失败: ${file.name}`, err);
    }
  }
  if (typeof opts.onChanged === 'function' && (ok > 0 || fail > 0)) opts.onChanged();
  return { ok, fail };
}
