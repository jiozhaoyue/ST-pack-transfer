import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  applyShell,
  getFlow,
  resetWorkbenchShell,
  setFlow,
  setupWorkbenchShell,
} from '../src/ui/workbench-shell.js';

/**
 * 工作台外壳（模块摆法）的回归守护。
 *
 * 锁的核心有两条：
 *   ① **AC-2.3：切屏与切阶段只翻 `hidden`，元素必须留在 DOM 里**。
 *      这条是被现场证据推翻后重定的——初稿想「移出 DOM」以免业务代码误取到另一方向的控件，
 *      但全仓十余处**动态** `getElementById`（`renderCategoryStats` 取 `#category-panel`、
 *      宿主文件树确认取 `#host-tree-confirm-bar`）会因此拿到 `null` 而静默空转，
 *      宿主拉取路径更会死锁在 `waitHostTreeConfirm`。故改为属性隐藏。
 *   ② 摆位正确：共享内核在两流程里都可见，选项槽随方向换人，导入流程永不出现 scope。
 *
 * 项目不引入 jsdom（依赖自包含 L1-MR-11），沿用 `stash-list-render.test.js` 的最小 DOM 桩范式。
 */

const g = globalThis;

/** 极简选择器：只支持 #id / .class / [data-wb-module]，够用即可 */
function matches(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el._classes.has(sel.slice(1));
  if (sel === '[data-wb-module]') return Object.prototype.hasOwnProperty.call(el.dataset, 'wbModule');
  return false;
}

function descendants(el, out = []) {
  for (const c of el.children) {
    out.push(c);
    descendants(c, out);
  }
  return out;
}

function makeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    hidden: false,
    tabIndex: 0,
    dataset: {},
    children: [],
    parentElement: null,
    _classes: new Set(),
    _isRoot: false,
    classList: {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      contains: (c) => el._classes.has(c),
      toggle: (c, on) => {
        const next = on === undefined ? !el._classes.has(c) : !!on;
        if (next) el._classes.add(c); else el._classes.delete(c);
        return next;
      },
    },
    get className() { return [...el._classes].join(' '); },
    set className(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    appendChild(child) {
      if (child.parentElement) child.remove();
      el.children.push(child);
      child.parentElement = el;
      return child;
    },
    remove() {
      const p = el.parentElement;
      if (p) {
        const i = p.children.indexOf(el);
        if (i >= 0) p.children.splice(i, 1);
      }
      el.parentElement = null;
    },
    get isConnected() {
      let n = el;
      while (n.parentElement) n = n.parentElement;
      return !!n._isRoot;
    },
    setAttribute(k, v) { el[`_attr_${k}`] = v; },
    getAttribute(k) { return el[`_attr_${k}`]; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type, ev = {}) { (listeners[type] || []).forEach((fn) => fn(ev)); },
    querySelector(sel) { return descendants(el).find((d) => matches(d, sel)) || null; },
    querySelectorAll(sel) { return descendants(el).filter((d) => matches(d, sel)); },
  };
  return el;
}

