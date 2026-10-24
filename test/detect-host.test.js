import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  detectHost, verifyHostPlatform, hostLayoutCode, hostSelectionCapability, describeHostFetchPlan,
} from '../src/ui/host-bridge.js';

// 模拟浏览器全局环境的可写快照
const g = globalThis;

function installWindow(props = {}) {
  g.window = {
    SillyTavern: props.windowSillyTavern,
    luker: undefined,
  };
  if (props.windowSillyTavern === undefined) delete g.window.SillyTavern;
  if (props.extensionsMenu) {
    g.document = {
      querySelector: (sel) => (sel === '#extensionsMenu' ? { id: 'extensionsMenu' } : null),
    };
  } else {
    g.document = { querySelector: () => null };
  }
}

function setGlobal(key, value) {
  if (value === undefined) {
    delete g[key];
  } else {
    g[key] = value;
  }
}

describe('detectHost 判定矩阵', () => {
  beforeEach(() => {
    setGlobal('SillyTavern', undefined);
    setGlobal('lukerContext', undefined);
    setGlobal('__TAURITAVERN__', undefined);
    setGlobal('__PURE_TAVERN__', undefined);
  });

  afterEach(() => {
    delete g.window;
    delete g.document;
    setGlobal('SillyTavern', undefined);
    setGlobal('lukerContext', undefined);
    setGlobal('__TAURITAVERN__', undefined);
    setGlobal('__PURE_TAVERN__', undefined);
  });

  it('Luker: 仅 lukerContext 存在 → luker', () => {
    setGlobal('lukerContext', { chat: [] });
    installWindow();
    const host = detectHost();
    expect(host.platform).toBe('luker');
    expect(host.isPlugin).toBe(true);
    expect(host.confidence).toBe('frontend');
  });

  it('Luker: lukerContext + SillyTavern 同时存在 → luker（顺序不可颠倒）', () => {
    setGlobal('lukerContext', { chat: [] });
    setGlobal('SillyTavern', { libs: {}, getContext: () => ({}) });
    installWindow();
    expect(detectHost().platform).toBe('luker');
  });

  it('ST: 仅 SillyTavern 存在 → st', () => {
    setGlobal('SillyTavern', { libs: {}, getContext: () => ({}) });
    installWindow();
    const host = detectHost();
    expect(host.platform).toBe('st');
    expect(host.isPlugin).toBe(true);
  });

  it('ST: 无全局对象但 #extensionsMenu 存在 → st', () => {
    installWindow({ extensionsMenu: true });
    expect(detectHost().platform).toBe('st');
  });

  it('standalone: 无任何宿主信号 → standalone', () => {
    installWindow();
    const host = detectHost();
    expect(host.platform).toBe('standalone');
    expect(host.isPlugin).toBe(false);
    expect(host.confidence).toBe('none');
  });

  it('lukerContext 惰性 getter 抛错时回退 SillyTavern → st', () => {
    Object.defineProperty(g, 'lukerContext', {
      configurable: true,
      get() {
        throw new Error("Cannot access 'chat' before initialization");
      },
    });
    setGlobal('SillyTavern', { libs: {}, getContext: () => ({}) });
    installWindow();
    const host = detectHost();
    expect(host.platform).toBe('st');

    // 清理 getter
    delete g.lukerContext;
    setGlobal('lukerContext', undefined);
  });

  // ── R-A4（2026-10-24）：TT / PT 接入注册表 ──────────────────────────────

  it('TauriTavern: window.__TAURITAVERN__ 存在 → tt', () => {
    setGlobal('__TAURITAVERN__', { tauri: true });
    installWindow();
    const host = detectHost();
    expect(host.platform).toBe('tt');
    expect(host.isPlugin).toBe(true);
    expect(host.confidence).toBe('frontend');
  });

  it('PureTavern: globalThis.__PURE_TAVERN__ 存在 → pt', () => {
    setGlobal('__PURE_TAVERN__', { pure: true });
    installWindow();
    const host = detectHost();
    expect(host.platform).toBe('pt');
    expect(host.isPlugin).toBe(true);
  });

  it('PT 同时暴露 SillyTavern 全局（ST 兼容）→ 仍 pt（注册表顺序优先于 st）', () => {
    setGlobal('__PURE_TAVERN__', { pure: true });
    setGlobal('SillyTavern', { libs: {}, getContext: () => ({}) });
    installWindow();
    expect(detectHost().platform).toBe('pt');
  });

  it('TT 同时暴露 __PURE_TAVERN__（跨族冲突）→ 注册表顺序：tt 先于 pt', () => {
    setGlobal('__TAURITAVERN__', { tauri: true });
    setGlobal('__PURE_TAVERN__', { pure: true });
    installWindow();
    expect(detectHost().platform).toBe('tt');
  });
});

