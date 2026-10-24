/**
 * 上传暂存区源包列表组件。
 * 渲染 origin ∈ {upload, host-export} 的 IndexedDB 源包，支持复选框多选与批操作。
 * 纯逻辑（过滤/分组）与 DOM 渲染分离以便单测。
 */

import { listStoredFiles, getFile, deleteFile } from '../storage/db.js';
import { escapeHtml, trustedStaticMarkup } from './escape.js';

export const STASH_ORIGINS = Object.freeze(['upload', 'host-export']);

/**
 * 从全部文件记录中筛出暂存区源包（纯函数）
 * @param {Array<{origin?: string}>} files
 * @returns {Array} origin ∈ upload|host-export 的记录
 */
export function filterStashFiles(files) {
  const set = new Set(STASH_ORIGINS);
  return (files || []).filter((f) => set.has(f.origin));
}

/**
 * 计算批操作可用性（纯函数）
 * @param {Set<string>} selectedIds
 * @param {boolean} [isHostAvailable]
 * @returns {{ canLoad: boolean, canDownload: boolean, canRestore: boolean, canDelete: boolean }}
 */
export function stashBatchCapability(selectedIds, isHostAvailable = false) {
  const n = selectedIds ? selectedIds.size : 0;
  return {
    canLoad: n === 1,               // 载入为源：单选语义
    canBatchConvert: n > 0,         // 批量转换：多选才有意义，但单选也允许（等价于转这一个）
    canDownload: n > 0,
    canRestore: n > 0 && isHostAvailable,
    canDelete: n > 0,
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const ORIGIN_LABELS = {
  upload: { text: '上传', cls: 'origin-upload' },
  'host-export': { text: '宿主导出', cls: 'origin-host' },
};

/** 分组展示顺序：声明序即渲染序（R-A1）；未登记来源排其后（键序稳定） */
const ORIGIN_GROUP_ORDER = Object.freeze(['upload', 'host-export']);

/** 折叠态（纯视图态，模块级 Set；参与业务的选中态在渲染闭包内，不在此处） */
const collapsedStashGroups = new Set();

/** 重置分组折叠视图态（测试接缝；不触碰选中/业务状态） */
export function resetStashGroupCollapse() {
  collapsedStashGroups.clear();
}

/**
 * 按来源给源包分组（纯函数，R-A1）
 * @param {Array<{origin?: string}>} files
 * @returns {Array<{key: string, label: string, items: Array}>} 每组带稳定顺序，空组不产出
 */
export function groupStashFiles(files) {
  const buckets = new Map();
  for (const f of files || []) {
    const key = f.origin || 'upload';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(f);
  }
  const rank = (key) => {
    const idx = ORIGIN_GROUP_ORDER.indexOf(key);
    return idx === -1 ? ORIGIN_GROUP_ORDER.length : idx;
  };
  return [...buckets.entries()]
    .sort((a, b) => (rank(a[0]) - rank(b[0])) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, items]) => ({
      key,
      label: (ORIGIN_LABELS[key] || { text: key }).text,
      items,
    }));
}

function triggerDownload(full) {
  if (!full?.blob || typeof document === 'undefined') return;
  const url = URL.createObjectURL(full.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = full.name;
  document.body.appendChild(a); // dom-scope:allow 下载锚点：临时 <a> 必须挂进文档 click() 才会触发下载，紧随其后即 removeChild
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

let activeRowMenu = null;

/** 关闭已展开的行内「更多」菜单 */
function closeRowMenu() {
  if (activeRowMenu) {
    activeRowMenu.remove();
    activeRowMenu = null;
  }
}

/**
 * 打开行内「更多」菜单（自绘，不依赖宿主弹窗模块）。
 * 用户裁决：暂存区行内动作缩为「载入 + ⋯」，其余动作收进菜单，消除与批量条的双重表达。
 * @param {HTMLElement} anchor 触发按钮
 * @param {Array<{label: string, onClick: () => void|Promise<void>}>} actions
 */
function openRowMenu(anchor, actions) {
  if (typeof document === 'undefined' || !anchor) return;
  closeRowMenu();

  const menu = document.createElement('div');
  menu.className = 'stash-row-menu';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu_button';
    btn.textContent = action.label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeRowMenu();
      action.onClick();
    });
    menu.appendChild(btn);
  }
  anchor.parentElement.appendChild(menu);
  activeRowMenu = menu;

  // 点击菜单外部或滚动时收起
  const onOutside = (e) => {
    if (!menu.contains(e.target)) closeRowMenu();
  };
  setTimeout(() => {
    document.addEventListener('click', onOutside, { once: true });
  }, 0);
}

