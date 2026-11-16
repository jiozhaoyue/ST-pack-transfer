import { describe, expect, it } from 'vitest';
import {
  commitDetailEndpoint, normalizeCommitFiles, normalizeCommitList, normalizeTags,
  remoteFileUrl, tagsEndpoint,
} from '../src/core/git-site.js';
import { parseRepoUrl } from '../src/core/git-url.js';

const github = parseRepoUrl('https://github.com/jiozhaoyue/ST-pack-transfer');
const gitlab = parseRepoUrl('https://gitlab.com/group/sub/repo');
const gitee = parseRepoUrl('https://gitee.com/o/r');
const gitea = parseRepoUrl('https://git.example.com/o/r');

describe('git-site 只读端点（Git 可视化）', () => {
  it('标签端点按站点构造', () => {
    expect(tagsEndpoint(github)).toBe('https://api.github.com/repos/jiozhaoyue/ST-pack-transfer/tags?per_page=50');
    expect(tagsEndpoint(gitlab)).toContain('/api/v4/projects/group%2Fsub%2Frepo/repository/tags');
    expect(tagsEndpoint(gitee)).toContain('gitee.com/api/v5/repos/o/r/tags');
    expect(tagsEndpoint(gitea)).toBe('https://git.example.com/api/v1/repos/o/r/tags?limit=50');
    expect(tagsEndpoint({ ok: false })).toBeNull();
  });

  it('单次提交详情端点：GitLab 走 /diff', () => {
    expect(commitDetailEndpoint(github, 'abc123'))
      .toBe('https://api.github.com/repos/jiozhaoyue/ST-pack-transfer/commits/abc123');
    expect(commitDetailEndpoint(gitlab, 'abc123')).toContain('/repository/commits/abc123/diff');
    expect(commitDetailEndpoint(gitee, 'abc123')).toContain('gitee.com/api/v5/repos/o/r/commits/abc123');
    expect(commitDetailEndpoint(gitea, 'abc123')).toContain('/api/v1/repos/o/r/commits/abc123');
    expect(commitDetailEndpoint(github, '')).toBeNull();
  });

  it('任意文件原始地址：manifest.json 走 raw，不分叉', () => {
    expect(remoteFileUrl(github, 'main', 'manifest.json'))
      .toBe('https://raw.githubusercontent.com/jiozhaoyue/ST-pack-transfer/main/manifest.json');
    expect(remoteFileUrl(github, 'main', 'package.json'))
      .toBe('https://raw.githubusercontent.com/jiozhaoyue/ST-pack-transfer/main/package.json');
    expect(remoteFileUrl(gitlab, '', 'manifest.json')).toContain('/-/raw/main/manifest.json');
    expect(remoteFileUrl(gitee, 'dev', 'manifest.json')).toBe('https://gitee.com/o/r/raw/dev/manifest.json');
    expect(remoteFileUrl(gitea, 'dev', 'manifest.json')).toBe('https://git.example.com/o/r/raw/branch/dev/manifest.json');
    expect(remoteFileUrl(github, 'main', '')).toBe('');
  });

  it('提交列表归一：GitHub / GitLab / Gitee 形状都能读（含 parents）', () => {
    const rows = normalizeCommitList([
      { sha: '1234567890abcdef', commit: { message: 'feat: x\n\nbody', author: { name: 'A', date: '2026-01-01T00:00:00Z' } }, parents: [{ sha: 'parent-a' }] },
      { id: 'fedcba0987654321', title: 'fix: y', author_name: 'B', created_at: '2026-01-02', parent_ids: ['parent-b'] },
      { sha: 'aaaabbbbccccdddd', commit: { message: 'merge', author: { name: 'C', date: '2026-01-03' } }, parents: [{ sha: 'p1' }, { sha: 'p2' }] },
      { bad: true },
    ]);
    expect(rows).toEqual([
      { sha: '1234567890abcdef', shortSha: '12345678', message: 'feat: x', author: 'A', date: '2026-01-01T00:00:00Z', parents: ['parent-a'] },
      { sha: 'fedcba0987654321', shortSha: 'fedcba09', message: 'fix: y', author: 'B', date: '2026-01-02', parents: ['parent-b'] },
      { sha: 'aaaabbbbccccdddd', shortSha: 'aaaabbbb', message: 'merge', author: 'C', date: '2026-01-03', parents: ['p1', 'p2'] },
    ]);
    expect(normalizeCommitList(null)).toEqual([]);
  });

  it('标签归一去重排序', () => {
    expect(normalizeTags([{ name: 'v2' }, { name: 'v1' }, { name: 'v2' }, { bad: 1 }])).toEqual(['v1', 'v2']);
    expect(normalizeTags({ not: 'array' })).toEqual([]);
  });

  it('提交文件归一兼容 files[] 与 GitLab diff[]', () => {
    const gh = normalizeCommitFiles({ files: [{ filename: 'a.js', additions: 2, deletions: 1, patch: '@@' }] });
    expect(gh).toEqual([{ path: 'a.js', additions: 2, deletions: 1, patch: '@@' }]);
    const gl = normalizeCommitFiles([{ new_path: 'b.js', old_path: 'b.js', diff: '@@ x' }]);
    expect(gl).toEqual([{ path: 'b.js', additions: null, deletions: null, patch: '@@ x' }]);
    expect(normalizeCommitFiles(null)).toEqual([]);
  });
});
