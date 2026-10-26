import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * 私有格式仓面板**渲染路径**守护（沿用 stash-list-render 的最小 DOM 桩范式，不引 jsdom）。
 * 契约：渲染不抛错、后端徽标正确、条目行含格式徽标与行内动作、恢复按钮按宿主布局条件出现。
 */

const vaultState = vi.hoisted(() => ({
  backend: 'authority',
  entries: [],
  deleted: [],
  /** 并发渲染用例用：设为 Promise 时 vaultList 会等它 */
  gate: null,
}));

vi.mock('../src/storage/vault-store.js', () => ({
  vaultBackend: async () => vaultState.backend,
  vaultList: async () => {
    if (vaultState.gate) await vaultState.gate;
    return vaultState.entries;
  },
  vaultGet: async (id) => {
    const e = vaultState.entries.find((x) => x.id === id);
    return e ? { blob: { size: e.size }, entry: e } : null;
  },
  vaultDelete: async (id) => { vaultState.deleted.push(id); return true; },
  vaultPut: async ({ name, blob }) => ({ id: `put_${name}`, name, size: blob.size, formatTag: 'raw', backend: vaultState.backend }),
  normalizeFormatTag: (t) => ['st', 'l', 'tt', 'pt'].includes(t) ? t : 'raw',
}));

const { renderVaultPanel, canRestoreEntry, saveFilesToVault } = await import('../src/ui/vault-panel.js');

const g = globalThis;

function makeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    title: '',
    hidden: false,
    textContent: '',
    children: [],
    dataset: {},
    _html: '',
    set innerHTML(v) {
      this._html = v;
      if (v === '') this.children = [];
    },
    get innerHTML() { return this._html; },
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    append(...children) { for (const c of children) this.appendChild(c); },
    querySelector(sel) {
      // 只支持本测试所需的两类查找：类名（单类）与后代类名
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      const [parentCls, childCls] = sel.includes(' ') ? sel.replace('.', '').split(' ').filter(Boolean) : [null, cls];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (parentCls ? (c.className || '').includes(parentCls) : true) {
            if (childCls && (c.className || '').includes(childCls)) return c;
          }
          const found = walk(c);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    click() { for (const fn of listeners.click || []) fn({ preventDefault() {}, stopPropagation() {} }); },
  };
  return el;
}

function entryFixture(overrides = {}) {
  return {
    id: 'v1',
    name: 'tt_私有包.db',
    formatTag: 'tt',
    note: '',
    size: 1024,
    chunks: 1,
    savedAt: 1770000000000,
    backend: 'authority',
    ...overrides,
  };
}

