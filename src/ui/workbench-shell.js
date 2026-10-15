/**
 * 工作台外壳：把「流程 × 阶段」解析出的摆法**落到 DOM 上**。
 *
 * 本文件是三层里的**外壳层实现**（`design.md` §2.3）。它只做三件事：
 *   ① 摘/挂模块元素（按 `resolveLayout()` 的次序）
 *   ② 同步方向开关的激活态
 *   ③ 移动端给可折叠模块加折叠把手
 *
 * **它不认识任何业务**：不读 `currentFile`、不碰 `selection`、不判平台。
 * 一切输入来自 `workbench-layout.js` 的声明与注入的 `getStage()`。
 *
 * 关键设计选择——**不可见的模块用 `hidden` 属性，而不是 `remove()`**。
 *
 * 初稿选的是「移出 DOM」，理由是「`display:none` 的子树仍会被 `getElementById` 命中，
 * 业务代码可能误取到另一个方向的控件」。**该理由被现场证据推翻**：
 *   · 全仓有十余处**动态** `getElementById`（`renderCategoryStats` 取 `#category-panel`、
 *     宿主文件树确认取 `#host-tree-confirm-bar`、暂存区渲染取 `#stash-list` …），
 *     摘出 DOM 会让它们拿到 `null` 而**静默空转**（`renderCategoryStats` 正是空值早退）；
 *   · 更要命的是宿主拉取路径：`workbenchBusy = true` 期间要渲染并**等待用户确认文件树**，
 *     若此时 `scope` 被摘下，确认条不在 DOM 里 ⇒ `waitHostTreeConfirm` 永久等待。
 *
 * `hidden` 让元素留在 DOM 里，上述十余处查找全部照旧。
 * 属性隐藏的**已知陷阱**（本仓 2026-09-25 与 2026-10-14 各踩过一次）是
 * 「作者样式的 `display` 压过 UA 的 `[hidden]{display:none}`」——本项目已在 `style.css`
 * 用 `#app.app-container [hidden] { display: none }`（双前缀，且位置排在 `.wb-sec` 之后）
 * 统一兜住，故此处无需再逐条覆盖。
 */

import { FLOWS, FLOW_IDS, MOBILE_MAX_WIDTH, resolveLayout } from './workbench-layout.js';

/** 模块注册表：模块 id → 该 id 的所有容器元素（一个模块可有多处容器，如 pack 含打包+清理+差量） */
const registry = new Map();

let shellRoot = null;
let currentFlow = 'out';
let getStageFn = () => 'idle';
let onFlowChangeFn = null;
let mediaQuery = null;

const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/** 断点判据与 `workbench-layout.js` 的 `MOBILE_MAX_WIDTH` 同源；无 `matchMedia` 时按桌面处理。 */
function detectFormFactor() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop';
}

/**
 * 登记全部模块元素。**必须在模板已进 DOM 之后调用一次。**
 * 只登记不搬动——搬动会打断动态 `getElementById`（见文件头）。
 */
function captureModules(root) {
  registry.clear();
  for (const el of Array.from(root.querySelectorAll('[data-wb-module]'))) {
    const id = el.dataset.wbModule;
    if (!registry.has(id)) registry.set(id, []);
    registry.get(id).push(el);
  }
}

/** 按解析结果摆位：先翻 `hidden`，再把可见的按顺序移进栏目。 */
function renderLayout(root, layout) {
  const left = root.querySelector('#wb-col-left');
  const right = root.querySelector('#wb-col-right');
  if (!left || !right) return;

  const order = layout.formFactor === 'mobile' ? layout.order : layout.columns.flat();
  const visible = new Set(order);

  // 1. 可见性。元素**留在 DOM 里**，只翻 hidden。
  for (const [id, els] of registry.entries()) {
    for (const el of els) el.hidden = !visible.has(id);
  }

  // 2. 摆位。`appendChild` 对已在树中的元素是「移动」而非「复制」，
  //    因此按目标顺序依次 append 即可得到正确次序，无需先清空。
  const place = (id, target) => {
    for (const el of registry.get(id) || []) target.appendChild(el);
  };
  if (layout.formFactor === 'mobile') {
    for (const id of layout.order) place(id, left);
    right.hidden = true;
    root.dataset.wbForm = 'mobile';
  } else {
    for (const id of layout.columns[0]) place(id, left);
    for (const id of layout.columns[1]) place(id, right);
    right.hidden = false;
    root.dataset.wbForm = 'desktop';
  }

  applyCollapsible(root, layout);
}

/**
 * 移动端给可折叠模块加把手。**只在移动端**——桌面两栏本来就不长，
 * 再加折叠会让「同一份模块」在双端表现分叉（PRD C2 要防的正是这个）。
 */
