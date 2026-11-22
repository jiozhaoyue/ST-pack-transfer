import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mountNativeBackupButton, mountLukerBackupManagerButton, mountExtensionRowButton,
  mountTtDataMigrationButton, mountPtDataManagementButton,
  openNativeBackupUi, readNativeBackupSelection, readPtExportOptions, hostToast,
} from '../src/ui/host-bridge.js';

/**
 * 宿主注入按钮工厂契约（R7.3）。
 *
 * 项目不引入 jsdom（依赖自包含 L1-MR-11 / 不擅自装包 G6），故用最小 DOM 桩
 * 驱动两处挂载函数，锁定注入按钮的结构契约：宿主原生类、`stZipInjected`
 * 幂等标记、图标在前文案在后（且文案走 textContent）、click 包裹
 * preventDefault/stopPropagation 后再回调 onClick。
 */

const g = globalThis;

/** click 时注入给监听器的受控事件对象所记录的效果 */
let clickEffects = { prevented: 0, stopped: 0 };
const preventDefault = () => { clickEffects.prevented += 1; };
const stopPropagation = () => { clickEffects.stopped += 1; };

function makeEl(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    title: '',
    style: {},
    dataset: {},
    textContent: '',
    children: [],
    parentElement: null,
    nextSibling: null,
    nextElementSibling: null,
    firstChild: null,
    inserted: [],
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      if (!this.firstChild) this.firstChild = child;
      return child;
    },
    insertBefore(node, ref) {
      this.inserted.push({ node, ref });
      this.children.push(node);
      node.parentElement = this;
      if (!this.firstChild) this.firstChild = node;
      return node;
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    click() {
      (listeners.click || []).forEach((fn) => fn({ preventDefault, stopPropagation }));
    },
    querySelector(sel) {
      if (sel === 'span') return this.children.find((c) => c.tagName === 'SPAN') || null;
      if (sel === '.backupDownloadButton') return this.children.find((c) => String(c.className || '').includes('backupDownloadButton')) || null;
      if (sel === '[data-st-pack-transfer-injected="1"]') return null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.inline-drawer') return this.children.filter((c) => c.className?.includes('inline-drawer'));
      return [];
    },
  };
}

/** 安装最小 DOM：anchors = .userBackupButton 锚点；row = Luker 备份管理器动作行；
 *  blocks = 宿主扩展列表行（`.extension_block[data-name*=ST-pack-transfer]`） */
function installDom({ anchors = [], row = null, blocks = [], extensionsSettings = null } = {}) {
  const created = [];
  g.document = {
    readyState: 'complete',
    body: makeEl('body'),
    createElement(tag) {
      const el = makeEl(tag);
      created.push(el);
      return el;
    },
    // 宿主设置锚点：桩环境下一律缺失，注入函数安全早退
    getElementById: (id) => {
      if (id === 'extensions_settings') return extensionsSettings;
      return byId(created, id);
    },
    querySelector: (sel) => (sel === '.userBackupManager .backupActionRow' ? row : null),
    querySelectorAll: (sel) => {
      if (sel === '.userBackupButton') return anchors;
      if (sel === '.userBackupManager .backupActionRow') return row ? [row] : [];
      if (sel === '.extension_block[data-name*="ST-pack-transfer"]') return blocks;
      return [];
    },
    addEventListener: () => {},
  };
  g.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  return created;
}

const byId = (created, id) => created.find((el) => el.id === id) || null;

/** 新契约：多锚点场景按钮 id 为 `st-pack-transfer-native-btn-{i}`（i 为锚点序号），
 *  判重走锚点兄弟位的 `dataset.stZipInjected`；故按「幂等标记 + id 前缀」匹配，
 *  不写死固定 id / 序号（单锚点场景实际为 `st-pack-transfer-native-btn-0`）。 */