describe('verifyHostPlatform 服务端校验', () => {
  beforeEach(() => {
    setGlobal('lukerContext', undefined);
    setGlobal('SillyTavern', undefined);
  });

  afterEach(() => {
    setGlobal('lukerContext', undefined);
    setGlobal('SillyTavern', undefined);
  });

  function mockFetch(payload, status = 200) {
    g.fetch = async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    });
  }

  it('Luker /version 形状 (agent=Luker:...) → luker', async () => {
    mockFetch({
      agent: 'Luker:2.7.0:Cohee#1207',
      compatAgent: 'Luker:1.18.0:Cohee#1207',
      stCompatVersion: '1.18.0',
      pkgVersion: '2.7.0',
    });
    const result = await verifyHostPlatform('st'); // 前端误判为 st
    expect(result.platform).toBe('luker');
    expect(result.verified).toBe(true);
  });

  it('stCompatVersion 字段存在即 Luker（ST 永远不会有）', async () => {
    mockFetch({ pkgVersion: '2.9.0', stCompatVersion: '1.19.0' });
    const result = await verifyHostPlatform('luker');
    expect(result.platform).toBe('luker');
  });

  it('ST 老形状 ({version} 单字段) → st', async () => {
    mockFetch({ version: '1.18.0' });
    const result = await verifyHostPlatform('st');
    expect(result.platform).toBe('st');
    expect(result.version).toBe('1.18.0');
  });

  it('agent=SillyTavern:... → st', async () => {
    mockFetch({ agent: 'SillyTavern:1.18.0:Cohee#1207', version: '1.18.0' });
    const result = await verifyHostPlatform('st');
    expect(result.platform).toBe('st');
  });

  it('端点不可达 → 保留前端判定，verified=false', async () => {
    g.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const result = await verifyHostPlatform('luker');
    expect(result.platform).toBe('luker');
    expect(result.verified).toBe(false);
  });

  it('端点 404 → 保留前端判定', async () => {
    mockFetch({ error: 'Not Found' }, 404);
    const result = await verifyHostPlatform('st');
    expect(result.platform).toBe('st');
    expect(result.verified).toBe(false);
  });

  it('前端与端点不一致时以服务端为准（st 判定被纠正为 luker）', async () => {
    mockFetch({ agent: 'Luker:2.7.0:Cohee#1207', stCompatVersion: '1.18.0', pkgVersion: '2.7.0' });
    const result = await verifyHostPlatform('st');
    expect(result.platform).toBe('luker');
  });

  // ── R-A4（2026-10-24）：TT / PT 二级复核 ──────────────────────────────

  it('agent 含 TauriTavern → tt（即便串里也带 ST 兼容字样，特征子串优先判）', async () => {
    mockFetch({ agent: 'SillyTavern:1.19.0:TauriTavern', version: '1.19.0' });
    const result = await verifyHostPlatform('st');
    expect(result.platform).toBe('tt');
    expect(result.verified).toBe(true);
  });

  it('agent 含 PureTavern → pt', async () => {
    mockFetch({ agent: 'SillyTavern:1.19.0:PureTavern', version: '1.19.0' });
    const result = await verifyHostPlatform('pt');
    expect(result.platform).toBe('pt');
  });

  it('响应形如宿主但映射不上任何注册项 → unknown（未登记宿主兜底，不冒认 standalone）', async () => {
    mockFetch({ agent: 'MysteryTavern:9.9.9', something: 1 });
    const result = await verifyHostPlatform('st');
    expect(result.platform).toBe('unknown');
    expect(result.verified).toBe(true);
  });
});

