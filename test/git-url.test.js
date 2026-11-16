import { describe, it, expect } from 'vitest';
import {
  parseRepoUrl, buildAuthedUrl, refineRefWithBranches, scrubUrlCredentials, repoKey, maskSecret,
} from '../src/core/git-url.js';

describe('parseRepoUrl', () => {
  it('短写与裸 owner/repo', () => {
    expect(parseRepoUrl('owner/repo').cloneUrl).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('gh:owner/repo').cloneUrl).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('gitee:owner/repo').host).toBe('gitee.com');
    expect(parseRepoUrl('gitlab:owner/repo').host).toBe('gitlab.com');
    expect(parseRepoUrl('github.com/owner/repo').cloneUrl).toBe('https://github.com/owner/repo');
  });

  it('仓库页 /tree/<ref> 解析成根 + ref（不能用最后一段做目录名）', () => {
    const p = parseRepoUrl('https://github.com/owner/repo/tree/main');
    expect(p.ok).toBe(true);
    expect(p.cloneUrl).toBe('https://github.com/owner/repo');
    expect(p.ref).toBe('main');
    expect(p.refKind).toBe('ref');
  });

  it('blob / commit / releases / tags', () => {
    expect(parseRepoUrl('https://github.com/o/r/blob/dev/src/a.js').ref).toBe('dev');
    const c = parseRepoUrl('https://github.com/o/r/commit/abcdef1');
    expect(c.ref).toBe('abcdef1');
    expect(c.refKind).toBe('commit');
    expect(parseRepoUrl('https://github.com/o/r/releases/tag/v1.2.3').ref).toBe('v1.2.3');
    expect(parseRepoUrl('https://github.com/o/r/tags/v1.2.3').ref).toBe('v1.2.3');
  });

  it('GitLab 子组与 /-/tree', () => {
    const p = parseRepoUrl('https://gitlab.com/group/sub/repo/-/tree/dev');
    expect(p.owner).toBe('group/sub');
    expect(p.repo).toBe('repo');
    expect(p.ref).toBe('dev');
    expect(p.cloneUrl).toBe('https://gitlab.com/group/sub/repo');
  });

  it('去掉 .git / query / hash 与用户信息', () => {
    const p = parseRepoUrl('https://user:token@github.com/o/r.git?x=1#y');
    expect(p.cloneUrl).toBe('https://github.com/o/r');
    expect(p.hadCredentials).toBe(true);
  });

  it('系统 git 形态与非法输入', () => {
    expect(parseRepoUrl('git@github.com:o/r.git').error).toBe('system-git');
    expect(parseRepoUrl('ssh://git@host/o/r').error).toBe('system-git');
    expect(parseRepoUrl('https://github.com/onlyowner').error).toBe('not-a-repo');
    expect(parseRepoUrl('').error).toBe('empty');
  });
});

describe('refineRefWithBranches', () => {
  it('分支名含斜杠时取最长匹配', () => {
    expect(refineRefWithBranches('feature', ['main', 'feature/x'])).toBe('feature');
    expect(refineRefWithBranches('feature/x', ['main', 'feature', 'feature/x'])).toBe('feature/x');
  });
});

describe('buildAuthedUrl', () => {
  it('token 作为用户名', () => {
    const r = buildAuthedUrl('https://github.com/o/r', { kind: 'token', secret: 'ghp_abc' });
    expect(r.authed).toBe(true);
    expect(r.url).toContain('ghp_abc@github.com');
  });
  it('账密', () => {
    const r = buildAuthedUrl('https://git.example.com/o/r', { kind: 'basic', username: 'u', secret: 'p' });
    expect(r.url).toContain('u:p@git.example.com');
  });
  it('GitLab 的 token-only 用 oauth2 用户名（否则克隆 401）', () => {
    const r = buildAuthedUrl('https://gitlab.com/o/r', { kind: 'token', site: 'gitlab', secret: 'glpat-x' });
    expect(r.authed).toBe(true);
    expect(r.url).toBe('https://oauth2:glpat-x@gitlab.com/o/r');
  });
  it('GitHub 的 token-only 仍按令牌作用户名', () => {
    const r = buildAuthedUrl('https://github.com/o/r', { kind: 'token', site: 'github', secret: 'ghp_abc' });
    expect(r.url).toBe('https://ghp_abc@github.com/o/r');
  });
  it('无凭据原样返回', () => {
    expect(buildAuthedUrl('https://github.com/o/r', null)).toEqual({ url: 'https://github.com/o/r', authed: false });
  });
});

describe('scrubUrlCredentials', () => {
  it('抹掉 URL 用户信息与常见 token', () => {
    expect(scrubUrlCredentials('clone https://ghp_secret@github.com/o/r failed'))
      .toBe('clone https://***@github.com/o/r failed');
    expect(scrubUrlCredentials('bad token ghp_abcdefghijklmnopqrst')).toBe('bad token ***');
  });
});

describe('repoKey / maskSecret', () => {
  it('repoKey 小写且含 host', () => {
    expect(repoKey('https://GitHub.com/Owner/Repo')).toBe('github.com/owner/repo');
  });
  it('maskSecret 保留首尾', () => {
    expect(maskSecret('1234567890')).toBe('1234…7890');
    expect(maskSecret('abc')).toBe('••••');
  });
});
