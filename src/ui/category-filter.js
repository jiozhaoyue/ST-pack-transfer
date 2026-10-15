import { CATEGORIES, CATEGORY_LABELS } from '../core/inspect.js';
import { ACTION_LABELS, SPECIAL_CATEGORIES, SPECIAL_LABELS } from '../core/plan-preview.js';
import { DEFAULT_SELECTION } from '../core/selection-defaults.js';
import { actionTokenVar } from './action-colors.js';
import { openCategoryDetailPanel } from './category-detail-panel.js';

/**
 * **界面上合并成一条**的类目（用户 2026-10-15：「扩展列表处只留一条」）。
 *
 * 键 = 卡片 key；值 = 该卡片实际驱动的全部 selection 键。
 *
 * 为什么只在**界面**合并：用户扩展与第三方扩展对用户是同一个概念（都叫扩展），
 * 分两行既占地方、又要分别勾选；但 `selection` 语义上必须保留两个键——
 * 宿主端点（`/api/users/backup`）按这两个键分开认，合并成一个键会让第三方扩展静默丢失。
 * 所以「一张卡片驱动两个键」，不是「删掉一个键」。
 */
const MERGED_CATEGORY_GROUPS = Object.freeze({
  [CATEGORIES.EXTENSIONS]: Object.freeze([CATEGORIES.EXTENSIONS, CATEGORIES.GLOBAL_EXTENSIONS]),
});

/** 合并卡片的显示名（不写则回落成员各自的标签，会出现「用户扩展」这种只指一半的名字） */
const MERGED_CATEGORY_LABELS = Object.freeze({
  [CATEGORIES.EXTENSIONS]: '扩展',
});

/** 被并入别处的类目键 → 承载它的卡片键（这些键不再单独出卡片） */
const MERGED_INTO = Object.freeze(
  Object.entries(MERGED_CATEGORY_GROUPS).reduce((acc, [primary, members]) => {
    for (const m of members) if (m !== primary) acc[m] = primary;
    return acc;
  }, {}),
);

const CATEGORY_ICONS = {
  [CATEGORIES.CHARACTERS]: 'fa-solid fa-user-ninja',
  [CATEGORIES.CHATS]: 'fa-solid fa-comments',
  [CATEGORIES.LOREBOOKS]: 'fa-solid fa-book-bookmark',
  [CATEGORIES.PRESETS]: 'fa-solid fa-sliders',
  [CATEGORIES.SETTINGS]: 'fa-solid fa-gear',
  [CATEGORIES.SECRETS]: 'fa-solid fa-key',
  [CATEGORIES.ASSETS]: 'fa-solid fa-image',
  [CATEGORIES.EXTENSIONS]: 'fa-solid fa-puzzle-piece',
  [CATEGORIES.GLOBAL_EXTENSIONS]: 'fa-solid fa-globe',
  [CATEGORIES.VECTORS]: 'fa-solid fa-brain',
  [SPECIAL_CATEGORIES.BACKUPS]: 'fa-solid fa-box-archive',
  [SPECIAL_CATEGORIES.CACHE]: 'fa-solid fa-bolt',
  [SPECIAL_CATEGORIES.APP_PRIVATE]: 'fa-solid fa-lock',
};

/**
 * 当前勾选意图（requested）。**初值来自唯一默认源** `src/core/selection-defaults.js`——
 * 用户 2026-10-14 裁定 OQ-1「13 键为准」后，这张表不再手写第二份，
 * 否则会与端点缺省体、模板复选框默认三处漂移（`selection-semantics.md` §2/§4 的双轨陷阱）。
 */
let currentSelection = { ...DEFAULT_SELECTION };

let currentExcludedPaths = new Set();
let availableCategories = new Set();
let activeActionFilter = null;
let currentPlan = null;
let onSelectionChangeCallback = null;

/**
 * 尚未扫描到数据包时仍列出全部 13 个类目（用户 2026-10-15：面板不能是空的，
 * 每一项都要能单独勾选）。此标记随扫描结果到来而关闭。
 */
let isUnscanned = false;

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 更新类目头部摘要统计（如：已选 4/6 项）
 */
function updateSummaryBadge() {
  const badge = document.getElementById('category-summary-badge');
  if (!badge) return;

  const totalAvail = availableCategories.size;
  if (totalAvail === 0) {
    badge.textContent = '';
    return;
  }

  let selectedAvail = 0;
  for (const cat of availableCategories) {
    if (currentSelection[cat]) selectedAvail += 1;
  }

  const excludedCount = currentExcludedPaths.size;
  const excludedSuffix = excludedCount > 0 ? ` (穿透排除 ${excludedCount} 个文件)` : '';
  badge.textContent = `已选 ${selectedAvail}/${totalAvail} 类目${excludedSuffix}`;
}