describe('hostLayoutCode 宿主平台→转换器布局代码映射', () => {
  it('luker → l (Luker 清单布局代码)', () => {
    expect(hostLayoutCode('luker')).toBe('l');
  });

  it('st → st (ST 摊平布局代码，同名直通)', () => {
    expect(hostLayoutCode('st')).toBe('st');
  });

  it('standalone 原样透传 (调用方负责兜底)', () => {
    expect(hostLayoutCode('standalone')).toBe('standalone');
  });

  it('未知值原样透传 (不抛错，纯映射)', () => {
    expect(hostLayoutCode('tt')).toBe('tt');
    expect(hostLayoutCode('pt')).toBe('pt');
    expect(hostLayoutCode('')).toBe('');
  });
});

describe('hostSelectionCapability 宿主 selection 能力（显式声明表，R4.1）', () => {
  it('luker 支持透传勾选', () => {
    const cap = hostSelectionCapability('luker');
    expect(cap.supported).toBe(true);
    expect(cap.known).toBe(true);
    expect(cap.reason).toBe('宿主透传勾选');
  });

  it('st 不支持（端点仅全量 glob 导出，须插件内过滤）', () => {
    const cap = hostSelectionCapability('st');
    expect(cap.supported).toBe(false);
    expect(cap.known).toBe(true);
    expect(cap.reason).toBe('全量导出后插件内过滤');
  });

  it('tt / pt 未取证 → 走保守路径且 known 为 true（已声明为不支持）', () => {
    for (const platform of ['tt', 'pt']) {
      const cap = hostSelectionCapability(platform);
      expect(cap.supported).toBe(false);
      expect(cap.known).toBe(true);
    }
  });

  it('未列出的宿主 → supported false 且 known false（区分「确认不支持」与「未取证」）', () => {
    for (const platform of ['standalone', 'garbage', '', undefined, null]) {
      const cap = hostSelectionCapability(platform);
      expect(cap.supported).toBe(false);
      expect(cap.known).toBe(false);
    }
  });

  it('未知宿主必须走保守路径：结果与 ST 一致（全量 + 插件内过滤），不得乐观放行', () => {
    const unknown = hostSelectionCapability('some-future-host');
    const st = hostSelectionCapability('st');
    expect(unknown.supported).toBe(st.supported);
    expect(unknown.reason).toBe(st.reason);
  });

  it('reason 是可直接展示的状态读数（非空字符串）', () => {
    for (const platform of ['st', 'luker', 'tt', 'pt', 'standalone']) {
      expect(typeof hostSelectionCapability(platform).reason).toBe('string');
      expect(hostSelectionCapability(platform).reason.length).toBeGreaterThan(0);
    }
  });
});

describe('describeHostFetchPlan 拉取前预览（R-A5 纯函数）', () => {
  const sel = (n) => Object.fromEntries(
    [...Array(13).keys()].map((i) => [`k${i}`, i < n]),
  );

  it('Luker（支持透传）：展示用户勾选数 + 透传读数', () => {
    expect(describeHostFetchPlan('luker', sel(8))).toBe('将拉取 8 类目 · 宿主透传勾选');
  });

  it('ST（不支持透传）：按端点实际行为展示全量数，不展示用户勾选数', () => {
    expect(describeHostFetchPlan('st', sel(3))).toBe('将拉取 10 类目 · 全量导出后插件内过滤');
  });

  it('未登记宿主：走保守路径读数（与 ST 同形，不乐观放行）', () => {
    const text = describeHostFetchPlan('some-future-host', sel(5));
    expect(text).toContain('全量导出后插件内过滤');
  });

  it('文案是状态读数：无括号、无分号、无冒号', () => {
    for (const text of [
      describeHostFetchPlan('luker', sel(8)),
      describeHostFetchPlan('st', sel(3)),
    ]) {
      expect(text).not.toMatch(/[（）()；;：:]/);
    }
  });
});