beforeEach(() => {
  vaultState.backend = 'authority';
  vaultState.entries = [];
  vaultState.deleted = [];
  vaultState.gate = null;
  g.document = {
    readyState: 'complete',
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
});

afterEach(() => { delete g.document; });

describe('canRestoreEntry（纯函数：格式兼容才给恢复入口）', () => {
  it('条目格式与宿主布局一致才可恢复；raw/不一致/无宿主都不可', () => {
    expect(canRestoreEntry({ formatTag: 'tt' }, 'tt')).toBe(true);
    expect(canRestoreEntry({ formatTag: 'st' }, 'l')).toBe(false);
    expect(canRestoreEntry({ formatTag: 'raw' }, 'st')).toBe(false);
    expect(canRestoreEntry({ formatTag: 'st' }, null)).toBe(false);
    expect(canRestoreEntry(null, 'st')).toBe(false);
  });
});

describe('渲染契约', () => {
  it('authority 后端渲染「服务端」徽标，条目行含名称与格式徽标', async () => {
    vaultState.entries = [entryFixture()];
    const container = makeEl();
    const badge = makeEl();
    await renderVaultPanel({ containerEl: container, badgeEl: badge, hostLayout: null });
    expect(badge.innerHTML).toContain('服务端');
    const list = container.children[0];
    expect(list.className).toContain('vault-list');
    expect(list.children).toHaveLength(1);
    const row = list.children[0];
    const info = row.children[0];
    const nameSpan = info.children[0].children[0];
    expect(nameSpan.textContent).toBe('tt_私有包.db');
    expect(info.children[1].children[0].textContent).toBe('TT');
    expect(info.children[1].children[1].textContent).toBe('1.0 KB');
    // 无宿主布局 ⇒ 只有导出/删，无恢复按钮（按钮是真实元素，按文本断言）
    const btnTexts = row.children[1].children.map((b) => b.textContent);
    expect(btnTexts).toEqual(['导出', '删除']);
  });

  it('indexeddb 降级渲染「本地」徽标', async () => {
    vaultState.backend = 'indexeddb';
    const container = makeEl();
    const badge = makeEl();
    await renderVaultPanel({ containerEl: container, badgeEl: badge });
    expect(badge.innerHTML).toContain('本地');
  });

  it('后端不可用渲染「不可用」占位，不抛错', async () => {
    vaultState.backend = null;
    const container = makeEl();
    const badge = makeEl();
    await renderVaultPanel({ containerEl: container, badgeEl: badge });
    expect(badge.innerHTML).toContain('不可用');
    expect(container.children[0].textContent).toBe('仓不可用');
  });

  it('空仓渲染「仓为空」', async () => {
    const container = makeEl();
    await renderVaultPanel({ containerEl: container });
    expect(container.children[0].textContent).toBe('仓为空');
  });

  it('名称走 textContent，无 innerHTML 注入路径（防注入）', async () => {
    const evil = '<img src=x onerror=alert(1)>.zip';
    vaultState.entries = [entryFixture({ name: evil })];
    const container = makeEl();
    await renderVaultPanel({ containerEl: container });
    const row = container.children[0].children[0];
    const nameSpan = row.children[0].children[0].children[0];
    expect(nameSpan.textContent).toBe(evil); // 原样文本，不被解析为 HTML
    expect(row.children[0].innerHTML).toBe(''); // 用户数据零 innerHTML 路径
  });

  it('格式匹配宿主时渲染恢复按钮并回调 onRestore', async () => {
    vaultState.entries = [entryFixture()];
    const container = makeEl();
    const onRestore = vi.fn();
    await renderVaultPanel({ containerEl: container, hostLayout: 'tt', onRestore });
    const btns = container.children[0].children[0].children[1];
    expect(btns.children.length).toBe(3); // 导出 + 恢复 + 删
    expect(btns.children[1].textContent).toBe('恢复');
    btns.children[1].click();
    await new Promise((r) => setTimeout(r, 5));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore.mock.calls[0][0].name).toBe('tt_私有包.db');
  });

  it('删除动作走确认并调 vaultDelete，拒绝确认则不删', async () => {
    vaultState.entries = [entryFixture()];
    const container = makeEl();
    const confirmFn = vi.fn(async () => true);
    const onChanged = vi.fn();
    await renderVaultPanel({ containerEl: container, confirmFn, onChanged });
    const btns = container.children[0].children[0].children[1];
    btns.children[btns.children.length - 1].click();
    await new Promise((r) => setTimeout(r, 5));
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(vaultState.deleted).toEqual(['v1']);
    expect(onChanged).toHaveBeenCalledTimes(1);

    // 拒绝确认：不删
    vaultState.deleted = [];
    const confirmNo = vi.fn(async () => false);
    const container2 = makeEl();
    await renderVaultPanel({ containerEl: container2, confirmFn: confirmNo });
    const btns2 = container2.children[0].children[0].children[1];
    btns2.children[btns2.children.length - 1].click();
    await new Promise((r) => setTimeout(r, 5));
    expect(vaultState.deleted).toEqual([]);
  });
});

describe('并发渲染（2026-10-26 实测竞态守护）', () => {
  it('两次渲染交错时只留最后一批行，不重复追加', async () => {
    vaultState.entries = [entryFixture()];
    let release;
    vaultState.gate = new Promise((r) => { release = r; });
    const container = makeEl();
    // 存入后 onChanged 与 change handler 会各触发一次渲染 ⇒ 两个协程都在 vaultList 上等待
    const p1 = renderVaultPanel({ containerEl: container });
    const p2 = renderVaultPanel({ containerEl: container });
    release();
    await Promise.all([p1, p2]);
    vaultState.gate = null;
    const list = container.querySelector('.vault-list');
    expect(list).toBeTruthy();
    expect(list.children.length).toBe(1);
  });
});

describe('saveFilesToVault（文件入口执行体）', () => {
  it('逐个存入并汇总成败计数，触发 onChanged', async () => {
    const files = [{ name: 'a.zip', size: 10 }, { name: 'b.zip', size: 20 }];
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const onChanged = vi.fn();
    const res = await saveFilesToVault(files, { logger, onChanged });
    expect(res).toEqual({ ok: 2, fail: 0 });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it('空列表是 no-op（不触发 onChanged）', async () => {
    const onChanged = vi.fn();
    const res = await saveFilesToVault([], { onChanged });
    expect(res).toEqual({ ok: 0, fail: 0 });
    expect(onChanged).not.toHaveBeenCalled();
  });
});
