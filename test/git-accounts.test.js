import { describe, it, expect } from 'vitest';
import {
  normalizeAccounts, addAccount, removeAccount, setDefaultAccount, findAccountFor,
  credentialOf, maskAccount, siteDefaultHost,
} from '../src/core/git-accounts.js';

const acc = (over = {}) => ({ site: 'github', secret: 'ghp_abcdefgh', label: 'work', ...over });

describe('normalizeAccounts', () => {
  it('归一并去重，同组自动一个默认', () => {
    const list = normalizeAccounts([
      acc({ id: 'a1' }),
      acc({ id: 'a2', secret: 'ghp_zzzzzzzz' }),
    ]);
    expect(list).toHaveLength(2);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list[0].host).toBe('github.com');
  });

  it('无 secret 的条目被丢弃', () => {
    expect(normalizeAccounts([{ site: 'github' }])).toEqual([]);
  });

  it('自建 gitea 必须有地址', () => {
    expect(normalizeAccounts([{ site: 'gitea', secret: 'x' }])).toEqual([]);
    const ok = normalizeAccounts([{ site: 'gitea', baseUrl: 'https://git.example.com', secret: 'x' }]);
    expect(ok[0].host).toBe('git.example.com');
  });
});

describe('账号操作', () => {
  it('add / setDefault / remove', () => {
    let list = addAccount([], acc({ id: 'a1' }));
    list = addAccount(list, acc({ id: 'a2', secret: 'ghp_bbbbbbbb', label: 'two' }));
    expect(list.find((a) => a.id === 'a2').isDefault).toBe(false);
    list = setDefaultAccount(list, 'a2');
    expect(list.find((a) => a.id === 'a2').isDefault).toBe(true);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    list = removeAccount(list, 'a2');
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
  });

  it('按仓库主机匹配，优先默认账号', () => {
    const list = normalizeAccounts([
      acc({ id: 'gh', secret: 'ghp_11111111' }),
      acc({ id: 'gl', site: 'gitlab', secret: 'glpat-22222222' }),
      acc({ id: 'self', site: 'gitea', baseUrl: 'https://git.example.com', secret: 't3333333' }),
    ]);
    expect(findAccountFor(list, { host: 'github.com', site: 'github' }).id).toBe('gh');
    expect(findAccountFor(list, { host: 'git.example.com', site: 'gitea' }).id).toBe('self');
    expect(findAccountFor(list, { host: 'unknown.example.org', site: 'custom' })).toBe(null);
  });

  it('credentialOf 区分 token / basic，maskAccount 不泄露', () => {
    expect(credentialOf({ secret: 'x' })).toEqual({ kind: 'token', secret: 'x' });
    expect(credentialOf({ username: 'u', secret: 'x' })).toEqual({ kind: 'basic', username: 'u', secret: 'x' });
    const masked = maskAccount(acc({ secret: 'ghp_abcdefgh' }));
    expect(masked.secret).toBe('ghp_…efgh');
    expect(masked.hasSecret).toBe(true);
  });

  it('siteDefaultHost', () => {
    expect(siteDefaultHost('github')).toBe('github.com');
    expect(siteDefaultHost('gitea')).toBe('');
  });
});
