import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  collectReportEnv,
  buildReportMarkdown,
  previewRedacted,
  submitToGitHub,
} from '../src/ui/issue-report.js';
import { logger } from '../src/core/logger.js';

const FULL_ENV = {
  pluginVersion: '0.6.0',
  hostPlatform: 'luker',
  hostIsPlugin: true,
  hostVersion: '3.1.0',
  ua: 'Mozilla/5.0 TestAgent',
  pageUrl: 'https://example.com/app',
  dbAvailable: true,
  dbVersion: '2',
  packageCount: 7,
  storageBytes: 123456,
  capabilitySnapshot: {
    assetList: { supported: true, known: true },
    accountWindow: { supported: false, known: true },
  },
  collectedAt: '2026-11-19T00:00:00.000Z',
};

describe('issue-report · 报告正文', () => {
  beforeEach(() => logger.clear());

  it('buildReportMarkdown 输出含全部环境字段与章节', () => {
    const md = buildReportMarkdown({ env: FULL_ENV, userInput: '打不开文件', includeLogs: true });
    for (const key of [
      '插件版本', '0.6.0',
      '宿主平台', 'luker',
      '宿主版本', '3.1.0',
      'User Agent', 'TestAgent',
      '页面地址', 'https://example.com/app',
      '数据库版本', '2',
      '包数量', '7',
      '占用字节', '123456',
      '采集时间', '2026-11-19T00:00:00.000Z',
      '能力 assetList', '能力 accountWindow',
    ]) {
      expect(md).toContain(key);
    }
    expect(md).toContain('## 问题描述');
    expect(md).toContain('## 复现步骤');
    expect(md).toContain('## 环境信息');
    expect(md).toContain('## 日志');
  });

  it('redact() 确实被调用：正文与用户输入里的 ghp_ token 被打码', () => {
    const md = buildReportMarkdown({
      env: FULL_ENV,
      userInput: '我的令牌 ghp_test123 泄露了',
      includeLogs: false,
    });
    expect(md).not.toContain('ghp_test123');
    expect(md).toContain('[REDACTED]');
  });

  it('环境字段读不到时输出 unavailable 而非空值', () => {
    const md = buildReportMarkdown({ env: {}, userInput: '', includeLogs: false });
    expect(md).toContain('unavailable');
    expect(md).not.toMatch(/\|\s*\|\s*\|/);
  });

  it('日志中的 ghp_test123 被打码（手测用例固化为回归）', () => {
    logger.error('上报前', { token: 'ghp_test123', url: 'https://u:p@host/?token=abc' });
    const md = buildReportMarkdown({ env: FULL_ENV, userInput: '崩溃', includeLogs: true });
    expect(md).toContain('## 日志');
    expect(md).not.toContain('ghp_test123');
    expect(md).not.toContain('u:p@host');
    expect(md).toContain('[REDACTED]');
  });

  it('环境信息中的 Windows 用户名被打码为 [USER]', () => {
    const md = buildReportMarkdown({
      env: { ...FULL_ENV, pageUrl: 'C:\\Users\\Alice\\AppData\\app' },
      userInput: '',
      includeLogs: false,
    });
    expect(md).not.toContain('Alice');
    expect(md).toContain('[USER]');
  });
});

describe('issue-report · 脱敏预览', () => {
  it('previewRedacted 与 redact 同源，令牌与 userinfo 被打码', () => {
    expect(previewRedacted('ghp_abcdefghijklmnop')).toBe('[REDACTED]');
    expect(previewRedacted('https://bob@host/x')).toContain('[REDACTED]@');
    expect(previewRedacted('Bearer abc.def')).toContain('Bearer [REDACTED]');
  });
});

describe('issue-report · 环境采集', () => {
  const savedLocation = globalThis.location;
  const savedNavigator = globalThis.navigator;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: 'https://alice:secret@example.com/app?token=abc#frag' },
    });
  });

  afterEach(() => {
    if (savedLocation === undefined) delete globalThis.location;
    else Object.defineProperty(globalThis, 'location', { configurable: true, value: savedLocation });
    if (savedNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNavigator });
  });

  it('collectReportEnv 返回全部字段，读不到的显式为 unavailable', async () => {
    const env = await collectReportEnv();
    for (const key of [
      'pluginVersion', 'hostPlatform', 'hostIsPlugin', 'hostVersion',
      'ua', 'pageUrl', 'dbAvailable', 'dbVersion',
      'packageCount', 'storageBytes', 'capabilitySnapshot', 'collectedAt',
    ]) {
      expect(env).toHaveProperty(key);
    }
    expect(typeof env.hostIsPlugin).toBe('boolean');
    expect(typeof env.dbAvailable).toBe('boolean');
    // Node 无 IndexedDB：如实降级，不编造
    expect(env.dbVersion).toBe('unavailable');
  });

  it('pageUrl 去掉 query 与 hash，不含用户名', async () => {
    const env = await collectReportEnv();
    expect(env.pageUrl).toBe('https://alice:secret@example.com/app');
    expect(env.pageUrl).not.toContain('token=abc');
    expect(env.pageUrl).not.toContain('#frag');
    const md = buildReportMarkdown({ env, userInput: '', includeLogs: false });
    expect(md).not.toContain('alice');
    expect(md).not.toContain('secret');
    expect(md).toContain('[REDACTED]');
  });
});

describe('issue-report · 提交 GitHub', () => {
  it('无 token 时抛明确错误', async () => {
    await expect(submitToGitHub({ owner: 'a', repo: 'b', title: 't', body: 'b' }))
      .rejects.toThrow(/token|PAT/);
    await expect(submitToGitHub({ owner: 'a', repo: 'b', title: 't', body: 'b', token: '   ' }))
      .rejects.toThrow(/token|PAT/);
  });

  it('缺 owner/repo 时抛明确错误', async () => {
    await expect(submitToGitHub({ repo: 'b', title: 't', body: 'b', token: 'ghp_x' }))
      .rejects.toThrow(/owner|repo/);
    await expect(submitToGitHub({ owner: 'a', title: 't', body: 'b', token: 'ghp_x' }))
      .rejects.toThrow(/owner|repo/);
  });

  it('有 token 时按预期 POST 到 Issues API 且正文再次脱敏', async () => {
    const calls = [];
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 201, json: async () => ({ number: 42, html_url: 'https://github.com/a/b/issues/42' }) };
    };
    try {
      const result = await submitToGitHub({
        owner: 'a', repo: 'b', title: '标题', body: '令牌 ghp_test123', token: 'ghp_realsecret', labels: ['bug'],
      });
      expect(result.number).toBe(42);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe('https://api.github.com/repos/a/b/issues');
      expect(calls[0].opts.method).toBe('POST');
      expect(calls[0].opts.headers.Authorization).toBe('Bearer ghp_realsecret');
      const sent = JSON.parse(calls[0].opts.body);
      expect(sent.body).not.toContain('ghp_test123');
      expect(sent.body).toContain('[REDACTED]');
      expect(sent.labels).toEqual(['bug']);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('HTTP 失败时抛带状态的错误', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) });
    try {
      await expect(submitToGitHub({ owner: 'a', repo: 'b', title: 't', body: 'b', token: 'bad' }))
        .rejects.toThrow(/Bad credentials.*401|401.*Bad credentials/);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
