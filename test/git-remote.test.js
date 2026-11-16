import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from '../src/core/git-url.js';
import { createGitRemote } from '../src/ui/git-remote.js';

const repo = (u) => parseRepoUrl(u);

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers });
    return handler(url, init);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('Git 远端：凭据覆盖所有平台链接', () => {
  it('GitHub 私有文件走内容 API（raw 域名收不到 Authorization）', async () => {
    const f = mockFetch(() => new Response('{"name":"x"}', { status: 200 }));
    const remote = createGitRemote({ fetchImpl: f });
    const res = await remote.rawFile(repo('https://github.com/o/r'), 'dev', 'manifest.json', {
      site: 'github', username: 'u', secret: 't',
    });
    expect(res).toMatchObject({ ok: true, via: 'api' });
    expect(f.calls[0].url).toBe('https://api.github.com/repos/o/r/contents/manifest.json?ref=dev');
    expect(f.calls[0].headers.Authorization).toBe('Bearer t');
    expect(f.calls[0].headers.Accept).toBe('application/vnd.github.raw');
  });

  it('Gitee 读文件保留 access_token 查询参数（此前被丢弃）', async () => {
    const f = mockFetch(() => new Response('ok', { status: 200 }));
    const remote = createGitRemote({ fetchImpl: f });
    const res = await remote.remoteManifest(repo('https://gitee.com/o/r'), 'dev', { site: 'gitee', secret: 't' });
    expect(res.ok).toBe(true);
    expect(f.calls[0].url).toBe('https://gitee.com/o/r/raw/dev/manifest.json?access_token=t');
  });

  it('自建主机按账号站点类型选端点（GHE → /api/v3）', async () => {
    const f = mockFetch(() => new Response('[]', { status: 200 }));
    const remote = createGitRemote({ fetchImpl: f });
    await remote.listBranches(repo('https://ghe.example.com/o/r'), { site: 'github', secret: 't' });
    expect(f.calls[0].url).toContain('https://ghe.example.com/api/v3/repos/o/r/branches');
  });

  it('公有仓不带凭据仍优先 raw，raw 不通时回落内容 API', async () => {
    /* 实测环境：raw.githubusercontent.com 被连接重置，api.github.com 正常。 */
    const f = mockFetch((url) => (
      url.includes('raw.githubusercontent.com')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : new Response('from-api', { status: 200 })
    ));
    const remote = createGitRemote({ fetchImpl: f });
    const res = await remote.rawFile(repo('https://github.com/o/r'), 'main', 'manifest.json', null);
    expect(res).toMatchObject({ ok: true, via: 'api', text: 'from-api' });
    expect(f.calls.map((c) => c.url.split('/')[2])).toEqual(['raw.githubusercontent.com', 'api.github.com']);
  });

  it('公有仓 raw 可达时只发一次请求（先 raw，省 API 配额）', async () => {
    const f = mockFetch(() => new Response('v1', { status: 200 }));
    const remote = createGitRemote({ fetchImpl: f });
    const res = await remote.remoteManifest(repo('https://github.com/o/r'), 'main', null);
    expect(res).toMatchObject({ ok: true, via: 'raw', text: 'v1' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('https://raw.githubusercontent.com/o/r/main/manifest.json');
  });

  it('内容 API 失败后回落到 raw', async () => {
    const f = mockFetch((url) => (url.includes('/contents/')
      ? new Response('', { status: 404 })
      : new Response('raw-text', { status: 200 })));
    const remote = createGitRemote({ fetchImpl: f });
    const res = await remote.rawFile(repo('https://github.com/o/r'), 'dev', 'manifest.json', {
      site: 'github', secret: 't',
    });
    expect(res).toMatchObject({ ok: true, via: 'raw', text: 'raw-text' });
  });

  it('配置的 CORS 代理对 Git 请求生效', async () => {
    const f = mockFetch(() => new Response('[]', { status: 200 }));
    const remote = createGitRemote({ fetchImpl: f, getProxyUrl: () => 'https://proxy.example/?url=' });
    await remote.listBranches(repo('https://github.com/o/r'));
    expect(f.calls[0].url).toBe('https://proxy.example/?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fo%2Fr%2Fbranches%3Fper_page%3D100');
  });
});
