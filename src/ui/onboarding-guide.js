/**
 * 全屏引导（2026-10-14 新增，取代已删除的「迁移向导」）。
 *
 * 为什么是引导而不是向导：原向导把同一份工作台 DOM 用 `data-wb-step` 分段显隐，
 * 结果是**第二份 UI**——第 6 步空白、第 3 步显示的不是范围选择器，用户裁定整体删除。
 * 现在界面只有一个视图，引导层**高亮真实控件**（同一个 DOM 节点），不复制任何界面。
 *
 * 文案纪律（用户 2026-10-14 死命令）：禁止括号说明、禁止分号、禁止长句、禁止任何解释。
 * 每步只有一个短标题。
 *
 * 分层：本文件可碰 DOM（`src/ui/` 层），但**不依赖宿主**，独立态与插件态同构。
 */

import { detectHost } from './host-bridge.js';

/** 引导完成标记的存储键（换版本时改后缀即可让全部用户重看一次）。 */
export const ONBOARDING_DONE_KEY = 'stzip.onboarding.done.v1';

/** 引导步骤：selector 指向**真实控件**，title 是唯一文案。 */
export const ONBOARDING_STEPS = Object.freeze([
  { selector: '#dropzone', title: '选择数据包' },
  { selector: '#target-select', title: '选择目标平台' },
  { selector: '#category-checkboxes', title: '挑选内容' },
  { selector: '#btn-convert', title: '开始转换' },
  { selector: '#export-queue-panel', title: '领取产物' },
]);

/** 读完成标记。无 `localStorage` 时视为「未完成」，不抛错。 */
export function isOnboardingDone() {
  try {
    return globalThis.localStorage?.getItem(ONBOARDING_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 写完成标记。失败静默——引导不该因为存储被禁而报错。 */
export function markOnboardingDone() {
  try {
    globalThis.localStorage?.setItem(ONBOARDING_DONE_KEY, '1');
  } catch {
    /* 隐私模式 / 存储被禁：忽略 */
  }
}

/** 清除完成标记（供设置项或调试使用）。 */
export function clearOnboardingDone() {
  try {
    globalThis.localStorage?.removeItem(ONBOARDING_DONE_KEY);
  } catch {
    /* 同上 */
  }
}

/**
 * 装配全屏引导。
 *
 * @param {object} params
 * @param {ParentNode} params.root 工作台根容器
 * @param {() => void} [params.onClose] 引导关闭时回调
 * @returns {{open: Function, close: Function, destroy: Function, goTo: Function,
 *            getIndex: Function, isOpen: Function} | null}
 */
export function mountOnboardingGuide({ root, onClose = null } = {}) {
  if (!root || typeof document === 'undefined') return null;

  let index = 0;
  let open = false;

  const overlay = document.createElement('div');
  overlay.className = 'wb-guide-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const ring = document.createElement('div');
  ring.className = 'wb-guide-ring';
  ring.hidden = true;

  const card = document.createElement('div');
  card.className = 'wb-guide-card';

  const title = document.createElement('div');
  title.className = 'wb-guide-title';

  const dots = document.createElement('div');
  dots.className = 'wb-guide-dots';

  const actions = document.createElement('div');
  actions.className = 'wb-guide-actions';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'menu_button';
  btnPrev.textContent = '上一步';

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'menu_button btn-accent';
  btnNext.textContent = '下一步';

  const btnExit = document.createElement('button');
  btnExit.type = 'button';
  btnExit.className = 'menu_button';
  btnExit.textContent = '退出';

  actions.append(btnPrev, btnNext, btnExit);
  card.append(title, dots, actions);
  overlay.append(ring, card);
  root.appendChild(overlay);

  for (let i = 0; i < ONBOARDING_STEPS.length; i += 1) {
    const dot = document.createElement('i');
    dots.appendChild(dot);
  }

  const targetOf = (step) => (step ? root.querySelector(step.selector) : null);

  /** 把高亮环套到目标元素上。目标缺失或不可见时退化为「无环」——不假装指得到。 */
  const placeRing = () => {
    const el = targetOf(ONBOARDING_STEPS[index]);
    if (!el) {
      ring.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      ring.hidden = true;
      return;
    }
    const pad = 6;
    ring.hidden = false;
    ring.style.top = `${Math.max(0, r.top - pad)}px`;
    ring.style.left = `${Math.max(0, r.left - pad)}px`;
    ring.style.width = `${r.width + pad * 2}px`;
    ring.style.height = `${r.height + pad * 2}px`;
    // 目标在视口外时先滚过去，再重新定位
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      const r2 = el.getBoundingClientRect();
      ring.style.top = `${Math.max(0, r2.top - pad)}px`;
      ring.style.left = `${Math.max(0, r2.left - pad)}px`;
      ring.style.width = `${r2.width + pad * 2}px`;
      ring.style.height = `${r2.height + pad * 2}px`;
    }
  };

  const render = () => {
    const step = ONBOARDING_STEPS[index];
    title.textContent = step.title;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === index));
    btnPrev.disabled = index === 0;
    btnNext.textContent = index === ONBOARDING_STEPS.length - 1 ? '完成' : '下一步';
    placeRing();
  };

  const goTo = (next) => {
    if (!Number.isInteger(next) || next < 0 || next >= ONBOARDING_STEPS.length) return false;
    index = next;
    render();
    return true;
  };

  const openGuide = () => {
    index = 0;
    open = true;
    overlay.hidden = false;
    render();
  };

  const closeGuide = () => {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    ring.hidden = true;
    markOnboardingDone();
    if (typeof onClose === 'function') onClose();
  };

  const onNext = () => {
    if (index >= ONBOARDING_STEPS.length - 1) {
      closeGuide();
      return;
    }
    goTo(index + 1);
  };
  const onPrev = () => { goTo(index - 1); };
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); closeGuide(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); onNext(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); onPrev(); }
  };
  const onResize = () => { if (open) placeRing(); };

  btnNext.addEventListener('click', onNext);
  btnPrev.addEventListener('click', onPrev);
  btnExit.addEventListener('click', closeGuide);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  function destroy() {
    btnNext.removeEventListener('click', onNext);
    btnPrev.removeEventListener('click', onPrev);
    btnExit.removeEventListener('click', closeGuide);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    overlay.remove();
  }

  return {
    open: openGuide,
    close: closeGuide,
    destroy,
    goTo,
    getIndex: () => index,
    isOpen: () => open,
  };
}

/**
 * 引导按钮接线 + 首装自动打开。
 *
 * 自动打开的条件：**本机没有完成标记**。用户清掉标记后会再次触发同一条路径。
 * 独立态与插件态共用同一逻辑（标记存在 localStorage，按来源域隔离）。
 *
 * @param {ParentNode} root 工作台根容器
 * @returns {{guide: object|null, open: Function}}
 */
export function setupOnboardingGuide(root) {
  const guide = mountOnboardingGuide({ root });
  const btn = root ? root.querySelector('#btn-guide') : null;
  if (btn && guide) {
    btn.addEventListener('click', () => guide.open());
  }
  if (guide && !isOnboardingDone()) {
    // 让首屏先完成布局与宿主注入，再打开引导，避免高亮环量到 0 尺寸
    const timer = setTimeout(() => guide.open(), 400);
    if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
  }
  return { guide, open: () => guide && guide.open() };
}

/** 当前宿主名（用于引导与徽标；认不出时 `unknown`）。 */
export function currentHostLabel() {
  try {
    const host = detectHost();
    if (!host || !host.isPlugin) return 'standalone';
    return host.platform;
  } catch {
    return 'unknown';
  }
}
