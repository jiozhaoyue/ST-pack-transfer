import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getSelectionState,
  renderCategoryDefaults,
  renderCategoryStats,
} from '../src/ui/category-filter.js';
import { DEFAULT_SELECTION } from '../src/core/selection-defaults.js';

/**
 * 类目面板**「待扫描」占位态**的回归守护。
 *
 * 事故（2026-10-15 实测，用户截图：13 个类目全部显示「待扫描」）：
 * `renderCategoryDefaults()` 把模块级 `isUnscanned` 置 `true`，但真实扫描的两个调用点
 * `index.js:1390` / `index.js:1793` 都**没传** `{ unscanned: false }` ⇒ 标志永无翻转路径
 * （`category-filter.js:126` 只在显式传参时改写）⇒ 徽标恒走 `'待扫描'` 分支。
 *
 * 连带缺陷（比文案更严重）：`isAvailable = isUnscanned || count > 0` 在占位态恒真
 * ⇒ 源包中**不存在**的类目也被启用且默认勾选，假勾选经 `notifySelectionChanged()`
 * 一路传进 `convert()`。
 *
 * 本文件锁两条不变量：
 *   ① 显式 `{ unscanned: false }` 后，徽标改显**计划读数**、空类目被置灰；
 *   ② 此后的**内部重渲染**（展开明细 / 动作筛选走 `renderCategoryStats(currentPlan)`，
 *      不带 opts）**不得**退回占位态 —— 这正是 `category-filter.js:126-127` 的契约。
 *
 * 项目不引入 jsdom（依赖自包含 L1-MR-11 / 不擅自装包），沿用
 * `test/stash-list-render.test.js` 的最小 DOM 桩范式。
 */

const g = globalThis;

function makeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    title: '',
    type: '',
    hidden: false,
    disabled: false,
    checked: false,
    indeterminate: false,
    style: {},
    dataset: {},
    textContent: '',
    children: [],
    parentElement: null,
    set innerHTML(v) {
      this._html = v;
      // 真实 DOM 的 `innerHTML = ''` 会清空子节点；`renderCategoryStats` 依赖这一语义
      if (v === '') this.children = [];
    },
    get innerHTML() {
      return this._html === undefined ? '' : this._html;
    },
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type, ev = {}) { (listeners[type] || []).forEach((fn) => fn(ev)); },
    remove() {},
    contains: () => false,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return el;
}

/** 按 id 注册的桩元素表；`renderCategoryStats` 只经 `getElementById` 取这 6 个节点 */
const registry = {};

function installDom() {
  for (const id of [
    'category-panel',
    'category-checkboxes',
    'plan-summary-bar',
    'action-stats-badges',
    'output-estimate-text',
    'category-summary-badge',
  ]) {
    registry[id] = makeEl('div');
    registry[id].id = id;
  }
  g.document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => registry[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

/** 构造一个最小计划：characters 有量、vectors 为空（对齐实测读数形态） */
const planWith = (overrides = {}) => ({
  categories: {
    ...Object.fromEntries(
      Object.keys(DEFAULT_SELECTION).map((k) => [k, { count: 0, sizeBytes: 0, items: [] }]),
    ),
    ...overrides,
  },
});

const cardOf = (key) => {
  const container = registry['category-checkboxes'];
  return container.children.find((c) => c.dataset.category === key) || null;
};

const badgeTextOf = (key) => {
  const card = cardOf(key);
  return card.children[0].children[1].children[0].textContent;
};

const checkboxOf = (key) => cardOf(key).children[0].children[0].children[0];

const allBadgeTexts = () =>
  registry['category-checkboxes'].children.map(
    (c) => c.children[0].children[1].children[0].textContent,
  );

describe('类目面板「待扫描」占位态（回归守护：占位态必须能被扫描结果关闭）', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete g.document; });

  it('占位态：全部类目标为「待扫描」，且每一项都可单独勾选（面板不能空着）', () => {
    renderCategoryDefaults();
    const texts = allBadgeTexts();
    // 13 个 selection 键 → 12 张卡片：用户扩展与第三方扩展在**界面**上合并为一条
    // （用户 2026-10-15「扩展列表处只留一条」），但 selection 仍保留两个键。
    expect(texts.length).toBe(Object.keys(DEFAULT_SELECTION).length - 1);
    expect(texts.every((t) => t === '待扫描')).toBe(true);
    // 占位态下不置灰：用户 2026-10-15 要求每一项都能单独勾选
    expect(checkboxOf('vectors').disabled).toBe(false);
  });

  it('扩展两行合并为一条：一张卡片驱动 extensions 与 globalExtensions 两个键', () => {
    renderCategoryDefaults();
    const cardKeys = registry['category-checkboxes'].children.map((c) => c.dataset.category);
    expect(cardKeys).toContain('extensions');
    expect(cardKeys).not.toContain('globalExtensions'); // 不再单独出卡片

    const cb = checkboxOf('extensions');
    cb.checked = false;
    cb.fire('change', { target: cb });
    expect(getSelectionState().extensions).toBe(false);
    expect(getSelectionState().globalExtensions).toBe(false);

    cb.checked = true;
    cb.fire('change', { target: cb });
    expect(getSelectionState().extensions).toBe(true);
    // 这一条是关键：只写主键会让第三方扩展静默留在旧值上（宿主端点按两个键分开认）
    expect(getSelectionState().globalExtensions).toBe(true);
  });

  it('扫描结果到达（显式 unscanned:false）⇒ 改显计划读数，空类目被置灰', () => {
    renderCategoryDefaults();
    renderCategoryStats(planWith({ characters: { count: 1240, sizeBytes: 1024 * 1024, items: [] } }), {
      unscanned: false,
    });

    expect(badgeTextOf('characters')).toBe('1240 项 · 1.0 MB');
    expect(badgeTextOf('vectors')).toBe('0 项 · 0 B');
    expect(allBadgeTexts()).not.toContain('待扫描');
    // 源包里不存在的类目必须禁用 —— 否则假勾选会传进 convert()
    expect(checkboxOf('vectors').disabled).toBe(true);
  });

  it('回归锁：扫描后的**内部重渲染**（不带 opts）不得退回占位态', () => {
    renderCategoryDefaults();
    const plan = planWith({ characters: { count: 1240, sizeBytes: 1024 * 1024, items: [] } });
    renderCategoryStats(plan, { unscanned: false });

    // 展开明细 / 动作筛选走的就是这一句（category-filter.js 内 4 处调用点）
    renderCategoryStats(plan);

    expect(badgeTextOf('characters')).toBe('1240 项 · 1.0 MB');
    expect(allBadgeTexts()).not.toContain('待扫描');
    expect(checkboxOf('vectors').disabled).toBe(true);
  });
});