/**
 * 初始化类目过滤器组件事件监听
 * @param {object} params
 * @param {function} [params.onSelectionChange]
 */
export function setupCategoryFilter({ onSelectionChange } = {}) {
  onSelectionChangeCallback = onSelectionChange;
  const panel = document.getElementById('category-panel');
  if (!panel) return;

  const btnSelectAll = document.getElementById('btn-select-all');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', selectAll);
  }

  const btnDeselectAll = document.getElementById('btn-deselect-all');
  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', deselectAll);
  }

  const btnInvertSelect = document.getElementById('btn-invert-select');
  if (btnInvertSelect) {
    btnInvertSelect.addEventListener('click', invertSelection);
  }

  renderCategoryDefaults();
}

/**
 * 还没扫描到数据包时，先把全部 13 个类目列出来，每一项都能单独勾选
 * （用户 2026-10-15：面板不能空着）。扫描结果到达后由 `renderCategoryStats` 接管。
 */
export function renderCategoryDefaults() {
  const categories = {};
  for (const key of Object.keys(DEFAULT_SELECTION)) {
    categories[key] = { count: 0, sizeBytes: 0, items: [] };
  }
  renderCategoryStats({ categories }, { unscanned: true });
}

/**
 * 依据 inspectArchive 或 generatePlan 结果渲染细粒度类目卡片与动作预测条
 * @param {object} planOrInspectResult
 */