const byPullBtns = (created, prefix = 'st-pack-transfer-native-btn-') =>
  created.filter((el) => el.dataset?.stZipInjected === '1'
    && typeof el.id === 'string' && el.id.startsWith(prefix));

describe('makeHostButton 契约（经 mountNativeBackupButton 注入）', () => {
  let anchor;

  beforeEach(() => {
    anchor = makeEl('div');
    anchor.parentElement = makeEl('div');
    anchor.appendChild(makeEl('span')); // 账号弹层锚点含文案 span
  });

  afterEach(() => {
    delete g.document;
    delete g.MutationObserver;
  });

  it('带宿主原生类、幂等标记与功能名 title', () => {
    const created = installDom({ anchors: [anchor] });

    mountNativeBackupButton(() => {});

    const btns = byPullBtns(created);
    expect(btns).toHaveLength(1);
    const btn = btns[0];
    expect(btn.id).toBe('st-pack-transfer-native-btn-0');
    expect(btn.className).toBe('menu_button menu_button_icon');
    expect(btn.dataset.stZipInjected).toBe('1');
    expect(btn.title).toBe('从宿主拉取数据包（按原生界面的类目勾选）');
  });

  it('结构为「图标在前、文案在后」，文案走 textContent 而非 innerHTML', () => {
    const created = installDom({ anchors: [anchor] });

    mountNativeBackupButton(() => {});

    const btns = byPullBtns(created);
    expect(btns).toHaveLength(1);
    const btn = btns[0];
    expect(btn.children.map((c) => c.tagName)).toEqual(['I', 'SPAN']);
    expect(btn.children[0].className).toBe('fa-fw fa-solid fa-right-left');
    expect(btn.children[1].textContent).toBe('从宿主拉取');
  });

  it('click 先 preventDefault + stopPropagation，再回调 onClick', () => {
    const created = installDom({ anchors: [anchor] });
    let opened = 0;

    mountNativeBackupButton(() => { opened += 1; });
    clickEffects = { prevented: 0, stopped: 0 };
    const btns = byPullBtns(created);
    expect(btns).toHaveLength(1);
    btns[0].click();

    expect(clickEffects.prevented).toBe(1);
    expect(clickEffects.stopped).toBe(1);
    expect(opened).toBe(1);
  });

  it('只注入「从宿主拉取」一个入口，不再有「一键拉取」', () => {
    const created = installDom({ anchors: [anchor] });

    mountNativeBackupButton(() => {});

    // 只注入「从宿主拉取」一个入口：pull 前缀按钮恰好一个，
    // 且不存在旧固定 id 或 quick-fetch 形态的「一键拉取」入口。
    expect(byPullBtns(created)).toHaveLength(1);
    expect(byId(created, 'st-pack-transfer-native-btn')).toBeNull();
    expect(byId(created, 'st-pack-transfer-native-btn-quick-fetch')).toBeNull();
    expect(created.filter((el) => String(el.textContent || '').includes('一键拉取'))).toHaveLength(0);
  });
});

describe('makeHostButton 契约（经 mountLukerBackupManagerButton 注入）', () => {
  afterEach(() => {
    delete g.document;
    delete g.MutationObserver;
  });

  it('与 ST 侧完全同构（同一工厂），并插到动作行最前', () => {
    const row = makeEl('div');
    const nativeZipBtn = makeEl('button'); // 模拟 Luker 原生 ZIP 下载按钮
    nativeZipBtn.className = 'backupDownloadButton';
    row.appendChild(nativeZipBtn);
    const created = installDom({ row });

    mountLukerBackupManagerButton(() => {});

    const btn = byId(created, 'st-pack-transfer-luker-manager-btn');
    expect(btn).not.toBeNull();
    expect(btn.className).toBe('menu_button menu_button_icon');
    expect(btn.dataset.stZipInjected).toBe('1');
    expect(btn.children.map((c) => c.tagName)).toEqual(['I', 'SPAN']);
    expect(btn.children[1].textContent).toBe('从宿主拉取');

    // 插到动作行最前：原生 ZIP 下载按钮之前
    expect(row.inserted.length).toBe(1);
    expect(row.inserted[0].node).toBe(btn);
    expect(row.inserted[0].ref).toBe(nativeZipBtn);
  });

  it('锚点不存在时静默不注入（其余宿主自然无操作）', () => {
    const created = installDom({ row: null });

    expect(() => mountLukerBackupManagerButton(() => {})).not.toThrow();
    expect(created.length).toBe(0);
  });
});

