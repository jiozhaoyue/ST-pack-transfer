/**
 * 迁移向导（S5 第二步 · 默认入口）。
 *
 * 向导**不是第二份 UI**：它是既有工作台 DOM 的渐进披露外壳。模板里每个区块带
 * `data-wb-step="<id>"`，容器上写 `data-wb-view` / `data-wb-step`，由 CSS 决定显隐
 * （见 `style.css` 的 `.wb-wizard` 段）。因此：
 *   · 高级模式 = 既有全量展示（`data-wb-view="advanced"`），旧行为零破坏；
 *   · 向导模式 = 一次只看一步，减少普通用户的认知负担。
 *
 * 状态共享：向导与高级工作台共用 `createMigrationSession()` 的
 * 选择/任务/计划（`migration-user-journey.md` §3.3），视图切换**只改一个属性**，不碰 session。
 *
 * 分层：本文件顶部的导出是**纯逻辑**（无 DOM，Node/Vitest 可测——本仓 Vitest 默认
 * `environment: 'node'`，无 jsdom）；DOM 装配集中在 `mountMigrationWizard`。
 */

import { classifySessionCompatibility } from '../core/migration-session.js';

/** 六步定义。顺序即用户旅程（`migration-user-journey.md` §3.3 两端流程）。 */
export const WIZARD_STEPS = Object.freeze([
  { id: 'source', index: 0, title: '来源', purpose: '选择数据包，或从当前宿主拉取' },
  { id: 'target', index: 1, title: '目标', purpose: '选择目标平台与包名' },
  { id: 'scope', index: 2, title: '范围', purpose: '选择要迁移的内容类目' },
  { id: 'check', index: 3, title: '检查', purpose: '确认范围、排除项与风险' },
  { id: 'run', index: 4, title: '执行', purpose: '开始转换并观察进度' },
  { id: 'verify', index: 5, title: '核对', purpose: '领取产物并核对结果' },
]);

/** 视图码。 */
export const WIZARD_VIEWS = Object.freeze({ WIZARD: 'wizard', ADVANCED: 'advanced' });

/** 步骤 id → 下标；未知返回 -1。 */
export function stepIndexOf(stepId) {
  return WIZARD_STEPS.findIndex((s) => s.id === stepId);
}

/** 下一步 id；已是最后一步返回 `null`。 */
export function nextStepId(stepId) {
  const i = stepIndexOf(stepId);
  if (i < 0 || i >= WIZARD_STEPS.length - 1) return null;
  return WIZARD_STEPS[i + 1].id;
}

/** 上一步 id；已是第一步返回 `null`。 */
export function prevStepId(stepId) {
  const i = stepIndexOf(stepId);
  if (i <= 0) return null;
  return WIZARD_STEPS[i - 1].id;
}

/**
 * 向导状态机（纯）。**不是第二套任务状态机**——它只记录"用户看到哪一步"，
 * 任务执行状态仍归 `TaskManager`（`migration-user-journey.md` §1）。
 *
 * `stale` 表达「关键输入已变，④检查及其后的确认作废」，与 `createMigrationPlan` 的
 * `revision` 单调递增是同一件事的界面侧（`migration-user-journey.md` §7）。
 *
 * @param {{initial?: string}} [opts]
 */
export function createWizardMachine({ initial = WIZARD_STEPS[0].id } = {}) {
  let stepId = stepIndexOf(initial) >= 0 ? initial : WIZARD_STEPS[0].id;
  let visited = [stepId];
  let stale = false;

  const goTo = (id) => {
    if (stepIndexOf(id) < 0) return false;
    stepId = id;
    if (!visited.includes(id)) visited = [...visited, id];
    return true;
  };

  return {
    getState: () => ({ stepId, visited: [...visited], stale }),
    goTo,
    next: () => {
      const n = nextStepId(stepId);
      return n ? goTo(n) : false;
    },
    prev: () => {
      const p = prevStepId(stepId);
      return p ? goTo(p) : false;
    },
    markStale: () => { stale = true; },
    clearStale: () => { stale = false; },
  };
}