export function renderCategoryStats(planOrInspectResult, opts = {}) {
  const panel = document.getElementById('category-panel');
  const container = document.getElementById('category-checkboxes');
  const planSummaryBar = document.getElementById('plan-summary-bar');
  const actionBadgesEl = document.getElementById('action-stats-badges');
  const outputEstimateEl = document.getElementById('output-estimate-text');

  if (!panel || !container || !planOrInspectResult?.categories) return;

  // 只有显式传入才改模式：内部重渲染（展开明细 / 动作筛选）须沿用当前模式
  if (typeof opts.unscanned === 'boolean') isUnscanned = opts.unscanned;
  currentPlan = planOrInspectResult;

  // 1. 渲染完全扫描动作预测汇总条
  if (planSummaryBar && planOrInspectResult.actionStats) {
    planSummaryBar.style.display = 'flex';
    if (actionBadgesEl) {
      actionBadgesEl.innerHTML = '';
      for (const [actionKey, count] of Object.entries(planOrInspectResult.actionStats)) {
        if (count > 0) {
          const info = ACTION_LABELS[actionKey] || { label: actionKey };
          const actionColor = actionTokenVar(info.token);
          const badge = document.createElement('button');
          badge.type = 'button';
          const isActive = activeActionFilter === actionKey;
          badge.className = `action-summary-pill pill-${actionKey.toLowerCase()} ${isActive ? 'active' : ''}`;
          badge.textContent = `${info.label} ${count}`;
          badge.style.borderColor = actionColor;
          badge.style.color = isActive ? '#fff' : actionColor;
          if (isActive) badge.style.background = actionColor;
          badge.title = `点击${isActive ? '取消' : '按'}「${info.label}」动作筛选文件明细`;

          badge.addEventListener('click', (e) => {
            e.preventDefault();
            // 动作筛选不再「顺带展开类目」——明细已改为全屏打开，
            // 筛选值经 `openCategoryDetailPanel({ actionFilter })` 传进面板
            activeActionFilter = activeActionFilter === actionKey ? null : actionKey;
            renderCategoryStats(currentPlan);
          });

          actionBadgesEl.appendChild(badge);
        }
      }
      if (activeActionFilter) {
        const btnClearFilter = document.createElement('button');
        btnClearFilter.type = 'button';
        btnClearFilter.className = 'btn-clear-action-filter';
        btnClearFilter.innerHTML = '<i class="fa-solid fa-rotate-left"></i> 重置动作筛选';
        btnClearFilter.addEventListener('click', (e) => {
          e.preventDefault();
          activeActionFilter = null;
          renderCategoryStats(currentPlan);
        });
        actionBadgesEl.appendChild(btnClearFilter);
      }
    }
    if (outputEstimateEl) {
      const outFiles = planOrInspectResult.expectedOutputFiles ?? 0;
      const outBytes = planOrInspectResult.expectedOutputBytes ?? 0;
      outputEstimateEl.textContent = `预计产物: ${outFiles} 个文件 · ${formatBytes(outBytes)}`;
    }
  }

  // 2. 渲染类目卡片与穿透明细
  container.innerHTML = '';
  availableCategories.clear();

  for (const [rawKey, rawData] of Object.entries(planOrInspectResult.categories)) {
    // 被并入别处的类目不出卡片：它的读数与勾选由承载它的那张卡片一并处理
    if (MERGED_INTO[rawKey]) continue;
    const memberKeys = MERGED_CATEGORY_GROUPS[rawKey] || [rawKey];
    // 合并卡片的读数：计数与体积求和、明细条目拼接（驱动同一张卡片的多个 selection 键）
    const data = memberKeys.length > 1
      ? {
        ...rawData,
        count: memberKeys.reduce((n, k) => n + (planOrInspectResult.categories[k]?.count || 0), 0),
        sizeBytes: memberKeys.reduce((n, k) => n + (planOrInspectResult.categories[k]?.sizeBytes || 0), 0),
        items: memberKeys.flatMap((k) => planOrInspectResult.categories[k]?.items || []),
      }
      : rawData;
    const key = rawKey;
    const isAvailable = isUnscanned
      || memberKeys.some((k) => (planOrInspectResult.categories[k]?.count || 0) > 0);
    if (isAvailable) {
      for (const k of memberKeys) {
        availableCategories.add(k);
        if (typeof currentSelection[k] === 'undefined') {
          currentSelection[k] = (k !== SPECIAL_CATEGORIES.CACHE);
        }
      }
    } else {
      for (const k of memberKeys) currentSelection[k] = false;
    }

    const card = document.createElement('div');
    card.className = `category-card ${isAvailable ? '' : 'disabled'}`;
    card.dataset.category = key;

    const header = document.createElement('div');
    header.className = 'category-card-header';

    const labelWrap = document.createElement('label');
    labelWrap.className = 'category-item-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.category = key;
    checkbox.disabled = !isAvailable;

    // 检查该分类下是否部分被单项排除
    const items = data.items || [];
    let excludedInThisCat = 0;
    items.forEach((it) => {
      if (currentExcludedPaths.has(it.sourcePath) || currentExcludedPaths.has(it.hubPath)) {
        excludedInThisCat += 1;
      }
    });

    if (!isAvailable) {
      checkbox.checked = false;
    } else if (memberKeys.every((k) => currentSelection[k] === false)) {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    } else if (excludedInThisCat === 0) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else if (excludedInThisCat >= items.length) {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    } else {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    }

    checkbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      // 一张卡片驱动多个 selection 键（合并类目）——逐个写，别只写主键，
      // 否则「第三方扩展」会静默留在旧值上（宿主端点按两个键分开认）。
      for (const k of memberKeys) currentSelection[k] = isChecked;
      checkbox.indeterminate = false;

      // 如果勾选整个类目，清除属于该类目的单项排除
      if (isChecked) {
        items.forEach((it) => {
          currentExcludedPaths.delete(it.sourcePath);
          currentExcludedPaths.delete(it.hubPath);
        });
      } else {
        // 如果取消整个类目，清除单项排除避免冗余记录
        items.forEach((it) => {
          currentExcludedPaths.delete(it.sourcePath);
          currentExcludedPaths.delete(it.hubPath);
        });
      }

      updateSummaryBadge();
      notifySelectionChanged();
    });

    const icon = document.createElement('i');
    icon.className = `cat-icon ${CATEGORY_ICONS[key] || 'fa-solid fa-folder'}`;

    const text = document.createElement('span');
    text.className = 'cat-text';
    text.textContent = MERGED_CATEGORY_LABELS[key] || data.label || CATEGORY_LABELS[key] || SPECIAL_LABELS[key] || key;

    labelWrap.appendChild(checkbox);
    labelWrap.appendChild(icon);
    labelWrap.appendChild(text);

    const rightGroup = document.createElement('div');
    rightGroup.className = 'category-right-group';

    const badge = document.createElement('span');
    badge.className = 'cat-badge';
    badge.textContent = isUnscanned
      ? '待扫描'
      : (isAvailable ? `${data.count} 项 · ${formatBytes(data.sizeBytes)}` : '0 项 · 0 B');

    rightGroup.appendChild(badge);

    // 明细**全屏打开**，不再内联展开（用户 2026-10-15：「禁止任何被覆盖，置于下方」）。
    // 内联展开会把后面所有类目、执行区、报告区一并顶下去，是外层滚动条的来源之一。
    if (items.length > 0) {
      const btnExpand = document.createElement('button');
      btnExpand.type = 'button';
      btnExpand.className = 'btn-expand-detail';
      btnExpand.textContent = '明细';
      btnExpand.title = '全屏查看该类目下的每个文件与动作，支持穿透反选';

      btnExpand.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCategoryDetailPanel({
          categoryKey: key,
          label: text.textContent,
          items,
          excludedPaths: currentExcludedPaths,
          actionFilter: activeActionFilter,
          onItemToggle: (sourcePath, checked) => {
            if (checked) {
              currentExcludedPaths.delete(sourcePath);
            } else {
              currentExcludedPaths.add(sourcePath);
            }
            notifySelectionChanged();
          },
          // 关闭时整块重绘：类目卡片上的「已选 N/M」与三态勾选要跟着明细里的逐项反选走
          onClosed: () => { if (currentPlan) renderCategoryStats(currentPlan); },
        });
      });

      rightGroup.appendChild(btnExpand);
    }

    header.appendChild(labelWrap);
    header.appendChild(rightGroup);
    card.appendChild(header);

    container.appendChild(card);
  }

  updateSummaryBadge();
  panel.style.display = 'block';
}

