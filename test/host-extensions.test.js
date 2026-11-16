import { afterEach, describe, expect, it, vi } from 'vitest';
import { listHostExtensions } from '../src/ui/host-bridge.js';

function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() { return data; },
    async text() { return typeof data === 'string' ? data : JSON.stringify(data); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listHostExtensions 事实分支', () => {
  it('discover + manifest 派生可导入 URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/csrf-token')) return mockResponse({}, 404);
      if (target.includes('/api/extensions/discover')) {
        return mockResponse([{ name: 'third-party/test', type: 'local' }]);
      }
      if (target.includes('/scripts/extensions/third-party/test/manifest.json')) {
        return mockResponse({
          display_name: 'Test',
          description: 'demo',
          version: '1.0.0',
          homePage: 'https://github.com/example/test',
        });
      }
      return mockResponse('not found', 404);
    }));

    const result = await listHostExtensions('st');
    expect(result).toMatchObject({ ok: true, total: 1, installable: 1 });
    expect(result.items[0]).toMatchObject({
      id: 'test',
      name: 'Test',
      url: 'https://github.com/example/test',
    });
  });

  it('宿主声明为不支持时直接返回，不发起请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await listHostExtensions('pt');
    expect(result).toEqual({ ok: false, reason: 'host-missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discover 空数组是真实空清单，不是不支持', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/csrf-token')) return mockResponse({}, 404);
      if (target.includes('/api/extensions/discover')) return mockResponse([]);
      return mockResponse('not found', 404);
    }));
    const result = await listHostExtensions('st');
    expect(result).toMatchObject({ ok: true, total: 0, installable: 0 });
  });

  it('端点全失败时 ok:false，不伪造空清单', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse('not found', 404)));
    const result = await listHostExtensions('st');
    expect(result.ok).toBe(false);
    expect(result.items).toBeUndefined();
  });
});