/**
 * 会话不兼容门的判定（纯）。**显式拒绝**，不是"静默忽略旧记录"。
 *
 * `record` 为 `null`（从未保存过会话）时**不拦**——那不是"旧数据"，是"没有数据"。
 *
 * @param {unknown} record
 * @returns {{blocked: boolean, title: string, message: string, canReopen: boolean}}
 */
export function buildSessionGateVerdict(record) {
  if (record === null || record === undefined) {
    return { blocked: false, title: '', message: '', canReopen: false };
  }
  const verdict = classifySessionCompatibility(record);
  if (verdict.compatible) {
    return { blocked: false, title: '', message: '', canReopen: false };
  }
  return {
    blocked: true,
    title: '旧会话已作废（不兼容当前版本）',
    message: verdict.reason,
    canReopen: true,
  };
}

/** 从模板 HTML 里提取全部 `data-wb-step="…"` 取值（供守卫/单测核对归属完整）。 */
export function extractStepOwners(templateHtml) {
  const found = new Map();
  for (const match of String(templateHtml).matchAll(/data-wb-step="([^"]+)"/g)) {
    const id = match[1];
    found.set(id, (found.get(id) || 0) + 1);
  }
  return found;
}

/** 模板里出现的、不属于六步的 `data-wb-step` 值（应为空）。 */
export function unknownStepOwners(templateHtml) {
  return [...extractStepOwners(templateHtml).keys()].filter((id) => stepIndexOf(id) < 0);
}

/**
 * DOM 装配。**这是本模块唯一允许碰 DOM 的地方。**
 *
 * 所有文本一律走 `textContent`（不用 `innerHTML`）——既避开注入面，也让
 * `check:dom-injection` 无需豁免。
 *
 * @param {object} params
 * @param {HTMLElement} params.root 工作台根容器（`#app.app-container` / `.st-converter-drawer-app`）
 * @param {{getState: Function, setSelection: Function}} [params.session] 共享接缝（当前只读）
 * @param {(view: string) => void} [params.onViewChange]
 * @param {() => void} [params.onReopen]
 * @returns {{setView: Function, getView: Function, showGate: Function, hideGate: Function,
 *            setCheckPanel: Function, destroy: Function, machine: object}}
 */