/**
 * 扩展列表行注入（2026-10-15 用户裁定：扩展列表只留宿主那一行）。
 *
 * 宿主自己会为每个扩展渲染 `.extension_block`（含原生启用开关），
 * 我们**只往那一行追加「打开」**，不再往 `#extensions_settings2` 塞内联抽屉。
 * 锁定三条：落点是宿主原生行、按钮走同一工厂、宿主重渲染时幂等不重复。
 */
describe('mountExtensionRowButton 契约（扩展设置列表抽屉注入）', () => {
  afterEach(() => {
    delete g.document;
    delete g.MutationObserver;
  });

  it('往宿主 #extensions_settings 注入内联抽屉容器，内容包含「打开面板」', () => {
    const extSettings = makeEl('div');
    extSettings.id = 'extensions_settings';
    installDom({ extensionsSettings: extSettings });

    mountExtensionRowButton(() => {});

    // 宿主行内只多一个节点：宿主同款 inline-drawer
    expect(extSettings.children).toHaveLength(1);
    const container = extSettings.children[0];
    expect(container.id).toBe('st-pack-transfer-container');
    expect(container.className).toBe('extension_container');
    expect(container.dataset.stPackTransferInjected).toBe('1');
    const drawer = container.children[0];
    expect(drawer.className).toBe('inline-drawer');
    expect(drawer.dataset.stPackTransferInjected).toBe('1');

    const [toggle, content] = drawer.children;
    expect(toggle.className).toContain('inline-drawer-toggle');
    expect(toggle.children[0].textContent).toBe('数据包转运');

    expect(content.className).toBe('inline-drawer-content');
    const btn = content.children[0];
    expect(btn.id).toBe('st-pack-transfer-open-btn');
    expect(btn.className).toBe('menu_button menu_button_icon');
    expect(btn.dataset.stZipInjected).toBe('1');
    expect(btn.children.map((c) => c.tagName)).toEqual(['I', 'SPAN']);
    expect(btn.children[1].textContent).toBe('打开面板');
  });

  it('click 后回调 onOpen（全屏打开工作台）', () => {
    const extSettings = makeEl('div');
    extSettings.id = 'extensions_settings';
    const created = installDom({ extensionsSettings: extSettings });
    let opened = 0;

    mountExtensionRowButton(() => { opened += 1; });
    clickEffects = { prevented: 0, stopped: 0 };
    const btn = byId(created, 'st-pack-transfer-open-btn');
    btn.click();

    expect(opened).toBe(1);
    expect(clickEffects.prevented).toBe(1);
    expect(clickEffects.stopped).toBe(1);
  });

  it('容器不存在时静默不注入', () => {
    const created = installDom({ extensionsSettings: null });

    expect(() => mountExtensionRowButton(() => {})).not.toThrow();
    expect(created.length).toBe(0);
  });
});

/**
 * 原生备份界面桥接（2026-11-04）：类目勾选发生在宿主原生侧，
 * 插件只负责打开界面、读取勾选、用原生 toast 回报。
 */