/** 造一个与真实模板同构的最小骨架：shell → 开关 + 两栏，模块挂进左栏 */
function buildShell({ formFactor = 'desktop' } = {}) {
  const root = makeEl('div');
  root._isRoot = true;

  const shell = makeEl('div');
  shell.id = 'wb-shell';
  root.appendChild(shell);

  const sw = makeEl('div');
  sw.id = 'wb-flow-switch';
  shell.appendChild(sw);

  const btnOut = makeEl('button');
  btnOut.id = 'btn-flow-out';
  sw.appendChild(btnOut);
  const btnIn = makeEl('button');
  btnIn.id = 'btn-flow-in';
  sw.appendChild(btnIn);

  const left = makeEl('div');
  left.id = 'wb-col-left';
  shell.appendChild(left);
  const right = makeEl('div');
  right.id = 'wb-col-right';
  shell.appendChild(right);

  const ids = ['quota', 'source', 'scope', 'pack', 'restore', 'action', 'products', 'log'];
  for (const id of ids) {
    const mod = makeEl('section');
    mod.dataset.wbModule = id;
    mod.classList.add('wb-sec');
    const head = makeEl('div');
    head.classList.add('wb-sec-head');
    mod.appendChild(head);
    const body = makeEl('div');
    body.classList.add('wb-sec-body');
    mod.appendChild(body);
    left.appendChild(mod);
  }

  g.window = {
    matchMedia: () => ({
      matches: formFactor === 'mobile',
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };
  return { root, shell, left, right, btnOut, btnIn };
}

/** 可见模块 id（未被 hidden 的那些） */
const visibleIds = (el) =>
  descendants(el).filter((d) => d.dataset.wbModule && !d.hidden).map((d) => d.dataset.wbModule);

/** 仍在 DOM 中的模块 id（含 hidden）——用于断言「只翻 hidden，没有移出 DOM」 */
const presentIds = (el) =>
  descendants(el).filter((d) => d.dataset.wbModule).map((d) => d.dataset.wbModule);

describe('工作台外壳：按「流程 × 阶段」摆模块，不可见的翻 hidden', () => {
  beforeEach(() => { g.window = undefined; });
  afterEach(() => { resetWorkbenchShell(); delete g.window; });

  it('初始（idle）只显示 配额 + 上传槽 + 选项槽，且日志常驻', () => {
    const { root, shell } = buildShell();
    setupWorkbenchShell({ root, getStage: () => 'idle' });
    applyShell();

    const ids = visibleIds(shell);
    expect(ids).toContain('quota');
    expect(ids).toContain('source');
    expect(ids).toContain('pack');
    expect(ids).toContain('log');
    expect(ids).not.toContain('scope');
    expect(ids).not.toContain('products');
    expect(ids).not.toContain('action');
  });

  it('AC-2.3：被隐藏的模块**仍在 DOM 里**（否则动态 getElementById 会取到 null）', () => {
    const { root, shell } = buildShell();
    setupWorkbenchShell({ root, getStage: () => 'idle' });
    applyShell();

    // 全部模块都还在 DOM 中……
    expect([...presentIds(shell)].sort()).toEqual(
      ['action', 'log', 'pack', 'products', 'quota', 'restore', 'scope', 'source'].sort(),
    );
    // ……但不可见的那几个翻了 hidden
    expect(visibleIds(shell)).not.toContain('scope');
  });

  it('阶段推进到 scanned ⇒ 范围与执行条进场', () => {
    const { root, shell } = buildShell();
    let stage = 'idle';
    setupWorkbenchShell({ root, getStage: () => stage });
    applyShell();
    expect(visibleIds(shell)).not.toContain('scope');

    stage = 'scanned';
    applyShell();
    const ids = visibleIds(shell);
    expect(ids).toContain('scope');
    expect(ids).toContain('action');
  });

  it('切到导入流程 ⇒ 打包选项退场、恢复选项进场，共享模块原地不动', () => {
    const { root, shell } = buildShell();
    setupWorkbenchShell({ root, getStage: () => 'scanned' });
    applyShell();
    expect(visibleIds(shell)).toContain('pack');
    expect(visibleIds(shell)).not.toContain('restore');

    setFlow('in');
    const ids = visibleIds(shell);
    expect(ids).toContain('restore');
    expect(ids).not.toContain('pack');
    // 共享内核不动
    expect(ids).toContain('quota');
    expect(ids).toContain('source');
    expect(ids).toContain('action');
    // 导入流程永不出现 scope
    expect(ids).not.toContain('scope');
  });

  it('方向开关的激活态与 aria 同步', () => {
    const { root, btnOut, btnIn } = buildShell();
    setupWorkbenchShell({ root, getStage: () => 'idle' });
    applyShell();
    expect(btnOut.classList.contains('active')).toBe(true);
    expect(btnIn.classList.contains('active')).toBe(false);
    expect(btnOut.getAttribute('aria-selected')).toBe('true');

    setFlow('in');
    expect(btnIn.classList.contains('active')).toBe(true);
    expect(btnOut.getAttribute('aria-selected')).toBe('false');
  });

  it('点击开关即切流程（事件已接线，非死控件）', () => {
    const { root, btnIn } = buildShell();
    setupWorkbenchShell({ root, getStage: () => 'idle' });
    applyShell();
    expect(getFlow()).toBe('out');
    btnIn.fire('click');
    expect(getFlow()).toBe('in');
  });

  it('onFlowChange 回调被通知，且携带新方向', () => {
    const { root, btnIn } = buildShell();
    const seen = [];
    setupWorkbenchShell({ root, getStage: () => 'idle', onFlowChange: (f) => seen.push(f) });
    applyShell();
    btnIn.fire('click');
    expect(seen).toEqual(['in']);
  });

  it('重复 applyShell 不重复摆位（签名未变即不重排）', () => {
    const { root, shell } = buildShell();
    setupWorkbenchShell({ root, getStage: () => 'scanned' });
    applyShell();
    const before = visibleIds(shell).length;
    applyShell();
    applyShell();
    expect(visibleIds(shell).length).toBe(before);
  });

  it('移动形态：右栏隐藏，模块单列落在左栏', () => {
    const { root, shell, right, left } = buildShell({ formFactor: 'mobile' });
    setupWorkbenchShell({ root, getStage: () => 'scanned' });
    applyShell();
    expect(right.hidden).toBe(true);
    expect(shell.dataset.wbForm).toBe('mobile');
    expect(visibleIds(shell)).toContain('scope');
    // 全在左栏
    expect(visibleIds(left)).toEqual(expect.arrayContaining(['scope', 'action', 'source']));
    expect(visibleIds(right)).toEqual([]);
  });

  it('无 #wb-shell 时静默降级，不抛错（宿主注入形态可能没有外壳）', () => {
    const bare = makeEl('div');
    bare._isRoot = true;
    expect(() => setupWorkbenchShell({ root: bare })).not.toThrow();
    expect(() => applyShell()).not.toThrow();
  });
});