export function mountMigrationWizard({ root, session = null, onViewChange = null, onReopen = null } = {}) {
  if (!root) return null;

  const machine = createWizardMachine();
  let view = WIZARD_VIEWS.WIZARD;

  const rail = root.querySelector('#wizard-rail');
  const stepButtons = rail ? [...rail.querySelectorAll('[data-wb-step]')] : [];
  const counter = root.querySelector('#wizard-step-counter');
  const btnPrev = root.querySelector('#btn-wizard-prev');
  const btnNext = root.querySelector('#btn-wizard-next');
  const btnToggle = root.querySelector('#btn-wb-view-toggle');
  const gate = root.querySelector('#wizard-gate');
  const gateTitle = root.querySelector('#wizard-gate-title');
  const gateReason = root.querySelector('#wizard-gate-reason');
  const btnReopen = root.querySelector('#btn-wizard-reopen');
  const checkSummary = root.querySelector('#wizard-check-summary');
  const checkExclusions = root.querySelector('#wizard-check-exclusions');

  const apply = () => {
    const { stepId } = machine.getState();
    root.dataset.wbView = view;
    root.dataset.wbStep = stepId;

    for (const btn of stepButtons) {
      const active = btn.dataset.wbStep === stepId;
      if (active) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
      btn.setAttribute('aria-selected', String(active));
    }

    const idx = stepIndexOf(stepId);
    if (counter) {
      counter.textContent = `第 ${idx + 1} / ${WIZARD_STEPS.length} 步 · ${WIZARD_STEPS[idx].title}`;
    }
    if (btnPrev) btnPrev.disabled = prevStepId(stepId) === null;
    if (btnNext) btnNext.disabled = nextStepId(stepId) === null;
    if (btnToggle) {
      const advanced = view === WIZARD_VIEWS.ADVANCED;
      btnToggle.textContent = advanced ? '向导模式' : '高级模式';
      btnToggle.setAttribute('aria-pressed', String(advanced));
    }
  };

  const setView = (next) => {
    if (next !== WIZARD_VIEWS.WIZARD && next !== WIZARD_VIEWS.ADVANCED) return false;
    view = next;
    apply();
    if (typeof onViewChange === 'function') onViewChange(view);
    return true;
  };

  const goTo = (id) => {
    const ok = machine.goTo(id);
    if (ok) apply();
    return ok;
  };

  const move = (delta) => {
    const ok = delta > 0 ? machine.next() : machine.prev();
    if (ok) apply();
    return ok;
  };

  const onRailClick = (event) => {
    const btn = event.target.closest('[data-wb-step]');
    if (!btn || !rail.contains(btn)) return;
    goTo(btn.dataset.wbStep);
  };

  const onRailKeydown = (event) => {
    const { stepId } = machine.getState();
    const idx = stepIndexOf(stepId);
    let target = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = WIZARD_STEPS[(idx + 1) % WIZARD_STEPS.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = WIZARD_STEPS[(idx - 1 + WIZARD_STEPS.length) % WIZARD_STEPS.length];
    else if (event.key === 'Home') target = WIZARD_STEPS[0];
    else if (event.key === 'End') target = WIZARD_STEPS[WIZARD_STEPS.length - 1];
    if (!target) return;
    event.preventDefault();
    goTo(target.id);
    const btn = stepButtons.find((b) => b.dataset.wbStep === target.id);
    if (btn) btn.focus();
  };

  const onPrev = () => move(-1);
  const onNext = () => move(1);
  const onToggle = () => setView(view === WIZARD_VIEWS.WIZARD ? WIZARD_VIEWS.ADVANCED : WIZARD_VIEWS.WIZARD);
  const onReopenClick = () => {
    hideGate();
    goTo(WIZARD_STEPS[0].id);
    if (typeof onReopen === 'function') onReopen();
  };

  if (rail) {
    rail.addEventListener('click', onRailClick);
    rail.addEventListener('keydown', onRailKeydown);
  }
  if (btnPrev) btnPrev.addEventListener('click', onPrev);
  if (btnNext) btnNext.addEventListener('click', onNext);
  if (btnToggle) btnToggle.addEventListener('click', onToggle);
  if (btnReopen) btnReopen.addEventListener('click', onReopenClick);

  function showGate(record) {
    const verdict = buildSessionGateVerdict(record);
    if (!verdict.blocked || !gate) return verdict;
    if (gateTitle) gateTitle.textContent = verdict.title;
    if (gateReason) gateReason.textContent = verdict.message;
    if (btnReopen) btnReopen.hidden = !verdict.canReopen;
    gate.hidden = false;
    setView(WIZARD_VIEWS.WIZARD);
    goTo(WIZARD_STEPS[0].id);
    return verdict;
  }

  function hideGate() {
    if (gate) gate.hidden = true;
  }

  /**
   * 填检查页（步骤④）。**全部走 textContent / createElement**，不接受 HTML 字符串。
   *
   * @param {{summary?: string, exclusions?: Array<{label: string, reason?: string}>}} [data]
   */
  function setCheckPanel({ summary = '', exclusions = [] } = {}) {
    if (checkSummary) checkSummary.textContent = summary;
    if (!checkExclusions) return;
    checkExclusions.textContent = '';
    for (const item of exclusions) {
      const li = document.createElement('li');
      li.textContent = item && item.reason ? `${item.label} — ${item.reason}` : String(item?.label ?? '');
      checkExclusions.appendChild(li);
    }
  }

  function destroy() {
    if (rail) {
      rail.removeEventListener('click', onRailClick);
      rail.removeEventListener('keydown', onRailKeydown);
    }
    if (btnPrev) btnPrev.removeEventListener('click', onPrev);
    if (btnNext) btnNext.removeEventListener('click', onNext);
    if (btnToggle) btnToggle.removeEventListener('click', onToggle);
    if (btnReopen) btnReopen.removeEventListener('click', onReopenClick);
  }

  apply();

  return {
    setView,
    getView: () => view,
    showGate,
    hideGate,
    setCheckPanel,
    goTo,
    destroy,
    machine,
    session,
  };
}
