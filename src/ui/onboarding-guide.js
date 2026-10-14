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
  /** 本次引导**实际可用**的步骤（目标存在、有尺寸、未被禁用）。 */
  let active = ONBOARDING_STEPS.slice();

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

  // 圆点数量按**本次可用步骤**在 open() 时重建，不在此处按全量步骤预建。

  const targetOf = (step) => (step ? root.querySelector(step.selector) : null);

  /**
   * 该步是否值得走。**跳过不可用的目标**——原实现在空工作台上会把高亮环指到
   * 一个禁用中的「开始转换」上，用户按提示做完也点不动（2026-10-14 实测）。
   */
  const isStepUsable = (step) => {
    const el = targetOf(step);
    if (!el) return false;
    if (el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /**
   * 把高亮环套到目标元素上，并让说明卡片**贴着环**定位。
   * 目标缺失或不可见时退化为「无环」——不假装指得到。
   * 原实现把卡片固定在屏幕正中，环却在别处，看着像广告弹窗而不是帮助（2026-10-14 评审指出）。
   */
  const placeRing = () => {
    const el = targetOf(active[index]);
    if (!el) {
      ring.hidden = true;
      return;
    }
    let r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      ring.hidden = true;
      return;
    }
    // 目标在视口外时先滚过去，再重新量
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      r = el.getBoundingClientRect();
    }
    const pad = 6;
    ring.hidden = false;
    ring.style.top = `${Math.max(0, r.top - pad)}px`;
    ring.style.left = `${Math.max(0, r.left - pad)}px`;
    ring.style.width = `${r.width + pad * 2}px`;
    ring.style.height = `${r.height + pad * 2}px`;

    // 卡片优先落在环下方；下方放不下就翻到上方。
    const cardRect = card.getBoundingClientRect();
    const gap = 12;
    const below = r.bottom + gap;
    const top = below + cardRect.height <= window.innerHeight - 8
      ? below
      : Math.max(8, r.top - gap - cardRect.height);
    card.style.position = 'fixed';
    card.style.top = `${top}px`;
    card.style.left = '50%';
    card.style.transform = 'translateX(-50%)';
    card.style.maxWidth = `min(320px, calc(100vw - 24px))`;
  };

  const render = () => {
    const step = active[index];
    if (!step) return;
    title.textContent = step.title;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === index));
    btnPrev.disabled = index === 0;
    btnNext.textContent = index === active.length - 1 ? '完成' : '下一步';
    placeRing();
  };

  const goTo = (next) => {
    if (!Number.isInteger(next) || next < 0 || next >= active.length) return false;
    index = next;
    render();
    return true;
  };

  const openGuide = () => {
    // 每次打开重新求值：工作台状态变了，可用目标也跟着变。
    active = ONBOARDING_STEPS.filter(isStepUsable);
    // 一个可用目标都没有时**不弹空壳**（原实现会弹一个指不到任何东西的浮层）。
    if (active.length === 0) return;
    dots.textContent = '';
    for (let i = 0; i < active.length; i += 1) dots.appendChild(document.createElement('i'));
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
    if (index >= active.length - 1) {
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
