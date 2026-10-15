import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mountNativeBackupButton, mountLukerBackupManagerButton, mountExtensionRowButton } from '../src/ui/host-bridge.js';

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
      // 扩展行注入用：幂等标记与宿主原生动作区。桩里都没有 ⇒ 一律返回 null
      if (sel === '[data-st-zip-injected="1"]' || sel === '.extension_actions') return null;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

/** 安装最小 DOM：anchors = .userBackupButton 锚点；row = Luker 备份管理器动作行；
 *  blocks = 宿主扩展列表行（`.extension_block[data-name*=st-zip-converter]`） */
function installDom({ anchors = [], row = null, blocks = [] } = {}) {
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
    getElementById: () => null,
    querySelector: (sel) => (sel === '.userBackupManager .backupActionRow' ? row : null),
    querySelectorAll: (sel) => {
      if (sel === '.userBackupButton') return anchors;
      if (sel === '.extension_block[data-name*="st-zip-converter"]') return blocks;
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

    const btn = byId(created, 'st-zip-converter-native-btn');
    expect(btn).not.toBeNull();
    expect(btn.className).toBe('menu_button menu_button_icon');
    expect(btn.dataset.stZipInjected).toBe('1');
    expect(btn.title).toBe('打开酒馆数据包互转工坊（全屏）');
  });

  it('结构为「图标在前、文案在后」，文案走 textContent 而非 innerHTML', () => {
    const created = installDom({ anchors: [anchor] });

    mountNativeBackupButton(() => {});

    const btn = byId(created, 'st-zip-converter-native-btn');
    expect(btn.children.map((c) => c.tagName)).toEqual(['I', 'SPAN']);
    expect(btn.children[0].className).toBe('fa-fw fa-solid fa-right-left');
    expect(btn.children[1].textContent).toBe('数据包互转');
  });

  it('click 先 preventDefault + stopPropagation，再回调 onClick', () => {
    const created = installDom({ anchors: [anchor] });
    let opened = 0;

    mountNativeBackupButton(() => { opened += 1; });
    clickEffects = { prevented: 0, stopped: 0 };
    byId(created, 'st-zip-converter-native-btn').click();

    expect(clickEffects.prevented).toBe(1);
    expect(clickEffects.stopped).toBe(1);
    expect(opened).toBe(1);
  });

  it('只注入「数据包互转」一个入口，不再有「一键拉取」', () => {
    const created = installDom({ anchors: [anchor] });

    mountNativeBackupButton(() => {});

    expect(byId(created, 'st-zip-converter-native-btn')).not.toBeNull();
    expect(byId(created, 'st-zip-converter-native-btn-quick-fetch')).toBeNull();
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
    row.appendChild(nativeZipBtn);
    const created = installDom({ row });

    mountLukerBackupManagerButton(() => {});

    const btn = byId(created, 'st-zip-converter-luker-manager-btn');
    expect(btn).not.toBeNull();
    expect(btn.className).toBe('menu_button menu_button_icon');
    expect(btn.dataset.stZipInjected).toBe('1');
    expect(btn.children.map((c) => c.tagName)).toEqual(['I', 'SPAN']);
    expect(btn.children[1].textContent).toBe('数据包互转');

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
describe('mountExtensionRowButton 契约（扩展列表行上的「打开」）', () => {
  afterEach(() => {
    delete g.document;
    delete g.MutationObserver;
  });

  it('只往宿主扩展行追加一个「打开」，不生成任何自建面板', () => {
    const block = makeEl('div');
    const created = installDom({ blocks: [block] });

    mountExtensionRowButton(() => {});

    const btn = byId(created, 'st-zip-converter-open-btn');
    expect(btn).not.toBeNull();
    expect(btn.className).toBe('menu_button menu_button_icon');
    expect(btn.dataset.stZipInjected).toBe('1');
    expect(btn.children.map((c) => c.tagName)).toEqual(['I', 'SPAN']);
    expect(btn.children[1].textContent).toBe('打开');
    // 落点就是宿主那一行
    expect(block.children).toContain(btn);
  });

  it('click 后回调 onOpen（全屏打开工作台）', () => {
    const block = makeEl('div');
    installDom({ blocks: [block] });
    let opened = 0;

    mountExtensionRowButton(() => { opened += 1; });
    clickEffects = { prevented: 0, stopped: 0 };
    const btn = [...block.children].find((c) => c.id === 'st-zip-converter-open-btn');
    btn.click();

    expect(opened).toBe(1);
    expect(clickEffects.prevented).toBe(1);
    expect(clickEffects.stopped).toBe(1);
  });

  it('列表行不存在时静默不注入（宿主未渲染扩展弹层）', () => {
    const created = installDom({ blocks: [] });

    expect(() => mountExtensionRowButton(() => {})).not.toThrow();
    expect(created.length).toBe(0);
  });
});
