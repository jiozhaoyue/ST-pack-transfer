import { describe, expect, it } from 'vitest';
import {
  changelogCommits,
  changelogReleases,
  fullChangelog,
  markSeenVersion,
  readSeenVersion,
  recentChangelog,
  shouldShowChangelog,
} from '../src/core/changelog.js';

describe('changelog · 更新日志纯逻辑', () => {
  it('版本变化才自动弹；关闭开关后永不自动弹', () => {
    expect(shouldShowChangelog('0.5.2', '0.5.3', true)).toBe(true);
    expect(shouldShowChangelog('0.5.3', '0.5.3', true)).toBe(false);
    expect(shouldShowChangelog('0.5.2', '0.5.3', false)).toBe(false);
    expect(shouldShowChangelog('', '', true)).toBe(false);
  });

  it('seen 版本可写可读（存储异常静默降级）', () => {
    const store = new Map();
    const adapter = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    expect(readSeenVersion(adapter)).toBe('');
    expect(markSeenVersion('0.5.3', adapter)).toBe(true);
    expect(readSeenVersion(adapter)).toBe('0.5.3');
    expect(markSeenVersion('0.5.3', { setItem() { throw new Error('quota'); } })).toBe(false);
  });

  it('构建期无注入时回退发布摘要，仍有完整可读列表', () => {
    expect(changelogCommits().length).toBeGreaterThanOrEqual(0);
    expect(recentChangelog(10).length).toBeGreaterThan(0);
    expect(fullChangelog().length).toBeGreaterThan(0);
    expect(changelogReleases()[0].version).toBe('0.5.3');
  });
});