function applyCollapsible(root, layout) {
  const collapsible = new Set(layout.collapsible || []);
  for (const [id, els] of registry.entries()) {
    for (const el of els) {
      const isCollapsible = collapsible.has(id);
      el.classList.toggle('wb-collapsible', isCollapsible);
      if (!isCollapsible) {
        el.classList.remove('wb-collapsed');
        continue;
      }
      // 折叠把手：点标题行切换。幂等 —— 已绑过就不重复绑。
      const head = el.querySelector('.wb-sec-head');
      if (head && !head.dataset.wbFoldBound) {
        head.dataset.wbFoldBound = '1';
        head.addEventListener('click', () => {
          if (!el.classList.contains('wb-collapsible')) return;
          el.classList.toggle('wb-collapsed');
        });
      }
    }
  }
}

function syncFlowTabs(root, flow) {
  for (const id of FLOW_IDS) {
    const btn = root.querySelector(`#btn-flow-${id}`);
    if (!btn) continue;
    const active = id === flow;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  }
}

/**
 * 应用外壳。`stage` 不传则问注入的 `getStage()`。
 * 可在任意状态变更后调用——内部只在布局签名变化时才真正重排。
 * @param {'idle'|'scanned'|'running'|'done'} [stage]
 */
export function applyShell(stage) {
  if (!shellRoot || !shellRoot.isConnected) return;
  const resolvedStage = stage || getStageFn();
  const formFactor = detectFormFactor();
  const layout = resolveLayout(currentFlow, formFactor, resolvedStage);

  // 布局签名：流程 × 形态 × 阶段。相同就不重排 —— 重排会把焦点与滚动位置抖掉。
  const signature = `${currentFlow}|${formFactor}|${resolvedStage}`;
  syncFlowTabs(shellRoot, currentFlow);
  if (shellRoot.dataset.wbLayout === signature) return;
  shellRoot.dataset.wbLayout = signature;

  renderLayout(shellRoot, layout);
}

/**
 * 装配外壳。
 * @param {object} params
 * @param {HTMLElement} params.root 工作台根（须含 `#wb-shell`）
 * @param {() => string} [params.getStage] 阶段提供者（每次重排时求值）
 * @param {(flow: string) => void} [params.onFlowChange] 方向切换回调
 * @param {'out'|'in'} [params.initialFlow]
 * @returns {{setFlow: (f: string) => void, apply: (s?: string) => void, flow: () => string}}
 */
export function setupWorkbenchShell({ root, getStage, onFlowChange, initialFlow = 'out' } = {}) {
  const shell = root && root.querySelector ? root.querySelector('#wb-shell') : null;
  if (!shell) {
    return { setFlow: () => {}, apply: () => {}, flow: () => currentFlow };
  }
  shellRoot = shell;
  if (typeof getStage === 'function') getStageFn = getStage;
  onFlowChangeFn = typeof onFlowChange === 'function' ? onFlowChange : null;
  currentFlow = FLOWS[initialFlow] ? initialFlow : 'out';

  captureModules(shell);

  for (const id of FLOW_IDS) {
    const btn = shell.querySelector(`#btn-flow-${id}`);
    if (!btn) continue;
    btn.addEventListener('click', () => setFlow(id));
  }

  // 形态切换（旋屏 / 拉窗）后必须重排：签名里的 formFactor 会变，但没人调用 applyShell
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia(MOBILE_QUERY);
    const onFormFactorChange = () => applyShell();
    if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', onFormFactorChange);
    else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(onFormFactorChange);
  }

  applyShell();
  return {
    setFlow,
    apply: (s) => applyShell(s),
    flow: () => currentFlow,
  };
}

/**
 * 切换方向。**不触发重新上传、不触发重新扫描**——上传槽是共享的，
 * 同一个包可以在两个方向之间来回用（用户 2026-10-15 裁定「单一共享槽 + 角色标签」）。
 * @param {'out'|'in'} flow
 */
export function setFlow(flow) {
  if (!FLOWS[flow] || flow === currentFlow) return;
  currentFlow = flow;
  // 强制重排：签名里含 flow，但显式清掉更直白（也防「切回原方向」时签名恰好相同的边界）
  if (shellRoot) delete shellRoot.dataset.wbLayout;
  applyShell();
  if (onFlowChangeFn) onFlowChangeFn(currentFlow);
}

/** 当前方向。 */
export function getFlow() {
  return currentFlow;
}

/** 拆装（测试与热重载用）：断开媒体查询监听并清空注册表。 */
export function resetWorkbenchShell() {
  if (mediaQuery) {
    if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', applyShell);
    else if (typeof mediaQuery.removeListener === 'function') mediaQuery.removeListener(applyShell);
  }
  mediaQuery = null;
  registry.clear();
  shellRoot = null;
  currentFlow = 'out';
  getStageFn = () => 'idle';
  onFlowChangeFn = null;
}
