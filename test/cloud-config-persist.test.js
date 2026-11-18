/**
 * 云端配置持久化契约（2026-11-19 数据丢失缺陷回归）。
 *
 * ## 被钉住的线上故障
 *
 * 用户报障：「云端仓库的信息等，刷新页面就会丢，即使点了保存配置」。
 *
 * 根因 A：`persistCloudConfig` / `persistWebdavConfig` 在 `state.tutorialMode`
 * 下 `return true` —— 一字未存却回报成功；`cloudSave()` 据此显示「已保存」，
 * 并把表单值写进内存 `C.config`。界面有值、刷新全空。
 *
 * 根因 B：教程浮层的「跳过」只关浮层（`state.tutorialOpen=false`），
 * `tutorialMode` 仍是 true；主界面又能正常操作 ⇒ 用户以为已退出演示态。
 *
 * 根因 C：`#cloud-save` / `#webdav-save` 不在 `demoTutorialActions()` 包装里，
 * 其他操作会弹「演示模式」提示，唯独保存静默成功。
 *
 * ## 本文件证明什么
 *
 * 用 `test/helpers/minimal-dom.js` 的最小桩 + 自建「记录监听器」元素，
 * 真实点击 `#cloud-save` / `#webdav-save` / `#tutorial-skip`，
 * 断言 localStorage 是否真的被写、state 是否真的退出演示态。
 * 「刷新」用 `vi.resetModules()` 重新求值模块来模拟（新实例只读 localStorage）。
 *
 * 不证明：布局与视觉。像素另有守卫。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installMinimalDom, makeElement } from './helpers/minimal-dom.js';
import { t } from '../src/i18n/index.js';

const CLOUD_KEY = 'st-pack-transfer:s3';
const WEBDAV_KEY = 'st-pack-transfer:webdav';

let uninstallDom = null;
let storage = null;
let dom = null;
let view = null;
let prevFetch = null;

/** 记录监听器的 DOM：把 addEventListener 存进桶里，click() 同步派发。 */
function installRecordingDom() {
  uninstallDom = installMinimalDom();
  const buckets = new Map();
  const watch = (id) => {
    const el = globalThis.document.getElementById(id);
    const bucket = buckets.get(id) || {};
    buckets.set(id, bucket);
    el.addEventListener = (type, fn) => {
      (bucket[type] || (bucket[type] = [])).push(fn);
    };
    el.click = () => {
      const fns = bucket.click || [];
      return Promise.all(fns.map((fn) => fn({ target: el })));
    };
    return el;
  };
  /* 必须在 import 之前创建并打补丁：bind() 在模块求值时就要注册这些监听器。 */
  ['cloud-save', 'webdav-save', 'tutorial-skip', 'tutorial-banner-exit', 'tutorial-banner-reopen', 'tutorial-never']
    .forEach(watch);
  return {
    el: (id) => globalThis.document.getElementById(id),
    click: (id) => globalThis.document.getElementById(id).click(),
  };
}

/** localStorage 桩：包内可断言真实键值，模拟「刷新后重新读」。 */
function installLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
  return map;
}

/** 每次重新求值模块 = 全新 state = 一次「刷新页面」。 */
async function loadView() {
  vi.resetModules();
  const mod = await import('../src/ui/workbench-view.js');
  return mod.createWorkbenchView({
    /* 身份预检直接成功，避免 600ms 重试定时器在测试结束后还在跑。 */
    actions: { hostIdentity: async () => ({ ok: true, name: 'tester', admin: false }) },
    qr: null,
  });
}

/** 填好一份可辨识的 S3 表单值。 */
function fillS3Form(d) {
  d.el('cloud-endpoint').value = 'https://s3.example.com';
  d.el('cloud-bucket').value = 'my-bucket';
  d.el('cloud-prefix').value = 'backups';
  d.el('cloud-access-key').value = '';
  d.el('cloud-secret-key').value = '';
}

function fillWebdavForm(d) {
  d.el('webdav-base-url').value = 'https://dav.example.com/files';
  d.el('webdav-username').value = 'alice';
  d.el('webdav-prefix').value = 'packs';
}

beforeEach(async () => {
  storage = installLocalStorage();
  dom = installRecordingDom();
  prevFetch = globalThis.fetch;
  /* 任何真实网络请求都视为测试缺陷：直接抛。 */
  globalThis.fetch = () => { throw new Error('测试禁止真实网络请求'); };
  view = await loadView();
});

afterEach(() => {
  globalThis.fetch = prevFetch;
  delete globalThis.localStorage;
  if (uninstallDom) uninstallDom();
  uninstallDom = null;
  storage = null;
  dom = null;
  view = null;
  vi.resetModules();
});

