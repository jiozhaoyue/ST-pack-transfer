import { describe, expect, it } from 'vitest';
import {
  GIT_STATES, buildGitSummary, cloudAlignment, diffStat, gitStateOf, mergeBranches,
  normalizeLocalGit, refPositions, selectGitTargets, shortSha, stripRemotePrefix,
} from '../src/core/git-viz.js';

describe('git-viz 本地状态归一', () => {
  it('有 HEAD 才算有历史，并给出短 SHA', () => {
    const local = normalizeLocalGit({
      currentBranchName: 'main',
      currentCommitHash: '0123456789abcdef',
      isUpToDate: true,
      remoteUrl: 'https://github.com/o/r',
      remoteCommitHash: 'fedcba9876543210',
    }, { name: 'ST-x' });
    expect(local).toEqual({
      name: 'ST-x',
      branch: 'main',
      commit: '0123456789abcdef',
      shortCommit: '01234567',
      remoteCommit: 'fedcba9876543210',
      remoteUrl: 'https://github.com/o/r',
      upToDate: true,
      hasHistory: true,
    });
    expect(gitStateOf(local)).toBe(GIT_STATES.upToDate);
  });

  it('空 HEAD / 非 Git 仓库 ⇒ 历史已丢失，不伪造提交', () => {
    const local = normalizeLocalGit({ currentBranchName: '', currentCommitHash: '', isUpToDate: true });
    expect(local.hasHistory).toBe(false);
    expect(local.shortCommit).toBe('');
    expect(gitStateOf(local)).toBe(GIT_STATES.historyLost);
    expect(gitStateOf(null)).toBe(GIT_STATES.unknown);
  });

  it('有历史但落后远端 ⇒ out-of-date', () => {
    const local = normalizeLocalGit({ currentCommitHash: 'abc', isUpToDate: false });
    expect(gitStateOf(local)).toBe(GIT_STATES.outOfDate);
  });

  it('短 SHA 保持 8 位且不越界', () => {
    expect(shortSha('abcdef1234567890')).toBe('abcdef12');
    expect(shortSha('')).toBe('');
    expect(shortSha('abc')).toBe('abc');
  });
});

describe('git-viz 分支合并', () => {
  it('本地优先、远端补充、当前分支排最前', () => {
    const rows = mergeBranches(
      [
        { name: 'dev', commit: 'aaa', current: true },
        { name: 'origin/main', commit: 'bbb', current: false },
      ],
      ['main', 'release'],
    );
    expect(rows.map((r) => r.name)).toEqual(['dev', 'origin/main', 'release']);
    expect(rows[0].current).toBe(true);
    expect(rows[1].source).toBe('local');
    expect(rows[2].source).toBe('cloud');
  });

  it('origin/main 与 main 视为同一分支，不重复', () => {
    const rows = mergeBranches([{ name: 'origin/main' }], ['main', 'main']);
    expect(rows).toHaveLength(1);
    expect(stripRemotePrefix('origin/main')).toBe('main');
  });
});

describe('git-viz 总览与登记', () => {
  it('未登记仓库也如实给出 registered=false', () => {
    const summary = buildGitSummary({
      name: 'x',
      install: null,
      local: normalizeLocalGit({ currentCommitHash: '' }),
      cloud: { branches: ['main'], commits: [{ sha: 'a' }] },
    });
    expect(summary.registered).toBe(false);
    expect(summary.state).toBe(GIT_STATES.historyLost);
    expect(summary.cloud.branches).toEqual(['main']);
    expect(summary.cloud.commits).toHaveLength(1);
  });

  it('登记仓库合并已装扩展，未装但登记的也列出', () => {
    const rows = selectGitTargets(
      [{ id: 'ST-a', version: '1.0.0', sourceType: 'global' }],
      [
        { name: 'ST-a', url: 'https://github.com/o/a', ref: 'main' },
        { name: 'ST-b', url: 'https://github.com/o/b', ref: 'dev' },
      ],
    );
    expect(rows.map((r) => r.name)).toEqual(['ST-a', 'ST-b']);
    expect(rows[0]).toMatchObject({ version: '1.0.0', sourceType: 'global', registered: true, ref: 'main' });
    expect(rows[1]).toMatchObject({ version: '', registered: true, url: 'https://github.com/o/b' });
  });

  it('diff 统计只累计已知增删行', () => {
    expect(diffStat([
      { additions: 3, deletions: 1 },
      { additions: null, deletions: null, patch: 'x' },
    ])).toEqual({ files: 2, additions: 3, deletions: 1, known: true });
    expect(diffStat([])).toEqual({ files: 0, additions: 0, deletions: 0, known: false });
  });
});

describe('git-viz 泳道落点标记 refPositions（2026-11-14 加深）', () => {
  const commits = [
    { sha: 'c3' }, { sha: 'c2' }, { sha: 'c1' },
  ];

  it('带 commit 的本地分支与 HEAD 钉到对应提交行', () => {
    const refs = refPositions(
      commits,
      [
        { name: 'main', commit: 'c1', current: true },
        { name: 'dev', commit: 'c2', current: false },
      ],
      { localCommit: 'c3' },
    );
    expect(refs.get('c1')).toEqual({ branches: ['main'], isHead: false });
    expect(refs.get('c2')).toEqual({ branches: ['dev'], isHead: false });
    expect(refs.get('c3')).toEqual({ branches: [], isHead: true });
  });

  it('云端分支只有名字（无 commit）不伪造落点；窗口外的落点如实忽略', () => {
    const refs = refPositions(
      commits,
      [
        { name: 'release', commit: '', source: 'cloud' },
        { name: 'gone', commit: 'zzz' },
      ],
      { localCommit: 'zzz' },
    );
    expect(refs.size).toBe(0);
  });

  it('同一提交可携带多个分支标记；输入非法时返回空图', () => {
    const refs = refPositions(
      commits,
      [
        { name: 'a', commit: 'c1' },
        { name: 'b', commit: 'c1' },
      ],
      { localCommit: 'c1' },
    );
    expect(refs.get('c1')).toEqual({ branches: ['a', 'b'], isHead: true });
    expect(refPositions(null, null).size).toBe(0);
    expect(refPositions(commits, [null, 'x', {}]).size).toBe(0);
  });
});

describe('git-viz 本地/云端对齐读数 cloudAlignment（2026-11-14 加深）', () => {
  const commits = [{ sha: 'c4' }, { sha: 'c3' }, { sha: 'c2' }, { sha: 'c1' }];

  it('本地 HEAD 是云端最新 ⇒ behind=0（已同步）', () => {
    expect(cloudAlignment('c4', commits)).toEqual({ known: true, found: true, behind: 0 });
  });

  it('本地 HEAD 落后 ⇒ behind=落后条数', () => {
    expect(cloudAlignment('c2', commits)).toEqual({ known: true, found: true, behind: 2 });
  });

  it('本地提交不在窗口内 ⇒ found=false（不代表分叉，如实报告）', () => {
    expect(cloudAlignment('aaa', commits)).toEqual({ known: true, found: false, behind: null });
  });

  it('本地没有 HEAD ⇒ known=false，无从对齐；输入非法安全回落', () => {
    expect(cloudAlignment('', commits)).toEqual({ known: false, found: false, behind: null });
    expect(cloudAlignment('c1', null)).toEqual({ known: true, found: false, behind: null });
  });
});
