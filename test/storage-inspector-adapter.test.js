import { describe, expect, it, afterEach, vi } from 'vitest';
import { hasStorageInspector } from '../src/ui/host-bridge.js';

/**
 * 宿主存储面板适配器契约（R1）。
 *
 * 背景：Luker 的 `public/scripts/storage-inspector.js` 没有 window 挂载、也没有放进
 * `getContext()`，只能经**宿主根绝对路径** `/scripts/storage-inspector.js` 动态 import。
 * 该路径在本仓的 Node 测试环境里必然不可解析——这恰好是天然可用的「不可用」场景。
 *
 * 契约：任何失败路径都必须**返回 false 且不抛出**，让调用方安全地保持按钮 hidden。
 *
 * 注意：适配器内部有**模块级**单次加载缓存，故降级用例一律用 `vi.resetModules()` +
 * 动态导入取全新模块状态，避免用例间互相污染。
 */

const g = globalThis;

function setGlobal(key, value) {
  if (value === undefined) delete g[key];
  else g[key] = value;
}

/** 取一份全新的 host-bridge 模块（重置模块级缓存） */
async function freshBridge() {
  vi.resetModules();
  return import('../src/ui/host-bridge.js');
}

describe('hasStorageInspector 形状判定（纯函数）', () => {
  it('导出确实是函数才判定可用', () => {
    expect(hasStorageInspector({ openStorageInspector: () => {} })).toBe(true);
    expect(hasStorageInspector({ openStorageInspector: async () => {} })).toBe(true);
  });

  it('模块缺失 / 空对象 / 导出非函数一律不可用', () => {
    expect(hasStorageInspector(null)).toBe(false);
    expect(hasStorageInspector(undefined)).toBe(false);
    expect(hasStorageInspector({})).toBe(false);
    expect(hasStorageInspector({ openStorageInspector: 'not-a-function' })).toBe(false);
    expect(hasStorageInspector({ openStorageInspector: null })).toBe(false);
  });

  it('仅有 mountStorageInspector / createStorageInspector 不足以放行（必须能唤起面板）', () => {
    expect(hasStorageInspector({ mountStorageInspector: () => {}, createStorageInspector: () => {} }))
      .toBe(false);
  });
});

describe('宿主存储审查能力声明（不按平台猜测）', () => {
  it('只有 Luker 声明支持，其余宿主与独立态一律不支持', async () => {
    const { hostStorageInspectCapability } = await freshBridge();
    expect(hostStorageInspectCapability('luker')).toEqual({ supported: true, known: true });
    for (const platform of ['st', 'tt', 'pt', 'standalone', undefined, '']) {
      expect(hostStorageInspectCapability(platform)).toEqual({ supported: false, known: true });
    }
  });
});

describe('fetchHostStorageInspect · 模块不可用时回落同源端点', () => {
  afterEach(() => {
    setGlobal('window', undefined);
    setGlobal('document', undefined);
    setGlobal('fetch', undefined);
    vi.restoreAllMocks();
  });

  it('POST /api/users/storage/inspect，body 带 path，响应原样返回', async () => {
    setGlobal('window', undefined);
    setGlobal('document', undefined);
    const payload = {
      path: ['chats'], breadcrumbs: [{ label: 'Storage', path: [] }], quota: { usedBytes: 1, quotaBytes: 2 }, entries: [], isLeaf: true,
    };
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('csrf')) return { ok: true, status: 200, json: async () => ({ token: 't' }) };
      return { ok: true, status: 200, json: async () => payload };
    });
    setGlobal('fetch', fetchMock);

    const { fetchHostStorageInspect } = await freshBridge();
    const res = await fetchHostStorageInspect(['chats']);
    expect(res).toEqual(payload);

    const inspectCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/users/storage/inspect'));
    expect(inspectCall).toBeTruthy();
    const [url, init] = inspectCall;
    expect(url).toBe('/api/users/storage/inspect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ path: ['chats'] });
  });

  it('端点返回 400 时抛出宿主错误码与原因', async () => {
    setGlobal('window', undefined);
    setGlobal('document', undefined);
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('csrf')) return { ok: true, status: 200, json: async () => ({ token: 't' }) };
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { code: 'E_INVALID_PATH', message: 'nope' } }),
      };
    });
    setGlobal('fetch', fetchMock);

    const { fetchHostStorageInspect } = await freshBridge();
    await expect(fetchHostStorageInspect(['bogus'])).rejects.toMatchObject({
      code: 'E_INVALID_PATH',
      message: 'nope',
      status: 400,
    });
  });
});

describe('存储面板适配器的降级路径（不得抛出，一律 false）', () => {
  afterEach(() => {
    setGlobal('window', undefined);
    setGlobal('document', undefined);
    vi.restoreAllMocks();
  });

  it('独立态 / Node（无 window）→ 直接 false，且不尝试加载（无告警）', async () => {
    setGlobal('window', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isStorageInspectorAvailable, openStorageInspector } = await freshBridge();

    await expect(isStorageInspectorAvailable()).resolves.toBe(false);
    await expect(openStorageInspector()).resolves.toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('有 window 但宿主模块不可解析（404 / 非宿主环境）→ false 且不抛出', async () => {
    setGlobal('window', {});
    setGlobal('document', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isStorageInspectorAvailable, openStorageInspector } = await freshBridge();

    await expect(isStorageInspectorAvailable()).resolves.toBe(false);
    await expect(openStorageInspector()).resolves.toBe(false);
    // 加载失败必须留下可诊断的告警（否则静默降级会无从排查）
    expect(warn).toHaveBeenCalled();
  });

  it('模块加载只尝试一次（失败结果被缓存，不反复重试）', async () => {
    setGlobal('window', {});
    setGlobal('document', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isStorageInspectorAvailable, openStorageInspector } = await freshBridge();

    await isStorageInspectorAvailable();
    await isStorageInspectorAvailable();
    await openStorageInspector();
    await isStorageInspectorAvailable();

    // 四次调用只对应一次真实加载尝试
    expect(warn.mock.calls.length).toBe(1);
  });
});
