/**
 * 工作台会话与检查面板（2026-10-14 由 `migration-wizard.js` 改造）。
 *
 * 原「迁移向导」外壳（六步步骤条 / 向导模式·高级模式切换 / 不兼容门）已按用户裁定
 * **整体删除**：它把同一份工作台 DOM 用 `data-wb-step` 分段显隐，结果第 6 步是空的、
 * 第 3 步显示的不是范围选择器，而不兼容门因为 `style.css` 的 `display` 压过 `hidden`
 * 变成全程可见的空壳框（且 `showGate()` 全仓无调用点）。现在界面是**单一视图**。
 *
 * 本模块只保留三件确实还在用的纯逻辑 + 一个 DOM 写入点：
 *   1. `evaluateSavedSession` —— 会话不兼容判定（语义仍归 `src/core/migration-session.js`）；
 *   2. `formatSpecialExclusionSummary` —— 特殊类目「默认不含」的差异摘要；
 *   3. `writeCheckPanel` —— 把计划读数与排除项写进检查面板。
 *
 * 分层：除 `writeCheckPanel` 外全部无 DOM，可在 Node/Vitest 直接跑（本仓 Vitest 默认
 * `environment: 'node'`，无 jsdom）。
 */

import { classifySessionCompatibility, SESSION_ACTIONS } from '../core/migration-session.js';

/**
 * 「关键输入已变」标记（纯）。
 *
 * 表达「计划快照之后的确认作废」，与 `createMigrationPlan` 的 `revision` 单调递增
 * 是同一件事的界面侧。原来挂在向导状态机上，向导删除后独立成最小状态。
 */
export function createStaleFlag() {
  let stale = false;
  return {
    mark: () => { stale = true; },
    clear: () => { stale = false; },
    isStale: () => stale,
  };
}

/**
 * 已保存会话能否沿用（纯）。**显式拒绝**，不是静默忽略旧记录。
 *
 * `record` 为 `null`（从未保存过会话）时**不拦**——那不是「旧数据」，是「没有数据」。
 * 作废的只是**会话状态**；磁盘上的包与半成品文件不删不动（见 `migration-session.js` 第 8 行）。
 *
 * 原实现带一个「不兼容门」浮层控件（标题 + 理由 + 从源重开按钮）。该控件已删除：
 * 它在全仓**没有任何调用点**，却因 CSS 覆盖 `hidden` 而永远显示为空框。
 * 现在只返回判定结果，由调用方决定提示方式。
 *
 * @param {unknown} record
 * @returns {{blocked: boolean, message: string}}
 */
export function evaluateSavedSession(record) {
  if (record === null || record === undefined) {
    return { blocked: false, message: '' };
  }
  const verdict = classifySessionCompatibility(record);
  if (verdict.compatible) {
    return { blocked: false, message: '' };
  }
  return { blocked: true, message: verdict.reason };
}

/** 会话动作常量透出，便于调用方与 `src/core/migration-session.js` 对齐。 */
export { SESSION_ACTIONS };

/**
 * 把「默认不含的特殊类目」编成检查面板的一行汇总（纯函数）。
 *
 * 存在原因（OQ-1 裁决的配套）：用户裁定「13 键为准」后，`backups` 进了默认范围，
 * 但 `cache` / `appPrivate` 仍**默认不含**。差异必须**明说**——「不可默认漏掉数据」
 * 的落点是「不静默丢」，不是「全都塞进去」。
 *
 * 只覆盖**特殊类目**：标准类目的排除是逐条的，已由 `plan.categories[*].items` 逐项呈现。
 *
 * @param {Array<{key: string, flag: string, reason?: string}>} [exclusions]
 * @returns {string} 形如 `本次不含：cache（includeCache=false，…）· appPrivate（…）`；无排除时为空串
 */
export function formatSpecialExclusionSummary(exclusions = []) {
  const list = Array.isArray(exclusions) ? exclusions.filter((e) => e && e.key) : [];
  if (list.length === 0) return '';
  const parts = list.map((e) => {
    const tail = e.reason ? `，${e.reason}` : '';
    return `${e.key}（${e.flag}=false${tail}）`;
  });
  return `本次不含：${parts.join(' · ')}`;
}

/**
 * 把计划读数与排除项写进检查面板（**本模块唯一的 DOM 写入点**）。
 *
 * 全部走 `textContent` / `createElement`，不接受 HTML 字符串——既避开注入面，
 * 也让 `check:dom-injection` 无需豁免。
 *
 * @param {ParentNode} root 工作台根容器（`#app.app-container`）
 * @param {{summary?: string, exclusions?: Array<{label: string, reason?: string}>}} [data]
 */
export function writeCheckPanel(root, { summary = '', exclusions = [] } = {}) {
  if (!root) return;
  const summaryEl = root.querySelector('#wizard-check-summary');
  if (summaryEl) summaryEl.textContent = summary;

  const listEl = root.querySelector('#wizard-check-exclusions');
  if (!listEl) return;
  listEl.textContent = '';
  for (const item of exclusions) {
    const li = document.createElement('li');
    li.textContent = item && item.reason ? `${item.label} — ${item.reason}` : String(item?.label ?? '');
    listEl.appendChild(li);
  }
}
