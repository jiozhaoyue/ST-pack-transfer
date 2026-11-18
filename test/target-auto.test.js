/**
 * 目标平台「跟随来源」契约（用户 2026-11-19 裁定）。
 *
 * 需求原话：「还有目标平台应当有跟随宿主/源包，偏好里也是，默认就是这个」。
 *
 * 语义（本文件即契约）：
 * - `auto` = **跟随来源**：有源包时跟源包的来源平台，没有源包时回落当前宿主；
 * - 默认值必须是 auto（缺配置 / 新用户 / 偏好重置都落在这里）；
 * - 手动选中后保持手动，不被源包或宿主变化冲掉；
 * - 自动模式解析结果必须与选择器同一真源（`TARGET_PLATFORMS`），不得绕过归一。
 *
 * ## 为什么需要真实调用而不是源码正则
 *
 * `workbench-view.js` 约 9000 行，既往守卫多为 `readFileSync` + `toMatch`。
 * 「默认是 auto」「切包后目标跟着变」这类**行为**无法靠字符串匹配证明，
 * 故本文件直接 `createWorkbenchView()`（最小 DOM 桩）断言真实 state。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { installMinimalDom } from './helpers/minimal-dom.js';
import { createWorkbenchView } from '../src/ui/workbench-view.js';
import { CHART_PREF_DEFAULTS, CHART_PREF_STORAGE_KEY, normalizeChartPrefs } from '../src/ui/chart-prefs.js';
import { TARGET_AUTO, resolveAutoTarget, targetHostOf, targetNameOfHost } from '../src/core/naming.js';
import { TARGET_PLATFORMS } from '../src/data/target-platforms.js';

let uninstall = null;
let view = null;

const STATE_KEY = CHART_PREF_STORAGE_KEY;

beforeEach(() => {
  uninstall = installMinimalDom();
  view = createWorkbenchView({ actions: {}, qr: null });
});

afterEach(() => {
  if (uninstall) uninstall();
  uninstall = null;
  view = null;
});

/** 造一个已带来源平台的最小包（host 由 index.js toPackage 归一写入，这里直接模拟）。 */
const pkg = (id, host) => ({ id, host, name: `${host}-${id}.zip`, zone: 'import', nodes: [] });

describe('偏好默认值 = 跟随来源', () => {
  it('CHART_PREF_DEFAULTS.target 是 auto', () => {
    expect(CHART_PREF_DEFAULTS.target).toBe(TARGET_AUTO);
  });

  it('配置缺失 / 非法值 / 空对象都归一到 auto', () => {
    expect(normalizeChartPrefs(null).target).toBe(TARGET_AUTO);
    expect(normalizeChartPrefs({}).target).toBe(TARGET_AUTO);
    expect(normalizeChartPrefs({ target: 'nonsense' }).target).toBe(TARGET_AUTO);
    expect(normalizeChartPrefs({ target: '' }).target).toBe(TARGET_AUTO);
  });

  it('显式平台码被保留（手动值不被默认值吞掉）', () => {
    for (const host of ['st', 'luker', 'tt', 'pt']) {
      expect(normalizeChartPrefs({ target: host }).target).toBe(host);
    }
  });

  it('新视图（无已存偏好）进入即自动模式', () => {
    expect(view.getState().targetManual).toBe(false);
  });
});

describe('自动模式的解析规则（纯函数层）', () => {
  it('有源包时按源包平台解析', () => {
    expect(resolveAutoTarget({ sourceHost: 'pt', host: 'luker' })).toBe('PureTavern');
    expect(resolveAutoTarget({ sourceHost: 'tt', host: 'luker' })).toBe('TauriTavern');
  });

  it('无源包时回落宿主', () => {
    expect(resolveAutoTarget({ sourceHost: '', host: 'luker' })).toBe('Luker');
    expect(resolveAutoTarget({ host: 'st' })).toBe('SillyTavern');
  });

  it('两侧都解析不出时返回空串，不猜平台', () => {
    expect(resolveAutoTarget({})).toBe('');
    expect(resolveAutoTarget()).toBe('');
    expect(resolveAutoTarget({ sourceHost: 'unknown-host', host: '' })).toBe('');
  });

  it('平台名 ↔ 宿主码往返一致，且与 TARGET_PLATFORMS 同源', () => {
    for (const p of TARGET_PLATFORMS) {
      expect(targetHostOf(p.name)).toBe(p.host);
      expect(targetNameOfHost(p.host)).toBe(p.name);
    }
    expect(targetHostOf('不存在的平台')).toBe('');
    expect(targetNameOfHost('nope')).toBe('');
  });
});