describe('教程演示态：保存必须失败且不落盘', () => {
  it('S3：不显示「已保存」、不写 localStorage、不把表单值写进内存配置', async () => {
    view.openTutorial();
    expect(view.isTutorialMode()).toBe(true);

    fillS3Form(dom);
    await dom.click('cloud-save');

    const state = view.getState();
    /* 根因 A 的直接断言：返回 true 的假成功会让这里变成「连接已保存」。 */
    expect(state.cloud.status).not.toBe(t('cloud.saved'));
    expect(state.cloud.status).toBe(t('cloud.demoNoSave'));
    /* 一字未存：localStorage 里不能出现假值。 */
    expect(storage.has(CLOUD_KEY)).toBe(false);
    /* 内存配置也不能被写脏，否则界面看起来「配置已在」。 */
    expect(state.cloud.config).toBeNull();
  });

  it('WebDAV：同样拒绝并给出「演示模式不保存配置」', async () => {
    view.openTutorial();
    view.getState().cloud.provider = 'webdav';

    fillWebdavForm(dom);
    await dom.click('webdav-save');

    const state = view.getState();
    expect(state.cloud.status).toBe(t('cloud.demoNoSave'));
    expect(state.cloud.status).not.toBe(t('cloud.saved'));
    expect(storage.has(WEBDAV_KEY)).toBe(false);
    expect(state.cloud.webdav).toBeNull();
  });
});

describe('非教程态：保存必须真实落盘并可刷新读回', () => {
  it('S3 配置写入 localStorage，新模块实例（模拟刷新）能读回', async () => {
    expect(view.isTutorialMode()).toBe(false);
    fillS3Form(dom);
    await dom.click('cloud-save');

    const raw = storage.get(CLOUD_KEY);
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw);
    expect(saved.endpoint).toBe('https://s3.example.com');
    expect(saved.bucket).toBe('my-bucket');
    expect(saved.prefix).toBe('backups');

    /* 刷新：全新模块实例只能从 localStorage 取值。 */
    const refreshed = await loadView();
    const cfg = refreshed.getState().cloud.config;
    expect(cfg).toBeTruthy();
    expect(cfg.endpoint).toBe('https://s3.example.com');
    expect(cfg.bucket).toBe('my-bucket');
  });

  it('WebDAV 配置写入 localStorage，新模块实例能读回', async () => {
    view.getState().cloud.provider = 'webdav';
    fillWebdavForm(dom);
    await dom.click('webdav-save');

    const raw = storage.get(WEBDAV_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).baseUrl).toBe('https://dav.example.com/files');

    const refreshed = await loadView();
    const cfg = refreshed.getState().cloud.webdav;
    expect(cfg).toBeTruthy();
    expect(cfg.baseUrl).toBe('https://dav.example.com/files');
    expect(cfg.username).toBe('alice');
  });
});

describe('「跳过」必须真正退出演示模式', () => {
  it('点跳过 → tutorialMode 为 false，且 state 快照被还原', async () => {
    view.openTutorial();
    expect(view.isTutorialMode()).toBe(true);
    /* 演示态会灌入演示包，这是「已进入演示」的可观测证据。 */
    expect(view.getState().packages.length).toBeGreaterThan(0);

    await dom.click('tutorial-skip');

    expect(view.isTutorialMode()).toBe(false);
    expect(view.getState().tutorialOpen).toBe(false);
    /* 复用 exitTutorialMode() 的还原逻辑：真实包列表回到进入前的空列表。 */
    expect(view.getState().packages).toHaveLength(0);
  });

  it('跳过退出后保存 → 真正落盘（不再是假成功）', async () => {
    view.openTutorial();
    await dom.click('tutorial-skip');
    expect(view.isTutorialMode()).toBe(false);

    fillS3Form(dom);
    await dom.click('cloud-save');

    expect(storage.has(CLOUD_KEY)).toBe(true);
    expect(JSON.parse(storage.get(CLOUD_KEY)).bucket).toBe('my-bucket');
    expect(view.getState().cloud.status).not.toBe(t('cloud.demoNoSave'));
  });

  it('跳过之后仍能再次进入演示（既有交互不被破坏）', async () => {
    view.openTutorial();
    await dom.click('tutorial-skip');
    expect(view.isTutorialMode()).toBe(false);

    /* banner「重新打开教程」与主界面 guide 按钮都走 openTutorial()。 */
    await dom.click('tutorial-banner-reopen');
    expect(view.isTutorialMode()).toBe(true);
    expect(view.getState().tutorialOpen).toBe(true);
  });
});
