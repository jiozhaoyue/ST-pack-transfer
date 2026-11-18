/**
 * 最小 DOM 桩（测试专用，不装 jsdom）。
 *
 * 2026-11-19 立的防线：本项目此前**没有 DOM 测试环境**，于是
 * `workbench-view.js` 这个 9000 行的 UI 装配核心只有「读源码正则匹配」的守卫，
 * `setLan()` 漏掉 `next.peer` 分支这种跨文件接线错误可以全绿通过。
 *
 * 这里提供一个刚好够 `createWorkbenchView` 渲染路径跑通的最小桩：
 * 元素查询全部返回 null（渲染分支自然跳过），但 `document` / `window` 存在，
 * 使 `setLan` / `getLan` 这类**状态契约**可以被真实调用与断言。
 *
 * 限制（必须写清楚，不许夸大）：它不布局、不算样式、不触发事件。
 * 它证明的是「数据写进 state 了吗」，不是「像素画对了吗」。
 */

const noop = () => {};

function makeStyle() {
  return { width: '', height: '', display: '', setProperty: noop, getPropertyValue: () => '' };
}

/** 卸载后接替的空壳 DOM：让迟到的 setTimeout/rAF 回调安全空转，不抛错。 */
function emptyDom() {
  return {
    readyState: 'complete',
    body: makeElement('body'),
    documentElement: makeElement('html'),
    activeElement: null,
    hidden: false,
    createElement: (tag) => makeElement(tag),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    createDocumentFragment: () => makeElement('#fragment'),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    execCommand: () => true,
  };
}

function emptyWindow() {
  return {
    innerWidth: 1024,
    innerHeight: 768,
    isSecureContext: true,
    devicePixelRatio: 1,
    addEventListener: noop,
    removeEventListener: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: noop,
    setTimeout,
    clearTimeout,
    localStorage: {
      _m: new Map(),
      getItem() { return null; },
      setItem() {},
      removeItem() {},
      clear() {},
    },
    location: { href: 'http://localhost/', search: '', hash: '', reload: noop },
  };
}

function makeElement(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    id: '',
    className: '',
    style: makeStyle(),
    dataset: {},
    children: [],
    childNodes: [],
    parentElement: null,
    parentNode: null,
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    scrollTop: 0,
    scrollWidth: 0,
    clientWidth: 0,
    bufferedAmount: 0,
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : !!force;
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      },
      contains(c) { return this._set.has(c); },
    },
    setAttribute: noop,
    removeAttribute: noop,
    getAttribute: () => null,
    hasAttribute: () => false,
    addEventListener: noop,
    removeEventListener: noop,
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    removeChild: noop,
    insertBefore(c) { this.children.push(c); return c; },
    replaceChildren: noop,
    remove: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    focus: noop,
    blur: noop,
    click: noop,
    scrollIntoView: noop,
    matches: () => false,
    contains: () => false,
    setSelectionRange: noop,
    animate: () => ({ cancel: noop, finished: Promise.resolve() }),
    /* canvas 测量（fitPackageNames 用）：返回固定宽度，够渲染分支跑通即可。
       这里不模拟真实字宽——本桩只保证「代码路径不炸」，不保证测量准确。 */
    getContext: () => ({ measureText: (t) => ({ width: String(t || '').length * 6.5 }), font: '' }),
    toDataURL: () => 'data:,',
  };
  return el;
}

/**
 * 装上最小 document / window 桩，返回卸载函数。
 * 调用方必须在 finally 里调它，避免污染同一进程里的其他测试。
 */
export function installMinimalDom() {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Element: globalThis.Element,
    getComputedStyle: globalThis.getComputedStyle,
  };

  const appEl = makeElement('div');
  /* 同一个 id 必须稳定返回同一个元素（真实 DOM 语义）。
     若每次新建，`el.x = v` 之后再 `getElementById` 就读不到，
     渲染路径会拿到空对象并抛错——那是桩的缺陷，不是被测代码的缺陷。 */
  const byId = new Map();
  const elementById = (id) => {
    if (id === 'app') return appEl;
    if (!byId.has(id)) {
      const el = makeElement('div');
      el.id = String(id);
      byId.set(id, el);
    }
    return byId.get(id);
  };

  const documentStub = {
    readyState: 'complete',
    body: makeElement('body'),
    documentElement: makeElement('html'),
    activeElement: null,
    hidden: false,
    createElement: (tag) => makeElement(tag),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    createDocumentFragment: () => makeElement('#fragment'),
    getElementById: elementById,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    execCommand: () => true,
  };

  const windowStub = {
    innerWidth: 1024,
    innerHeight: 768,
    isSecureContext: true,
    devicePixelRatio: 1,
    document: documentStub,
    addEventListener: noop,
    removeEventListener: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: noop,
    setTimeout,
    clearTimeout,
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
      setItem(k, v) { this._m.set(k, String(v)); },
      removeItem(k) { this._m.delete(k); },
      clear() { this._m.clear(); },
    },
    location: { href: 'http://localhost/', search: '', hash: '', reload: noop },
  };

  globalThis.document = documentStub;
  globalThis.window = windowStub;
  /* 有些渲染分支直接读全局 location / history（OAuth 回调解析），不经过 window。 */
  globalThis.location = windowStub.location;
  globalThis.history = { replaceState: noop, pushState: noop, state: null };
  /* Node 18+ 的 navigator 是只读 getter，不能直接赋值；已存在就沿用。 */
  if (typeof globalThis.navigator === 'undefined') {
    try {
      globalThis.navigator = { userAgent: 'node', language: 'zh-CN', clipboard: { writeText: async () => {} } };
    } catch { /* 只读环境：忽略，渲染分支有特性检测 */ }
  }
  globalThis.HTMLElement = class HTMLElement {};
  globalThis.Node = class Node {};
  globalThis.Element = class Element {};
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

  return function uninstallMinimalDom() {
    /* 视图内部用 setTimeout / requestAnimationFrame 排了延迟渲染（如 applySwitchDensity）。
       若直接把 document 删掉，这些回调在下一个 tick 触发就会抛
       「document is not defined」——那是清理时序问题，不是被测代码缺陷。
       故卸载时不删除 global，而是换成等价的空壳 DOM，让迟到回调安全空转。 */
    globalThis.document = emptyDom();
    globalThis.window = emptyWindow();
    for (const k of ['HTMLElement', 'Node', 'Element']) globalThis[k] = class {};
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  };
}

export { makeElement };