describe('原生备份界面桥接', () => {
  afterEach(() => {
    delete g.document;
    delete g.MutationObserver;
    delete g.toastr;
  });

  it('readNativeBackupSelection 读取原生复选框；未打开时返回 null', () => {
    g.document = {
      querySelectorAll: (sel) => (sel === '.userBackupManager input[name="backupCategory"]'
        ? [{ value: 'settings', checked: true }, { value: 'backups', checked: false }]
        : []),
    };
    expect(readNativeBackupSelection()).toEqual({ settings: true, backups: false });

    g.document = { querySelectorAll: () => [] };
    expect(readNativeBackupSelection()).toBeNull();
  });

  it('hostToast 优先宿主原生 toastr；缺席时返回 false', () => {
    let got = null;
    g.toastr = { success: (message) => { got = message; } };
    expect(hostToast('done')).toBe(true);
    expect(got).toBe('done');

    delete g.toastr;
    expect(hostToast('done')).toBe(false);
  });

  it('openNativeBackupUi：找不到账户入口时返回 false（调用方静默回退）', async () => {
    g.document = { querySelector: () => null, getElementById: () => null };
    expect(await openNativeBackupUi('st')).toBe(false);
  });

  it('openNativeBackupUi：锚点已渲染时直接返回 true（ST/TT 无需点开）', async () => {
    const anchor = makeEl('button');
    g.document = {
      querySelector: (sel) => (sel === '.userBackupButton' ? anchor : null),
      getElementById: () => null,
    };
    expect(await openNativeBackupUi('st')).toBe(true);
  });

  it('openNativeBackupUi(tt)：数据迁移扩展已渲染时返回 true（不用账户面板）', async () => {
    const nativeExport = { id: 'data_migration_export_button', offsetParent: {} };
    const block = { querySelector: () => null };
    g.document = {
      getElementById: (id) => (id === 'data_migration_settings'
        ? block
        : id === 'data_migration_export_button' ? nativeExport : null),
      querySelector: () => null,
    };
    expect(await openNativeBackupUi('tt')).toBe(true);
  });

  it('openNativeBackupUi(pt)：点扩展入口后 dialog 打开才算成功', async () => {
    let opened = false;
    const dialog = { get open() { return opened; } };
    const entry = { querySelector: () => ({ click: () => { opened = true; } }) };
    g.document = {
      querySelector: (sel) => (sel === '#pure-tavern-data-management-entry' ? entry : null),
      getElementById: (id) => (id === 'pure-tavern-data-management-dialog' ? dialog : null),
    };
    expect(await openNativeBackupUi('pt')).toBe(true);
  });

  it('readPtExportOptions 读取原生模块勾选与敏感标记', () => {
    g.document = {
      querySelectorAll: (sel) => (sel === '#ptdm-modules input[data-module]'
        ? [
          { checked: true, dataset: { module: 'chats' } },
          { checked: true, dataset: { module: 'secrets', sensitive: '' } },
          { checked: false, dataset: { module: 'lorebooks' } },
        ]
        : []),
    };
    expect(readPtExportOptions()).toEqual({ moduleIds: ['chats', 'secrets'], includeSecrets: true });

    g.document = { querySelectorAll: () => [] };
    expect(readPtExportOptions()).toBeNull();
  });

  it('TT / PT 注入按钮落在各自原生导出按钮之前', () => {
    for (const [mountFn, exportId] of [
      [mountTtDataMigrationButton, 'data_migration_export_button'],
      [mountPtDataManagementButton, 'ptdm-export'],
    ]) {
      const created = [];
      const toolbar = makeEl('div');
      const nativeExport = makeEl('button');
      nativeExport.id = exportId;
      toolbar.appendChild(nativeExport);
      g.document = {
        readyState: 'complete',
        body: makeEl('body'),
        getElementById: (id) => (id === exportId ? nativeExport : null),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: (tag) => { const el = makeEl(tag); created.push(el); return el; },
      };
      g.MutationObserver = class { observe() {} disconnect() {} };

      mountFn(() => {});

      expect(toolbar.inserted.length).toBe(1);
      expect(toolbar.inserted[0].ref).toBe(nativeExport);
      expect(created[0].children[1].textContent).toBe('从宿主拉取');
    }
  });
});
