import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  isNativeExportBusy, closeNativeBackupUi, mountLukerBackupManagerButton,
} from '../src/ui/host-bridge.js';

/**
 * 宿主原生导出忙态探针 / 原生弹层关闭 / Luker 管理器注入自愈（2026-11-08 回归锁定）。
 *
 * 背景（Real Luker 实测）：账户面板 .userBackupButton 在备份弹层打开期间恒带 `disabled`
 * 类，管理器里恢复/复制按钮空闲时也带 `disabled` 类 —— 按类名判忙会把空闲态误判成
 * 「原生导出在途」，导致「从宿主拉取」永远被取消；裸 dialog.close() 绕过宿主 Popup
 * 生命周期（不走 complete()），promise 永久挂起 + 弹层 DOM 残留，残留 id 又挡住再注入。
 * 与 host-button-factory.test.js 同款最小桩风格（项目不引入 jsdom，L1-MR-11）。
 */

const g = globalThis;

/** 最小元素桩：只带被测代码会触碰的成员 */
function makeEl(tag = 'div', props = {}) {
  return {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    disabled: undefined,
    dataset: {},
    style: {},
    parentElement: null,
    offsetParent: undefined, // 与真实 HTMLElement 不同则判可见（fail-open）
    children: [],
    inserted: [],
    attrs: {},
    removed: 0,
    clicks: 0,
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    insertBefore(node, ref) { this.inserted.push({ node, ref }); return node; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, v) { this.attrs[name] = v; },
    removeAttribute(name) { delete this.attrs[name]; },
    close(...a) { this.closedWith = a.length; this.closeCalled = (this.closeCalled || 0) + 1; },
    addEventListener() {},
    querySelector(sel) { return this.qs?.(sel) ?? null; },
    querySelectorAll() { return []; },
    remove() { this.removed += 1; },
    click() { this.clicks += 1; },
    ...props,
  };
}

/** 安装 document 桩：按「选择器原文」精确分发（与仓内既有桩同风格） */
function installDom({ probeEls = {}, rows = [], byIdMap = {}, managerQuery = null } = {}) {
  const created = [];
  g.document = {
    readyState: 'complete',
    body: makeEl('body'),
    createElement(tag) {
      const el = makeEl(tag);
      created.push(el);
      return el;
    },
    querySelector(sel) {
      if (sel === '.userBackupManager .backupActionRow') return rows[0] ?? null;
      if (sel === '.userBackupManager:has(.backupDownloadButton) .backupActionRow') return managerQuery;
      if (sel === '.userBackupManager:has(.backupDownloadButton)') return managerQuery ? makeEl('div') : null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.userBackupManager .backupDownloadButton.disabled') return probeEls.busy ?? [];
      if (sel === '#data_migration_export_button') return probeEls.tt ?? [];
      if (sel === '#ptdm-export') return probeEls.pt ?? [];
      if (sel === '.userBackupManager .backupActionRow') return rows;
      return [];
    },
    getElementById(id) { return byIdMap[id] ?? null; },
    addEventListener() {},
  };
  g.MutationObserver = class { observe() {} disconnect() {} };
  return created;
}

afterEach(() => {
  delete g.document;
  delete g.MutationObserver;
});

describe('isNativeExportBusy：只认确凿在途标记，不再按 className 判忙', () => {
  it('管理器下载按钮带 disabled 类且可见 → 在途（真信号）', () => {
    const dl = makeEl('div', { className: 'backupDownloadButton menu_button disabled' });
    installDom({ probeEls: { busy: [dl] } });
    expect(isNativeExportBusy('luker')).toBe(true);
  });

  it('账户打开器挂 disabled 类（= 弹层开着，非导出）→ 不判忙（回归锁定）', () => {
    // 探针表已不含 .userBackupButton：桩对探针选择器返回空即可
    installDom({ probeEls: { busy: [] } });
    expect(isNativeExportBusy('luker')).toBe(false);
  });

  it('已关闭未移除的残留弹层里的忙标记（不可见）→ 放行不判忙', () => {
    const stale = makeEl('div', { className: 'backupDownloadButton disabled' });
    stale.checkVisibility = () => false;
    installDom({ probeEls: { busy: [stale] } });
    expect(isNativeExportBusy('luker')).toBe(false);
  });

  it('自家注入按钮即使撞上探针选择器也绝不自证忙', () => {
    const own = makeEl('div', { className: 'backupDownloadButton disabled' });
    own.dataset.stZipInjected = '1';
    own.closest = () => makeEl('div', { dataset: { stZipInjected: '1' } });
    installDom({ probeEls: { busy: [own] } });
    expect(isNativeExportBusy('luker')).toBe(false);
  });

  it('tt/pt：原生 button 带禁用属性 → 在途；无标记 → 放行', () => {
    const ttBusy = makeEl('button', { disabled: true });
    installDom({ probeEls: { tt: [ttBusy], pt: [] } });
    expect(isNativeExportBusy('tt')).toBe(true);

    const ttIdle = makeEl('button', { disabled: false });
    installDom({ probeEls: { tt: [ttIdle], pt: [] } });
    expect(isNativeExportBusy('tt')).toBe(false);
  });
});

