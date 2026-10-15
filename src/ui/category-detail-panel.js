/**
 * 类目明细**全屏**面板。
 *
 * 为什么要全屏（用户 2026-10-15：「禁止任何被覆盖，置于下方」）：
 * 明细原本**内联展开**在类目卡片下方，一展开就把后面所有内容顶下去——
 * 13 个类目里展开任何一个，后面的类目、执行区、报告区全部移位；
 * 叠加「8 个区块常驻」就是外层滚动条的来源之一。改成全屏后，明细不再参与主列布局。
 *
 * **复用而非重写**：明细内容仍由 `file-tree-picker.js` 的 `createCategoryDetailList`
 * 渲染（搜索 / 排序 / 逐项穿透反选全在其中，一份实现），本模块只负责把它装进一个全屏壳。
 *
 * 挂载点选 `document.body`（与 `index.js` 的工作台模态同范式，已带 `dom-scope:allow` 标记）：
 * 挂进扩展抽屉会被其 `overflow`/`transform` 裁剪，`position: fixed` 就不再有全屏语义。
 */

import { createCategoryDetailList } from './file-tree-picker.js';

/** 当前打开的面板（同一时刻只允许一个） */
let activeOverlay = null;

function onKeydown(e) {
  if (e.key === 'Escape') closeCategoryDetailPanel();
}

/**
 * 关闭明细面板。幂等。
 * @returns {boolean} 是否真的关掉了一个
 */
export function closeCategoryDetailPanel() {
  if (!activeOverlay) return false;
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
  activeOverlay.remove();
  activeOverlay = null;
  return true;
}

/** 面板是否开着（E2E 与宿主热重载判定用） */
export function isCategoryDetailPanelOpen() {
  return !!activeOverlay;
}

/**
 * 打开某类目的明细面板。
 *
 * @param {object} params
 * @param {HTMLElement} params.mountEl 挂载点（工作台根容器）
 * @param {string} params.categoryKey
 * @param {string} params.label 类目显示名（面板标题用）
 * @param {Array<object>} params.items 该类目的逐项明细
 * @param {Set<string>} params.excludedPaths **活引用**——明细组件的勾选态直接读它
 * @param {string|null} [params.actionFilter]
 * @param {(sourcePath: string, checked: boolean) => void} params.onItemToggle
 * @param {() => void} [params.onClosed] 关闭后回调（让调用方刷新类目卡片上的读数）
 * @returns {HTMLElement|null}
 */
export function openCategoryDetailPanel({
  categoryKey,
  label,
  items,
  excludedPaths,
  actionFilter = null,
  onItemToggle,
  onClosed,
}) {
  if (typeof document === 'undefined') return null;
  closeCategoryDetailPanel();

  const overlay = document.createElement('div');
  overlay.className = 'wb-detail-overlay';
  // 必须带 id：浮层挂在 document.body 上，**不在** `#app.app-container` 内，
  // 而本仓 CSS 的双前缀铁律要求规则带前缀 —— 带 id 才既满足铁律又能命中。
  // 与既有模态 `#st-converter-modal-overlay` 同一处理（同为挂 body 的自绘浮层）。
  overlay.id = 'wb-detail-overlay';
  overlay.dataset.category = categoryKey;

  const card = document.createElement('div');
  card.className = 'wb-detail-card';

  const head = document.createElement('div');
  head.className = 'wb-detail-head';

  const title = document.createElement('span');
  title.className = 'wb-detail-title';
  title.textContent = `${label} · ${items.length} 项`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'menu_button';
  closeBtn.id = 'btn-close-category-detail';
  closeBtn.textContent = '关闭';

  const finish = () => {
    closeCategoryDetailPanel();
    if (typeof onClosed === 'function') onClosed();
  };
  closeBtn.addEventListener('click', finish);

  head.appendChild(title);
  head.appendChild(closeBtn);
  card.appendChild(head);

  card.appendChild(createCategoryDetailList({
    categoryKey,
    items,
    excludedPaths,
    actionFilter,
    onItemToggle: (sourcePath, checked) => {
      onItemToggle(sourcePath, checked);
      // 就地更新标题里的选中读数；不重建面板，以免丢掉搜索词与滚动位置
      const on = items.filter((it) => !excludedPaths.has(it.sourcePath) && !excludedPaths.has(it.hubPath)).length;
      title.textContent = `${label} · 已选 ${on}/${items.length}`;
    },
  }));

  // 点遮罩（卡片之外）关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish();
  });

  overlay.appendChild(card);
  document.body.appendChild(overlay); // dom-scope:allow 自绘模态覆盖层必须挂 body 才能全页覆盖（放进扩展抽屉会被其 overflow/transform 裁剪）
  activeOverlay = overlay;
  document.addEventListener('keydown', onKeydown);
  return overlay;
}