function notifySelectionChanged() {
  if (typeof onSelectionChangeCallback === 'function') {
    onSelectionChangeCallback({
      selection: getSelectionState(),
      excludedPaths: getExcludedPaths(),
    });
  }
}

/**
 * 全选所有包内存在的有效类目并清空单项排除
 */
export function selectAll() {
  availableCategories.forEach((cat) => {
    currentSelection[cat] = true;
  });
  currentExcludedPaths.clear();

  if (currentPlan) renderCategoryStats(currentPlan);
  updateSummaryBadge();
  notifySelectionChanged();
}

/**
 * 取消所有类目的勾选
 */
export function deselectAll() {
  availableCategories.forEach((cat) => {
    currentSelection[cat] = false;
  });
  currentExcludedPaths.clear();

  if (currentPlan) renderCategoryStats(currentPlan);
  updateSummaryBadge();
  notifySelectionChanged();
}

/**
 * 反选所有包内存在的有效类目
 */
export function invertSelection() {
  availableCategories.forEach((cat) => {
    currentSelection[cat] = !currentSelection[cat];
  });
  currentExcludedPaths.clear();

  if (currentPlan) renderCategoryStats(currentPlan);
  updateSummaryBadge();
  notifySelectionChanged();
}

/**
 * 应用辅助快捷筛选预设
 * @param {'chars'|'chats'|'safe'} preset
 */
export function applyPreset(preset) {
  currentExcludedPaths.clear();

  // 角色与聊天智能联动已恒开（用户裁决 6：移除该复选框，行为保留）
  const isLinked = true;

  availableCategories.forEach((cat) => {
    if (preset === 'chars') {
      if (isLinked) {
        currentSelection[cat] = (cat === CATEGORIES.CHARACTERS || cat === CATEGORIES.ASSETS || cat === CATEGORIES.CHATS);
      } else {
        currentSelection[cat] = (cat === CATEGORIES.CHARACTERS || cat === CATEGORIES.ASSETS);
      }
    } else if (preset === 'chats') {
      if (isLinked) {
        currentSelection[cat] = (cat === CATEGORIES.CHATS || cat === CATEGORIES.CHARACTERS || cat === CATEGORIES.ASSETS);
      } else {
        currentSelection[cat] = (cat === CATEGORIES.CHATS);
      }
    } else if (preset === 'safe') {
      currentSelection[cat] = (cat !== CATEGORIES.SECRETS && cat !== CATEGORIES.CHATS);
    }
  });

  if (currentPlan) renderCategoryStats(currentPlan);
  updateSummaryBadge();
  notifySelectionChanged();
}

/**
 * 获取当前的 10 大标准类目筛选状态
 * @returns {Record<string, boolean>}
 */
export function getSelectionState() {
  return { ...currentSelection };
}

/**
 * 设置类目筛选状态
 * @param {Record<string, boolean>} selection
 */
export function setSelectionState(selection) {
  currentSelection = { ...currentSelection, ...selection };
}

/**
 * 获取单项穿透排除集合
 * @returns {Set<string>}
 */
export function getExcludedPaths() {
  return new Set(currentExcludedPaths);
}

/**
 * 设置单项穿透排除集合
 * @param {Set<string>|Array<string>} paths
 */
export function setExcludedPaths(paths) {
  currentExcludedPaths = new Set(paths || []);
}

/**
 * 重置过滤器状态并隐藏面板
 */
export function resetCategoryFilter() {
  const panel = document.getElementById('category-panel');
  if (panel) panel.style.display = 'none';
  const container = document.getElementById('category-checkboxes');
  if (container) container.innerHTML = '';
  const planSummaryBar = document.getElementById('plan-summary-bar');
  if (planSummaryBar) planSummaryBar.style.display = 'none';

  availableCategories.clear();
  currentExcludedPaths.clear();
  currentPlan = null;
}