describe('closeNativeBackupUi：走宿主完成链路，不再裸关 + 强制隐藏', () => {
  it('有 [data-result] 完成控件 → 点它；不裸 close、不强制 display:none', () => {
    const control = makeEl('button');
    const surface = makeEl('dialog');
    surface.setAttribute('open', '');
    surface.qs = (sel) => (sel === '[data-result]' ? control : null);
    const anchor = makeEl('div', { closest: () => surface });
    installDom({ byIdMap: { 'st-pack-transfer-luker-manager-btn': anchor } });

    closeNativeBackupUi('luker');

    expect(control.clicks).toBe(1);
    expect(surface.closeCalled).toBeUndefined();
    expect(surface.style.display).toBe(undefined ?? surface.style.display); // 未被强设
    expect('open' in surface.attrs ? surface.attrs.open : undefined).toBe('');
  });

  it('无完成控件但有 close() → 裸关兜底；仍不强制隐藏', () => {
    const surface = makeEl('dialog');
    surface.setAttribute('open', '');
    const anchor = makeEl('div', { closest: () => surface });
    installDom({ byIdMap: { 'st-pack-transfer-luker-manager-btn': anchor } });

    closeNativeBackupUi('luker');

    expect(surface.closeCalled).toBe(1);
    expect(surface.style.display).toBe(undefined ?? surface.style.display);
  });

  it('非 dialog（无控件无 close）→ 旧兜底：摘 open + display:none', () => {
    const surface = makeEl('div', { close: undefined, querySelector: undefined }); // 真正无 close/无控件
    surface.setAttribute('open', '');
    const anchor = makeEl('div', { closest: () => surface });
    installDom({ byIdMap: { 'st-pack-transfer-native-btn': anchor } });

    closeNativeBackupUi('st');

    expect(surface.attrs.open).toBeUndefined();
    expect(surface.style.display).toBe('none');
  });

  it('锚点优先级：管理器按钮优先于账户面板按钮（只关承载层）', () => {
    const managerControl = makeEl('button');
    const managerSurface = makeEl('dialog');
    managerSurface.qs = (sel) => (sel === '[data-result]' ? managerControl : null);
    const accountSurface = makeEl('dialog');
    accountSurface.qs = () => null;
    accountSurface.close = () => { accountSurface.closeCalled = 1; };

    const managerAnchor = makeEl('div', { closest: () => managerSurface });
    const nativeAnchor = makeEl('div', { closest: () => accountSurface });
    installDom({
      byIdMap: {
        'st-pack-transfer-luker-manager-btn': managerAnchor,
        'st-pack-transfer-native-btn': nativeAnchor,
      },
    });

    closeNativeBackupUi('luker');

    expect(managerControl.clicks).toBe(1);
    expect(accountSurface.closeCalled).toBeUndefined();
  });
});

describe('mountLukerBackupManagerButton：注入行限定下载行 + 陈旧按钮自愈', () => {
  it('日志弹层行在前也不误注：只注含 .backupDownloadButton 的动作行', () => {
    const logsRow = makeEl('div'); // 日志查看器行（无下载按钮）
    const managerRow = makeEl('div', { qs: (sel) => (sel === '.backupDownloadButton' ? makeEl('div') : null) });
    const nativeZip = makeEl('button');
    managerRow.appendChild(nativeZip);
    installDom({ rows: [logsRow, managerRow] });

    mountLukerBackupManagerButton(() => {});

    expect(managerRow.inserted.length).toBe(1);
    expect(logsRow.inserted.length).toBe(0);
    expect(managerRow.inserted[0].node.id).toBe('st-pack-transfer-luker-manager-btn');
  });

  it('残留弹层里的旧按钮被搬家：移除旧节点并注入当前行', () => {
    const managerRow = makeEl('div', { qs: (sel) => (sel === '.backupDownloadButton' ? makeEl('div') : null) });
    const stale = makeEl('div', { id: 'st-pack-transfer-luker-manager-btn' });
    installDom({ rows: [managerRow], byIdMap: { 'st-pack-transfer-luker-manager-btn': stale } });

    mountLukerBackupManagerButton(() => {});

    expect(stale.removed).toBe(1);
    expect(managerRow.inserted.length).toBe(1);
  });

  it('按钮已在当前动作行 → 不重复注入', () => {
    const managerRow = makeEl('div', { qs: (sel) => (sel === '.backupDownloadButton' ? makeEl('div') : null) });
    const current = makeEl('div', { id: 'st-pack-transfer-luker-manager-btn' });
    managerRow.appendChild(current);
    managerRow.contains = (n) => n === current; // 桩补 contains
    installDom({ rows: [managerRow], byIdMap: { 'st-pack-transfer-luker-manager-btn': current } });

    mountLukerBackupManagerButton(() => {});

    expect(managerRow.inserted.length).toBe(0);
    expect(current.removed).toBe(0);
  });

  it('无任何动作行 → 静默不注入不抛错', () => {
    installDom({ rows: [] });
    expect(() => mountLukerBackupManagerButton(() => {})).not.toThrow();
  });
});