describe('自动模式随源包 / 宿主变化', () => {
  it('激活 PT 源包 → 目标变 PureTavern', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'pt')]);
    view.setActivePackage('a');
    expect(view.getState().target).toBe('PureTavern');
    expect(view.getState().targetManual).toBe(false);
  });

  it('切换到 TT 源包 → 目标跟着变 TauriTavern', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'pt'), pkg('b', 'tt')]);
    view.setActivePackage('a');
    expect(view.getState().target).toBe('PureTavern');
    view.setActivePackage('b');
    expect(view.getState().target).toBe('TauriTavern');
  });

  it('取消激活（无源包）→ 回落到宿主平台', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'pt')]);
    view.setActivePackage('a');
    expect(view.getState().target).toBe('PureTavern');
    view.setActivePackage(null);
    expect(view.getState().target).toBe('Luker');
  });

  it('切宿主且无源包 → 目标跟宿主', () => {
    view.setHost('st', 'plugin');
    expect(view.getState().target).toBe('SillyTavern');
    view.setHost('tt', 'plugin');
    expect(view.getState().target).toBe('TauriTavern');
  });

  it('宿主切换会清空源包，目标不得停在旧源包平台', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'pt')]);
    view.setActivePackage('a');
    expect(view.getState().target).toBe('PureTavern');
    view.setHost('tt', 'plugin');
    expect(view.getState().target).toBe('TauriTavern');
  });

  it('解析结果永远落在四个合法目标之一', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'luker'), pkg('b', 'unknown')]);
    const names = TARGET_PLATFORMS.map((p) => p.name);
    view.setActivePackage('a');
    expect(names).toContain(view.getState().target);
    view.setActivePackage('b');
    expect(names).toContain(view.getState().target);
  });
});

describe('手动选中后保持手动', () => {
  it('手动选 PureTavern 后，换源包不改目标', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'pt'), pkg('b', 'tt')]);
    view.setActivePackage('a');
    /* 模拟用户在选择器里显式选中 PureTavern（与自动解析结果相同也必须记住手动）。 */
    const pop = globalThis.document.getElementById('target-pop');
    expect(pop).toBeTruthy();
    view.getState().targetManual = true;
    view.getState().target = 'PureTavern';
    view.setActivePackage('b');
    expect(view.getState().target).toBe('PureTavern');
    expect(view.getState().targetManual).toBe(true);
  });

  it('手动选平台后，切宿主也不改目标', () => {
    view.setHost('luker', 'plugin');
    view.setPackages([pkg('a', 'pt')]);
    view.setActivePackage('a');
    /* 手动锁到 TauriTavern。 */
    view.getState().targetManual = true;
    view.getState().target = 'TauriTavern';
    view.setHost('st', 'plugin');
    expect(view.getState().target).toBe('TauriTavern');
    expect(view.getState().targetManual).toBe(true);
  });

  it('手动值经偏好存储往返后仍是手动（不退回 auto）', () => {
    const saved = normalizeChartPrefs({ target: 'tt' });
    expect(saved.target).toBe('tt');
    /* 重新加载同一份偏好：仍然是手动。 */
    const reloaded = normalizeChartPrefs(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.target).toBe('tt');
  });
});

describe('偏好与选择器同一真源', () => {
  it('偏好白名单里的平台码与 TARGET_PLATFORMS.host 完全一致', () => {
    /* normalizeChartPrefs 内部白名单是 ['auto','st','luker','tt','pt']；
       这里用「每个合法 host 都被保留、其他值被拒」证明二者同源。 */
    for (const p of TARGET_PLATFORMS) {
      expect(normalizeChartPrefs({ target: p.host }).target).toBe(p.host);
    }
    expect(normalizeChartPrefs({ target: 'pT' }).target).toBe(TARGET_AUTO);
  });

  it('模块冷启动读取已存偏好（手动平台）而不是落到默认', async () => {
    /* `chartPrefs` 是模块级单例，只在模块首次求值时读一次 localStorage。
       要验证「启动读取」，必须重置模块图后重新导入，模拟一次真实冷启动。
       注意：`chart-prefs.js` 读的是裸 `localStorage` 全局（浏览器语义），
       故这里必须同时装到 globalThis，光有 window 上的那份读不到。 */
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.window.localStorage.setItem(STATE_KEY, JSON.stringify({ target: 'pt' }));
    vi.resetModules();
    const fresh = await import('../src/ui/workbench-view.js');
    const v2 = fresh.createWorkbenchView({ actions: {}, qr: null });
    expect(v2.getState().target).toBe('PureTavern');
    expect(v2.getState().targetManual).toBe(true);
    globalThis.window.localStorage.removeItem(STATE_KEY);
    globalThis.localStorage = undefined;
  });

  it('模块冷启动读取 auto 偏好时进入自动模式', async () => {
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.window.localStorage.setItem(STATE_KEY, JSON.stringify({ target: 'auto' }));
    vi.resetModules();
    const fresh = await import('../src/ui/workbench-view.js');
    const v2 = fresh.createWorkbenchView({ actions: {}, qr: null });
    expect(v2.getState().targetManual).toBe(false);
    globalThis.window.localStorage.removeItem(STATE_KEY);
    globalThis.localStorage = undefined;
  });
});
