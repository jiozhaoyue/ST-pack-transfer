/**
 * 问题报告 UI 接线契约测试。
 *
 * 覆盖：设置键归一 / 面板渲染 / token 存储隔离 / 动作路由 / 两份字典 key 同步。
 * 注意：index.js 的 onAction 为闭包内函数，无法直接 import；本文件用静态源码断言
 * 证明分支与导入已接线，行为契约由 issue-report.test.js 覆盖。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  SETTINGS_DEFAULTS,
  SETTING_KEYS,
  buildSettingsHtml,
  normalizeSettings,
  readSettings,
  GITHUB_TOKEN_STORAGE_KEY,
  readGithubToken,
  writeGithubToken,
  clearGithubToken,
} from '../src/ui/settings-panel.js';
import { keysOf } from '../src/i18n/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFile(ROOT + rel, 'utf8');

describe('issue-report 接线 · 设置键', () => {
  it('新键自动进入 SETTING_KEYS 且有正确默认值', () => {
    for (const key of [
      'issueOwner', 'issueRepo', 'issueTitle', 'issueDescription',
      'issueSteps', 'issueIncludeLogs', 'githubToken',
    ]) {
      expect(SETTING_KEYS).toContain(key);
      expect(SETTINGS_DEFAULTS).toHaveProperty(key);
    }
    expect(SETTINGS_DEFAULTS.issueOwner).toBe('');
    expect(SETTINGS_DEFAULTS.issueIncludeLogs).toBe(true);
    expect(SETTINGS_DEFAULTS.githubToken).toBe('');
  });

  it('normalizeSettings 接受新键：字符串 trim、布尔按类型', () => {
    const out = normalizeSettings({
      issueOwner: '  acme  ',
      issueRepo: '  repo  ',
      issueTitle: '  t  ',
      issueDescription: '  d  ',
      issueSteps: '  s  ',
      issueIncludeLogs: false,
      githubToken: '  ghp_x  ',
    });
    expect(out.issueOwner).toBe('acme');
    expect(out.issueRepo).toBe('repo');
    expect(out.issueTitle).toBe('t');
    expect(out.issueDescription).toBe('d');
    expect(out.issueSteps).toBe('s');
    expect(out.issueIncludeLogs).toBe(false);
    expect(out.githubToken).toBe('ghp_x');
    // 类型不符回落默认
    expect(normalizeSettings({ issueOwner: 1, issueIncludeLogs: 'x' }).issueOwner).toBe('');
    expect(normalizeSettings({ issueIncludeLogs: 'x' }).issueIncludeLogs).toBe(true);
  });

  it('readSettings 读回报告字段，但绝不读回 githubToken', () => {
    const values = {
      issueOwner: 'acme',
      issueRepo: 'repo',
      issueTitle: 'title',
      issueDescription: 'desc',
      issueSteps: 'steps',
      issueIncludeLogs: true,
      githubToken: 'ghp_leak',
    };
    const root = {
      querySelector(selector) {
        const m = /data-setting="([^"]+)"/.exec(selector);
        if (!m) return null;
        const v = values[m[1]];
        if (typeof v === 'boolean') return { checked: v };
        return { value: typeof v === 'string' ? v : '' };
      },
    };
    const out = readSettings(root);
    expect(out.issueOwner).toBe('acme');
    expect(out.issueIncludeLogs).toBe(true);
    // token 不进持久化对象（readSettings 无对应读取分支）
    expect(out.githubToken).toBe('');
  });
});

describe('issue-report 接线 · 面板渲染', () => {
  it('buildSettingsHtml 含 issue 组与全部控件，token 字段不带 data-setting', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    expect(html).toContain('data-group="issue"');
    expect(html).toContain('data-setting="issueOwner"');
    expect(html).toContain('data-setting="issueRepo"');
    expect(html).toContain('data-setting="issueTitle"');
    expect(html).toContain('data-setting="issueDescription"');
    expect(html).toContain('data-setting="issueSteps"');
    expect(html).toContain('data-setting="issueIncludeLogs"');
    expect(html).toContain('id="issue-token"');
    expect(html).toContain('data-action="issue-preview"');
    expect(html).toContain('data-action="issue-submit"');
    expect(html).not.toContain('data-setting="githubToken"');
  });
});

describe('issue-report 接线 · token 存储隔离', () => {
  const KEY = GITHUB_TOKEN_STORAGE_KEY;
  const saved = globalThis.localStorage;

  beforeEach(() => {
    const store = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
      },
    });
  });

  afterEach(() => {
    if (saved === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: saved });
  });

  it('令牌只写专用 localStorage 键，不与持久化 settings 键相同', () => {
    expect(KEY).toContain('github-token');
    expect(KEY).not.toBe('st-pack-transfer:settings');
    writeGithubToken('  ghp_secret  ');
    expect(readGithubToken()).toBe('ghp_secret');
    expect(globalThis.localStorage.getItem('st-pack-transfer:settings')).toBeNull();
    clearGithubToken();
    expect(readGithubToken()).toBe('');
  });
});

describe('issue-report 接线 · 动作路由与字典同步', () => {
  it('index.js 导入五导出并路由 issue-preview / issue-submit', async () => {
    const code = await read('index.js');
    expect(code).toContain("from './src/ui/issue-report.js'");
    for (const name of ['collectReportEnv', 'buildReportMarkdown', 'previewRedacted', 'submitToGitHub']) {
      expect(code).toContain(name);
    }
    expect(code).toContain("name === 'issue-preview'");
    expect(code).toContain("name === 'issue-submit'");
    expect(code).toContain('submitToGitHub({');
    expect(code).toContain('writeGithubToken(');
  });

  it('issue.* 键在 zh-CN 与 en-US 两份字典同步', () => {
    const zh = keysOf('zh-CN').filter((k) => k.startsWith('issue.') || k.startsWith('help.issue.'));
    const en = keysOf('en-US').filter((k) => k.startsWith('issue.') || k.startsWith('help.issue.'));
    expect(zh.length).toBeGreaterThan(0);
    expect(en.sort()).toEqual(zh.sort());
  });
});
