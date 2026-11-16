import { describe, it, expect } from 'vitest';
import {
  classifyRepoFiles, buildInjectionEntries, extensionDirName, injectionRoot,
} from '../src/core/ext-install-web.js';
import { treeEndpoint, normalizeTree, MAX_FILES } from '../src/core/repo-files.js';

const repo = { ok: true, site: 'github', host: 'github.com', owner: 'jiozhaoyue', repo: 'ST-Switcher', ref: 'main' };

describe('ext-install-web', () => {
  it('仓库根有 manifest.json 才认作前端扩展', () => {
    expect(classifyRepoFiles([{ path: 'manifest.json', data: new Uint8Array() }]).ok).toBe(true);
  });
  it('只有 package.json ⇒ 服务端插件', () => {
    expect(classifyRepoFiles([{ path: 'package.json', data: new Uint8Array() }]))
      .toEqual({ ok: false, reason: 'server-plugin' });
  });
  it('两者都没有 ⇒ no-manifest', () => {
    expect(classifyRepoFiles([{ path: 'index.js', data: new Uint8Array() }]))
      .toEqual({ ok: false, reason: 'no-manifest' });
  });
  it('ST 平铺布局落到 extensions/<名>/', () => {
    const rows = buildInjectionEntries([{ path: 'manifest.json', data: new Uint8Array([1]) }], 'demo', 'st');
    expect(rows).toEqual([{ name: 'extensions/demo/manifest.json', data: new Uint8Array([1]) }]);
    expect(injectionRoot('demo', 'st')).toBe('extensions/demo/');
  });
  it('TT 布局落到 data/default-user/extensions/', () => {
    const rows = buildInjectionEntries([{ path: 'a/b.js', data: new Uint8Array([1]) }], 'demo', 'tt');
    expect(rows[0].name).toBe('data/default-user/extensions/demo/a/b.js');
  });
  it('未知布局按 ST 摊平处理', () => {
    expect(buildInjectionEntries([{ path: 'manifest.json', data: new Uint8Array() }], 'x', 'unknown')[0].name)
      .toBe('extensions/x/manifest.json');
  });
  it('目录名去掉非法字符', () => {
    expect(extensionDirName({ repo: 'a:b/c' })).toBe('a-b-c');
  });
});

describe('repo-files 树端点', () => {
  it('GitHub 用 git/trees 且 recursive=1', () => {
    expect(treeEndpoint(repo, 'main')).toContain('/repos/jiozhaoyue/ST-Switcher/git/trees/main?recursive=1');
  });
  it('Gitee 走 api/v5', () => {
    expect(treeEndpoint({ ...repo, site: 'gitee', host: 'gitee.com' }, 'master'))
      .toContain('gitee.com/api/v5/repos/jiozhaoyue/ST-Switcher/git/trees/master');
  });
  it('GitLab 用 project 编码与 ref 参数', () => {
    const url = treeEndpoint({ ...repo, site: 'gitlab', host: 'gitlab.com' }, 'main');
    expect(url).toContain('/api/v4/projects/jiozhaoyue%2FST-Switcher/repository/tree');
    expect(url).toContain('ref=main');
  });
  it('归一化过滤目录条目', () => {
    const rows = normalizeTree({ tree: [{ path: 'a.js', type: 'blob' }, { path: 'dir', type: 'tree' }] });
    expect(rows).toEqual([{ path: 'a.js', type: 'blob' }]);
  });
  it('文件上限是正数', () => { expect(MAX_FILES).toBeGreaterThan(100); });
});
