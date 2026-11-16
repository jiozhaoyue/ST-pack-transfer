import { describe, it, expect } from 'vitest';
import { parseRepoUrl } from '../src/core/git-url.js';
import {
  branchesEndpoint, repoInfoEndpoint, commitsEndpoint, authHeaders, withTokenQuery,
  normalizeBranches, normalizeRepoInfo, normalizeLatestCommit, remoteManifestUrl,
  compareVersions, userEndpoint, contentEndpoint, contentAcceptHeader, resolveSite, githubRawUrl,
} from '../src/core/git-site.js';

const repo = (u) => parseRepoUrl(u);

describe('端点构造', () => {
  it('GitHub', () => {
    const r = repo('https://github.com/o/r');
    expect(branchesEndpoint(r)).toContain('api.github.com/repos/o/r/branches');
    expect(repoInfoEndpoint(r)).toBe('https://api.github.com/repos/o/r');
    expect(commitsEndpoint(r, 'dev')).toContain('sha=dev');
    expect(userEndpoint('github', 'github.com')).toBe('https://api.github.com/user');
  });

  it('GitLab（含子组）', () => {
    const r = repo('https://gitlab.com/group/sub/repo');
    expect(branchesEndpoint(r)).toContain('projects/group%2Fsub%2Frepo/repository/branches');
    expect(repoInfoEndpoint(r)).toContain('projects/group%2Fsub%2Frepo');
  });

  it('Gitee 与自建 Gitea', () => {
    const g = repo('https://gitee.com/o/r');
    expect(branchesEndpoint(g)).toContain('gitee.com/api/v5/repos/o/r/branches');
    const s = repo('https://git.example.com/o/r');
    expect(branchesEndpoint(s)).toBe('https://git.example.com/api/v1/repos/o/r/branches');
  });

  it('自建主机按账号站点类型解释（GitHub Enterprise → /api/v3）', () => {
    const s = repo('https://ghe.example.com/o/r');
    expect(s.site).toBe('custom');
    const asGhe = resolveSite(s, { site: 'github', secret: 't' });
    expect(asGhe.site).toBe('github');
    expect(branchesEndpoint(asGhe)).toBe('https://ghe.example.com/api/v3/repos/o/r/branches?per_page=100');
    expect(userEndpoint('github', 'ghe.example.com')).toBe('https://ghe.example.com/api/v3/user');
    expect(githubRawUrl(asGhe, 'dev', 'manifest.json')).toBe('https://ghe.example.com/o/r/raw/dev/manifest.json');
    /* 无账号时保持 custom（按 Gitea 形态），不猜。 */
    expect(resolveSite(s, null).site).toBe('custom');
    /* 官方域名不受账号影响。 */
    expect(resolveSite(repo('https://gitlab.com/o/r'), { site: 'gitea' }).site).toBe('gitlab');
  });

  it('鉴权内容端点：各站点都能读到私有文件', () => {
    const gh = repo('https://github.com/o/r');
    expect(contentEndpoint(gh, 'dev', 'manifest.json'))
      .toBe('https://api.github.com/repos/o/r/contents/manifest.json?ref=dev');
    expect(contentAcceptHeader(gh)).toBe('application/vnd.github.raw');
    const gl = repo('https://gitlab.com/g/s/r');
    expect(contentEndpoint(gl, 'dev', 'manifest.json'))
      .toBe('https://gitlab.com/api/v4/projects/g%2Fs%2Fr/repository/files/manifest.json/raw?ref=dev');
    const gitea = repo('https://git.example.com/o/r');
    expect(contentEndpoint(gitea, 'dev', 'manifest.json'))
      .toBe('https://git.example.com/api/v1/repos/o/r/raw/manifest.json?ref=dev');
    /* Gitee 走 raw + access_token，不转内容 API。 */
    expect(contentEndpoint(repo('https://gitee.com/o/r'), 'dev', 'manifest.json')).toBeNull();
  });
});

describe('鉴权', () => {
  it('Bearer / token / Gitee query', () => {
    expect(authHeaders('github', 't')).toEqual({ Authorization: 'Bearer t' });
    expect(authHeaders('gitea', 't')).toEqual({ Authorization: 'token t' });
    expect(authHeaders('gitee', 't')).toEqual({});
    expect(withTokenQuery('gitee', 'https://gitee.com/api/x', 't')).toBe('https://gitee.com/api/x?access_token=t');
    expect(withTokenQuery('github', 'https://api.github.com/x', 't')).toBe('https://api.github.com/x');
  });
});

describe('响应归一', () => {
  it('分支', () => {
    expect(normalizeBranches([{ name: 'main' }, { name: 'dev' }, { name: 'main' }])).toEqual(['dev', 'main']);
  });
  it('仓库信息', () => {
    expect(normalizeRepoInfo({ description: 'x', default_branch: 'main', stargazers_count: 3, pushed_at: 'T', private: true }))
      .toEqual({ description: 'x', defaultBranch: 'main', stars: 3, pushedAt: 'T', visibility: 'private' });
    expect(normalizeRepoInfo(null)).toEqual({ description: '', defaultBranch: '', stars: null, pushedAt: '', visibility: '' });
  });
  it('最新提交', () => {
    expect(normalizeLatestCommit([{ sha: 'abcdef1234567890', commit: { committer: { date: 'D' } } }]))
      .toEqual({ sha: 'abcdef123456', date: 'D' });
    expect(normalizeLatestCommit(null)).toEqual({ sha: '', date: '' });
  });
});

describe('远端 manifest 与版本比较', () => {
  it('各站点 raw 地址', () => {
    expect(remoteManifestUrl(repo('https://github.com/o/r'), 'dev')).toBe('https://raw.githubusercontent.com/o/r/dev/manifest.json');
    expect(remoteManifestUrl(repo('https://gitlab.com/o/r'), 'dev')).toBe('https://gitlab.com/o/r/-/raw/dev/manifest.json');
    expect(remoteManifestUrl(repo('https://gitee.com/o/r'), 'dev')).toBe('https://gitee.com/o/r/raw/dev/manifest.json');
    expect(remoteManifestUrl(repo('https://git.example.com/o/r'), 'dev')).toBe('https://git.example.com/o/r/raw/branch/dev/manifest.json');
  });
  it('compareVersions', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('v1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });
});
