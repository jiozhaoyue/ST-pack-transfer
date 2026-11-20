import { describe, it, expect } from 'vitest';
import { parseGitHubUrl, resolveUpstreamChannels } from '../src/core/upstream-resolver.js';

describe('Upstream Channels Resolver Suite', () => {
  describe('parseGitHubUrl', () => {
    it('正确解析 https 与 git+ssh 格式的 GitHub URL', () => {
      expect(parseGitHubUrl('https://github.com/someone/ST-pack-transfer.git')).toEqual({
        owner: 'someone',
        repo: 'ST-pack-transfer',
        url: 'https://github.com/someone/ST-pack-transfer',
        docsUrl: 'https://someone.github.io/ST-pack-transfer/',
        issuesUrl: 'https://github.com/someone/ST-pack-transfer/issues',
      });

      expect(parseGitHubUrl('git@github.com:jiozhaoyue/ST-pack-transfer')).toEqual({
        owner: 'jiozhaoyue',
        repo: 'ST-pack-transfer',
        url: 'https://github.com/jiozhaoyue/ST-pack-transfer',
        docsUrl: 'https://jiozhaoyue.github.io/ST-pack-transfer/',
        issuesUrl: 'https://github.com/jiozhaoyue/ST-pack-transfer/issues',
      });
    });

    it('非法或空 URL 返回 null', () => {
      expect(parseGitHubUrl('')).toBeNull();
      expect(parseGitHubUrl(null)).toBeNull();
      expect(parseGitHubUrl('https://gitlab.com/someone/repo')).toBeNull();
    });

    it('非 GitHub 域名与子域名 / 后缀伪造返回 null', () => {
      expect(parseGitHubUrl('https://mygithub.com/a/b')).toBeNull();
      expect(parseGitHubUrl('https://github.com.evil.com/a/b')).toBeNull();
      expect(parseGitHubUrl('https://api.github.com/repos/a/b')).toBeNull();
      expect(parseGitHubUrl('https://gist.github.com/a/b')).toBeNull();
    });

    it('路径不完整 / 路径穿越 / 尾点 / 中文 owner 返回 null', () => {
      expect(parseGitHubUrl('https://github.com/')).toBeNull();
      expect(parseGitHubUrl('https://github.com')).toBeNull();
      expect(parseGitHubUrl('https://github.com/a')).toBeNull();
      expect(parseGitHubUrl('https://github.com/../..')).toBeNull();
      expect(parseGitHubUrl('https://github.com/./b')).toBeNull();
      expect(parseGitHubUrl('https://github.com/a/b.')).toBeNull();
      expect(parseGitHubUrl('https://github.com/中文/仓库')).toBeNull();
    });

    it('端口注入 :8080 返回 null', () => {
      expect(parseGitHubUrl('https://github.com:8080/a/b')).toBeNull();
    });

    it('查询串注入伪造 github.com/x/y 返回 null', () => {
      expect(parseGitHubUrl('https://evil.com/?u=github.com/evil/repo')).toBeNull();
      expect(parseGitHubUrl('https://github.com/a/b?next=evil.com/x/y')).toEqual({
        owner: 'a',
        repo: 'b',
        url: 'https://github.com/a/b',
        docsUrl: 'https://a.github.io/b/',
        issuesUrl: 'https://github.com/a/b/issues',
      });
    });

    it('userinfo 注入返回 null', () => {
      expect(parseGitHubUrl('https://github.com@evil.com/a/b')).toBeNull();
      expect(parseGitHubUrl('https://evil.com@github.com/a/b')).toBeNull();
    });

    it('超长 owner / repo 返回 null', () => {
      expect(parseGitHubUrl(`https://github.com/${'a'.repeat(40)}/repo`)).toBeNull();
      expect(parseGitHubUrl(`https://github.com/owner/${'b'.repeat(101)}`)).toBeNull();
      expect(parseGitHubUrl(`https://github.com/${'a'.repeat(2100)}/repo`)).toBeNull();
      expect(parseGitHubUrl(`https://github.com/owner/${'b'.repeat(2100)}`)).toBeNull();
    });

    it('边界长度内的合法 owner/repo 正常解析', () => {
      expect(parseGitHubUrl(`https://github.com/${'a'.repeat(39)}/${'b'.repeat(100)}`)).toMatchObject({
        owner: 'a'.repeat(39),
        repo: 'b'.repeat(100),
      });
    });

    it('多段子路径只取仓库根并保留大小写', () => {
      expect(parseGitHubUrl('https://github.com/a/b/c/d')).toMatchObject({ owner: 'a', repo: 'b' });
      expect(parseGitHubUrl('https://github.com/A/B')).toMatchObject({ owner: 'A', repo: 'B' });
    });
  });

  describe('resolveUpstreamChannels 双通道解析', () => {
    it('在 Fork 场景下通过 GitHub API source 动态识别出最早上游根 jiozhaoyue', async () => {
      // 模拟 GitHub API 返回 Fork 源链
      const mockFetch = async (url) => {
        if (url.includes('/repos/someone/ST-pack-transfer')) {
          return {
            ok: true,
            json: async () => ({
              fork: true,
              parent: { html_url: 'https://github.com/middle/ST-pack-transfer' },
              source: { html_url: 'https://github.com/jiozhaoyue/ST-pack-transfer' },
            }),
          };
        }
        return { ok: false };
      };

      const result = await resolveUpstreamChannels({
        currentRemoteUrl: 'https://github.com/someone/ST-pack-transfer.git',
        fetchFn: mockFetch,
      });

      // 通道一：当前仓
      expect(result.current.owner).toBe('someone');
      expect(result.current.repo).toBe('ST-pack-transfer');

      // 通道二：动态溯源出的最早上游
      expect(result.upstream.owner).toBe('jiozhaoyue');
      expect(result.upstream.repo).toBe('ST-pack-transfer');

      expect(result.isFork).toBe(true);
      expect(result.provenance).toBe('github-api-lineage');
    });

    it('存在本地显式 upstream remote 时直接优先采信', async () => {
      const result = await resolveUpstreamChannels({
        currentRemoteUrl: 'https://github.com/myfork/ST-pack-transfer.git',
        upstreamRemoteUrl: 'https://github.com/jiozhaoyue/ST-pack-transfer.git',
      });

      expect(result.current.owner).toBe('myfork');
      expect(result.upstream.owner).toBe('jiozhaoyue');
      expect(result.isFork).toBe(true);
      expect(result.provenance).toBe('git-upstream-remote');
    });

    it('网络故障/离线时降级为官方托底，不抛错且 provenance 如实标记 offline-default', async () => {
      const failingFetch = async () => {
        throw new Error('Network offline');
      };

      const result = await resolveUpstreamChannels({
        currentRemoteUrl: 'https://github.com/offline-user/ST-pack-transfer.git',
        fetchFn: failingFetch,
      });

      expect(result.current.owner).toBe('offline-user');
      // 内置默认仓坐标（非动态溯源）
      expect(result.upstream.owner).toBe('jiozhaoyue');
      expect(result.upstream.repo).toBe('ST-pack-transfer');
      expect(result.isFork).toBe(true);
      // 解析失败路径不得虚假标记 github-api-lineage（G-34）
      expect(result.provenance).toBe('offline-default');
    });

    it('API 返回非法 source URL（parseGitHubUrl 为 null）时 provenance 为 offline-default', async () => {
      const badSourceFetch = async () => ({
        ok: true,
        json: async () => ({
          fork: true,
          source: { html_url: 'https://gitlab.com/not-github/repo' },
        }),
      });

      const result = await resolveUpstreamChannels({
        currentRemoteUrl: 'https://github.com/someone/ST-pack-transfer.git',
        fetchFn: badSourceFetch,
      });

      expect(result.upstream.owner).toBe('jiozhaoyue');
      expect(result.upstream.repo).toBe('ST-pack-transfer');
      expect(result.provenance).toBe('offline-default');
    });
  });
});