/**
 * 渲染上传暂存区列表
 * @param {object} params
 * @param {HTMLElement} params.containerEl #stash-list
 * @param {HTMLElement|null} [params.batchBarEl] #stash-batch-bar
 * @param {string|null} [params.activeFileId] 当前载入为源的文件 id
 * @param {boolean} [params.isHostAvailable]
 * @param {function(object): void} params.onLoadFile (fileRecord) => void
 * @param {function(): void} [params.onListChanged]
 * @param {function(object): void} [params.onRestoreToHost]
 * @param {function(Array<object>): void} [params.onBatchConvert] (fileRecords[]) => void
 *   批量转换入口：把选中的源包逐个转换为当前目标格式。
 *   **未注入时不渲染该按钮**（与 onRestoreToHost 同形的可选接缝，保持本组件可脱离宿主单测）。
 * @param {'origin'|null} [params.groupBy] 分组维度：'origin'=按来源分组（默认）；
 *   null=平铺不分组（内置回退开关，单测两态锁定）
 */
export async function renderStashList({
  containerEl,
  batchBarEl = null,
  activeFileId = null,
  isHostAvailable = false,
  onLoadFile,
  onListChanged,
  onRestoreToHost,
  onBatchConvert,
  confirmFn = null,
  groupBy = 'origin',
}) {
  if (!containerEl) return;
  // 删除确认走宿主原生弹窗（由调用方注入 host-bridge 的 confirmDialog），
  // 未注入时降级为 window.confirm——保持本组件可脱离宿主单测。
  const askConfirm = typeof confirmFn === 'function'
    ? confirmFn
    : (msg) => Promise.resolve(typeof window !== 'undefined' ? window.confirm(msg) : true);
  const all = await listStoredFiles();
  const files = filterStashFiles(all);
  const selected = new Set();

  containerEl.innerHTML = '';
  if (batchBarEl) batchBarEl.innerHTML = '';

  if (files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'archive-empty';
    empty.textContent = '无源包';
    containerEl.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'archive-item-list stash-list';

  const refreshBatchBar = () => {
    if (!batchBarEl) return;
    batchBarEl.innerHTML = '';
    batchBarEl.hidden = selected.size === 0;
    if (selected.size === 0) return;
    const cap = stashBatchCapability(selected, isHostAvailable);
    const label = document.createElement('span');
    label.className = 'eq-selected-label';
    label.textContent = `已选 ${selected.size} 项:`;
    batchBarEl.appendChild(label);
    const mkBtn = (html, title, enabled, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu_button btn-tool';
      b.innerHTML = trustedStaticMarkup(html);
      if (title) b.title = title;
      b.disabled = !enabled;
      b.addEventListener('click', onClick);
      return b;
    };
    batchBarEl.appendChild(mkBtn('<i class="fa-solid fa-folder-open"></i> 载入为源', '将选中的第一个包设为当前转换源', cap.canLoad, async () => {
      const firstId = [...selected][0];
      const full = await getFile(firstId);
      if (full && typeof onLoadFile === 'function') onLoadFile(full);
    }));
    // 批量转换：把选中的源包**逐个**转换为当前目标格式（R-16 / U-7 的入口）
    if (typeof onBatchConvert === 'function') {
      batchBarEl.appendChild(mkBtn(
        '<i class="fa-solid fa-bolt"></i> 批量转换',
        '把选中的源包逐个转换为当前目标格式',
        cap.canBatchConvert,
        async () => {
          const records = [];
          for (const id of selected) {
            const full = await getFile(id);
            if (full?.blob) records.push(full);
          }
          if (records.length > 0) onBatchConvert(records);
        },
      ));
    }
    batchBarEl.appendChild(mkBtn('<i class="fa-solid fa-download"></i> 下载', '', cap.canDownload, async () => {
      for (const id of selected) {
        triggerDownload(await getFile(id));
      }
    }));
    if (cap.canRestore && typeof onRestoreToHost === 'function') {
      batchBarEl.appendChild(mkBtn('<i class="fa-solid fa-rotate"></i> 写回宿主', '', true, async () => {
        const firstId = [...selected][0];
        const full = await getFile(firstId);
        if (full?.blob) onRestoreToHost(full);
      }));
    }
    batchBarEl.appendChild(mkBtn('<i class="fa-solid fa-trash"></i> 删除', '', cap.canDelete, async () => {
      if (!(await askConfirm(`确定删除选中的 ${selected.size} 个源包吗？`))) return;
      for (const id of [...selected]) {
        selected.delete(id);
        await deleteFile(id);
      }
      if (typeof onListChanged === 'function') onListChanged();
    }));
  };

  const buildCard = (file) => {
    const isActive = file.id === activeFileId;
    const item = document.createElement('div');
    item.className = `archive-card ${isActive ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'archive-info';
    const label = ORIGIN_LABELS[file.origin] || { text: file.origin || '上传', cls: 'origin-upload' };
    const activeBadge = isActive ? '<span class="badge-active-file">当前源</span>' : '';
    info.innerHTML = `
      <div class="eq-name-row">
        <input type="checkbox" class="stash-select-box" data-id="${escapeHtml(file.id)}" title="加入选择">
        <span class="archive-name">${escapeHtml(file.name)}</span>
        ${trustedStaticMarkup(activeBadge)}
      </div>
      <div class="archive-meta">
        <span class="origin-badge ${escapeHtml(label.cls)}">${escapeHtml(label.text)}</span>
        <span class="meta-badge">${escapeHtml((file.layout || '未知').toUpperCase())}</span>
        <span>${escapeHtml(formatBytes(file.size))}</span>
      </div>
    `;
    item.appendChild(info);

    // ⚠️ ⚠️ 本块**三样东西都不可删**（2026-09-27 实测事故）：`f9c7cfe`「按钮契约解耦」
    // 把行级按钮工厂搬进了 `refreshBatchBar`（那是**批量条**的 4 参签名），却漏删了
    // 行级的两处声明 —— 而下面的调用点仍在引用它们：
    //   ① `btns`（容器）  ② `mkBtn`（行级工厂，(cls, text, title, onClick) 签名）
    // ⇒ `renderStashList` 在**第一个非当前源条目**上抛 `ReferenceError: btns is not defined`
    // （修掉 ① 后紧接着就是 `mkBtn is not defined`）⇒ 容器在函数末尾的
    // `containerEl.appendChild(list)` **之前**就中断 ⇒ **暂存区恒为空**（连空态占位都没有），
    // 且 `index.js` 的 `updateWorkspaceUI` 里同一处 try/catch 会连带跳过配额条与待导出区的刷新。
    // 静默性极强：单测只覆盖 `filterStashFiles` / `stashBatchCapability` 两个纯函数，
    // **渲染路径无人守** ⇒ 缺陷潜伏两个提交未被发现，最终由 E2E 矩阵的 M-10 抓出
    // （页面控制台里只有一行 `[warning] 刷新工作区 UI 失败: ReferenceError: btns is not defined`）。
    // 守护见 `test/stash-list-render.test.js`。
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

    // 行内只留「载入 + ⋯」：下载 / 写回宿主 / 删除 收进更多菜单，
    // 消除与批量条动作的双重表达（用户裁决 9）。
    if (!isActive) {
      btns.appendChild(mkBtn('load', '载入', '载入为当前转换源', async () => {
        const full = await getFile(file.id);
        if (full && typeof onLoadFile === 'function') onLoadFile(full);
      }));
    }
    btns.appendChild(mkBtn('more', '⋯', '更多操作', () => {
      const actions = [
        {
          label: '下载',
          onClick: async () => triggerDownload(await getFile(file.id)),
        },
      ];
      if (isHostAvailable && typeof onRestoreToHost === 'function') {
        actions.push({
          label: '写回宿主',
          onClick: async () => {
            const full = await getFile(file.id);
            if (full?.blob) onRestoreToHost(full);
          },
        });
      }
      actions.push({
        label: '删除',
        onClick: async () => {
          if (!(await askConfirm(`确定要从暂存区删除「${file.name}」吗？`))) return;
          await deleteFile(file.id);
          if (typeof onListChanged === 'function') onListChanged();
        },
      });
      openRowMenu(btns.lastElementChild, actions);
    }));
    item.appendChild(btns);
    return item;
  };

  if (groupBy === 'origin') {
    // R-A1 按来源分组：组头 = 折叠钮 + 三态组勾选 + 徽标计数；空组不渲染（groupStashFiles 不产出）
    for (const group of groupStashFiles(files)) {
      const section = document.createElement('div');
      section.className = 'stash-group';
      section.dataset.group = group.key;

      const head = document.createElement('div');
      head.className = 'stash-group-head';
      const body = document.createElement('div');
      body.className = 'stash-group-body';

      const collapsed = collapsedStashGroups.has(group.key);
      body.hidden = collapsed;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'menu_button stash-group-toggle';
      toggle.textContent = collapsed ? '▸' : '▾';
      toggle.title = collapsed ? '展开' : '收起';
      toggle.addEventListener('click', () => {
        const now = !collapsedStashGroups.has(group.key);
        if (now) collapsedStashGroups.add(group.key);
        else collapsedStashGroups.delete(group.key);
        body.hidden = now;
        toggle.textContent = now ? '▸' : '▾';
        toggle.title = now ? '展开' : '收起';
      });

      // 组勾选三态是选中集合的**派生读数**；点击只批量改组内成员，跨组多选不受影响
      const groupBox = document.createElement('input');
      groupBox.type = 'checkbox';
      groupBox.className = 'stash-group-box';
      groupBox.title = '组内全选';
      const syncGroupBox = () => {
        const hit = group.items.filter((f) => selected.has(f.id)).length;
        groupBox.checked = hit === group.items.length && hit > 0;
        groupBox.indeterminate = hit > 0 && hit < group.items.length;
      };
      groupBox.addEventListener('change', () => {
        const allIn = group.items.every((f) => selected.has(f.id));
        for (const box of body.querySelectorAll('.stash-select-box')) {
          box.checked = !allIn;
          if (allIn) selected.delete(box.dataset.id);
          else selected.add(box.dataset.id);
        }
        syncGroupBox();
        refreshBatchBar();
      });

      const label = document.createElement('span');
      label.className = 'stash-group-label';
      label.textContent = group.label;
      const totalBytes = group.items.reduce((sum, f) => sum + (f.size || 0), 0);
      const count = document.createElement('span');
      count.className = 'stash-group-count';
      count.textContent = `${group.items.length} 项 · ${formatBytes(totalBytes)}`;

      head.append(toggle, groupBox, label, count);
      for (const file of group.items) body.appendChild(buildCard(file));
      syncGroupBox();
      section.append(head, body);
      list.appendChild(section);
    }
  } else {
    for (const file of files) list.appendChild(buildCard(file));
  }
  containerEl.appendChild(list);

  list.addEventListener('change', (e) => {
    const box = e.target.closest('.stash-select-box');
    if (!box) return;
    if (box.checked) selected.add(box.dataset.id);
    else selected.delete(box.dataset.id);
    refreshBatchBar();
  });
}
