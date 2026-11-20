import { describe, expect, it } from 'vitest';
import {
  classifyDavError,
  createWebdavClient,
  encodeDavPath,
  joinDavUrl,
  parseOptionsAllow,
  parsePropfindXml,
} from '../src/core/webdav-client.js';

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return handler(url, init, calls.length - 1);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('webdav-client 协议与降级', () => {
  it('拼接与编码路径', () => {
    expect(joinDavUrl('https://dav.example.com/base/', 'a/b c.zip'))
      .toBe('https://dav.example.com/base/a/b%20c.zip');
    expect(encodeDavPath('a/b c')).toBe('a/b%20c');
  });

  it('解析 Allow 头', () => {
    expect([...parseOptionsAllow('OPTIONS, GET, PUT')]).toEqual(['OPTIONS', 'GET', 'PUT']);
  });

  it('解析 PROPFIND 207 的两种命名空间形状', () => {
    const xml = `<d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/dav/a.zip</d:href><d:propstat><d:prop>
        <d:getcontentlength>10</d:getcontentlength><d:getlastmodified>Mon</d:getlastmodified>
      </d:prop></d:propstat></d:response>
      <response><href>/dav/dir/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>
    </d:multistatus>`;
    const items = parsePropfindXml(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'a.zip', size: 10, isDir: false });
    expect(items[1]).toMatchObject({ name: 'dir', isDir: true });
  });

  it('OPTIONS 405 时降级为可用，不整体失败', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 405 })),
    });
    const probe = await client.probe();
    expect(probe).toMatchObject({ ok: true, degraded: true, canRead: true, canWrite: true, canList: true });
  });

  it('OPTIONS 200 时给出 Allow，但写入能力不按 Allow 判死', async () => {
    /* 2026-11-12 真机取证：Apache 的 Allow 不含 PUT/MKCOL，而 PUT/MKCOL 实际成功。
       `Allow` 只能当参考，能力由真实请求结果决定。 */
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 200, headers: { Allow: 'OPTIONS, GET, HEAD' } })),
    });
    const probe = await client.probe();
    expect(probe).toMatchObject({ ok: true, canRead: true, canWrite: true, canList: true, canMakeCollection: true });
    expect(probe.declared).toMatchObject({ read: true, write: false, list: false });
  });

  it('列表过滤自身集条目', async () => {
    const xml = `<d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/dav/a.zip</d:href><d:propstat><d:prop><d:getcontentlength>3</d:getcontentlength></d:prop></d:propstat></d:response>
    </d:multistatus>`;
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com/dav' },
      fetchImpl: mockFetch(() => response(xml, { status: 207 })),
    });
    const result = await client.list();
    expect(result.ok).toBe(true);
    expect(result.items.map((i) => i.name)).toEqual(['a.zip']);
  });

  it('自检六步全通过', async () => {
    const stored = { text: '' };
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch((url, init) => {
        const method = init.method;
        if (method === 'OPTIONS') return response('', { status: 200 });
        if (method === 'PROPFIND') return response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 });
        if (method === 'MKCOL') return response('', { status: 201 });
        if (method === 'PUT') { stored.text = new TextDecoder().decode(init.body); return response('', { status: 201 }); }
        if (method === 'GET') return response(stored.text, { status: 200 });
        if (method === 'DELETE') return new Response(null, { status: 204 });
        return response('', { status: 500 });
      }),
    });
    const result = await client.selfTest();
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.step)).toEqual(['OPTIONS', 'PROPFIND', 'MKCOL', 'PUT', 'GET', 'DELETE']);
    expect(result.steps.every((s) => s.ok)).toBe(true);
  });

  it('自检在写入失败处停下并如实报因', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch((url, init) => {
        const method = init.method;
        if (method === 'OPTIONS') return response('', { status: 200 });
        if (method === 'PROPFIND') return response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 });
        if (method === 'MKCOL') return response('', { status: 201 });
        if (method === 'PUT') return response('', { status: 403 });
        return response('', { status: 204 });
      }),
    });
    const result = await client.selfTest();
    expect(result).toMatchObject({ ok: false, failedStep: 'PUT' });
    expect(result.steps.at(-1)).toMatchObject({ step: 'PUT', status: 403, ok: false });
  });

  it('PROPFIND 被禁不影响结论（参考项），仅标记 advisoryFailed', async () => {
    const stored = { text: '' };
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch((url, init) => {
        const method = init.method;
        if (method === 'OPTIONS') return response('', { status: 200 });
        if (method === 'PROPFIND') return response('', { status: 405 });
        if (method === 'MKCOL') return response('', { status: 201 });
        if (method === 'PUT') { stored.text = new TextDecoder().decode(init.body); return response('', { status: 201 }); }
        if (method === 'GET') return response(stored.text, { status: 200 });
        if (method === 'DELETE') return new Response(null, { status: 204 });
        return response('', { status: 500 });
      }),
    });
    const result = await client.selfTest();
    expect(result).toMatchObject({ ok: true, advisoryFailed: 1 });
    expect(result.steps.find((s) => s.step === 'PROPFIND')).toMatchObject({ ok: false, advisory: true, status: 405 });
  });

  it('自检按目录前缀落点（写入位置与正式上传一致）', async () => {
    const calls = [];
    const stored = { text: '' };
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch((url, init) => {
        calls.push({ url, method: init.method });
        if (init.method === 'OPTIONS') return response('', { status: 200 });
        if (init.method === 'PROPFIND') return response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 });
        if (init.method === 'MKCOL') return response('', { status: 201 });
        if (init.method === 'PUT') { stored.text = new TextDecoder().decode(init.body); return response('', { status: 201 }); }
        if (init.method === 'GET') return response(stored.text, { status: 200 });
        if (init.method === 'DELETE') return new Response(null, { status: 204 });
        return response('', { status: 500 });
      }),
    });
    const result = await client.selfTest({ prefix: 'packs/prod' });
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.method === 'PROPFIND' && c.url.endsWith('/packs/prod'))).toBe(true);
    expect(calls.some((c) => c.method === 'MKCOL' && c.url.endsWith('/packs/prod/.stpt-selftest'))).toBe(true);
    expect(calls.some((c) => c.method === 'PUT' && c.url.includes('/packs/prod/.stpt-selftest/.probe-'))).toBe(true);
  });

  it('数据面超时独立于控制面（慢上行不吃 20 秒的超时）', async () => {
    /* 尊重 AbortSignal 的慢响应：用于验证两套超时各自生效。 */
    const slowFetch = async (url, init = {}) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 60);
        if (init.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
      return response('', { status: 201 });
    };
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: slowFetch,
      timeoutMs: 10,
      transferTimeoutMs: 500,
    });
    expect(await client.putObject('a.zip', new Uint8Array([1]))).toMatchObject({ ok: true });
    /* 控制类请求仍按 10ms 判定超时 */
    expect(await client.headObject('a.zip')).toMatchObject({ ok: false, code: 'timeout' });
  });

  it('代理地址生效于实际请求', async () => {
    const fetchImpl = mockFetch(() => response('', { status: 200 }));
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl,
      proxyUrl: 'https://proxy.example/?url=',
    });
    await client.headObject('a.zip');
    expect(fetchImpl.calls[0].url).toBe('https://proxy.example/?url=https%3A%2F%2Fdav.example.com%2Fa.zip');
  });

  it('PUT 405 明确报「服务器禁止写入」分类', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 405 })),
    });
    expect(await client.putObject('a.zip', new Uint8Array([1]))).toMatchObject({
      ok: false,
      status: 405,
      code: 'method-not-allowed',
    });
  });

  it('MKCOL 405/409 视为已存在，不阻断', async () => {
    const statuses = [405, 409];
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: statuses.shift() })),
    });
    const result = await client.ensureCollection('a/b');
    expect(result.ok).toBe(true);
    expect(result.results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('MKCOL 500 直接失败并带路径', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 500 })),
    });
    const result = await client.ensureCollection('a/b');
    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({ ok: false, path: 'a' });
  });

  it('GET Range 206 返回字节', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch((url, init) => {
        expect(init.headers.Range).toBe('bytes=4-7');
        return response(new Uint8Array([4, 5, 6, 7]), { status: 206 });
      }),
    });
    const result = await client.getObject('a.zip', { range: 'bytes=4-7' });
    expect(result.ok).toBe(true);
    expect([...result.bytes]).toEqual([4, 5, 6, 7]);
  });

  it('PROPFIND 405 返回 list-not-supported，而不是抛错', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 405 })),
    });
    expect(await client.list()).toMatchObject({ ok: false, code: 'list-not-supported' });
  });

  it('401 与 CORS 分别分类', async () => {
    const authClient = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 401 })),
    });
    expect(await authClient.putObject('a', new Uint8Array())).toMatchObject({ code: 'auth' });

    const corsClient = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => { throw new TypeError('Failed to fetch'); }),
    });
    expect(await corsClient.putObject('a', new Uint8Array())).toMatchObject({ code: 'cors-blocked' });
    expect(classifyDavError(0, new Error('Failed to fetch'))).toBe('cors-blocked');
  });

  it('PUT 423 返回 locked 分类，不抛未分类异常、不整体失败', async () => {
    expect(classifyDavError(423)).toBe('locked');
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', { status: 423 })),
    });
    // request() 内 try/catch：423 走分类返回而非抛异常；
    // await 能正常解析即证明「不抛未分类异常、不整体失败」。
    const result = await client.putObject('a.zip', new Uint8Array([1]));
    expect(result).toMatchObject({ ok: false, status: 423, code: 'locked' });
    expect(result.message).toBe('http-423');
  });

  it('HEAD 解析大小 / ETag / 修改时间', async () => {
    const client = createWebdavClient({
      config: { baseUrl: 'https://dav.example.com' },
      fetchImpl: mockFetch(() => response('', {
        status: 200,
        headers: { 'content-length': '12', etag: '"abc"', 'last-modified': 'Mon' },
      })),
    });
    expect(await client.headObject('a.zip')).toMatchObject({ ok: true, size: 12, etag: 'abc', lastModified: 'Mon' });
  });
});
