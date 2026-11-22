import { describe, expect, it } from 'vitest';
import {
  isGitEntry,
  isGitEntryDropped,
  isGitMinimalKept,
  normalizeGitMode,
} from '../src/core/git-policy.js';
import { GIT_MODES } from '../src/core/export-modes.js';

describe('git-policy · 与体积预测共用', () => {
  it('基础判定不把 .gitkeep 误判为 .git', () => {
    expect(isGitEntry('.git')).toBe(true);
    expect(isGitEntry('.git/objects/pack/a.pack')).toBe(true);
    expect(isGitEntry('.gitkeep')).toBe(false);
  });

  it('minimal 只保留识别与更新最小集', () => {
    for (const p of ['.git/config', '.git/HEAD', '.git/index', '.git/refs/heads/main']) {
      expect(isGitMinimalKept(p)).toBe(true);
      expect(isGitEntryDropped(p, GIT_MODES.MINIMAL)).toBe(false);
    }
    // packed-refs 属分支指针载体（git gc 后 refs/heads 可被打包进 packed-refs），
    // 丢失会让接收方失去在线更新能力，必须随 minimal 保留（2026-11-22 修复裁定）。
    for (const p of ['.git/packed-refs']) {
      expect(isGitMinimalKept(p)).toBe(true);
      expect(isGitEntryDropped(p, GIT_MODES.MINIMAL)).toBe(false);
    }
    for (const p of ['.git/objects/pack/a.pack', '.git/logs/HEAD']) {
      expect(isGitEntryDropped(p, GIT_MODES.MINIMAL)).toBe(true);
    }
  });

  it('strip 剔除全部 .git；keep 不剔除；未知值回落 keep', () => {
    expect(isGitEntryDropped('.git/config', GIT_MODES.STRIP)).toBe(true);
    expect(isGitEntryDropped('.git/config', GIT_MODES.KEEP)).toBe(false);
    expect(normalizeGitMode('nonsense')).toBe(GIT_MODES.KEEP);
    expect(isGitEntryDropped('.git/config', 'nonsense')).toBe(false);
  });
});
