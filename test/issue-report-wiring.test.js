/**
 * 问题报告 UI 接线契约测试。
 *
 * 覆盖：设置键归一 / 面板渲染 / token 存储隔离 / 动作路由 / 两份字典 key 同步。
 * 注意：index.js 的 onAction 为闭包内函数，无法直接 import；本文件用静态源码断言
 * 证明分支与导入已接线，行为契约由 issue-report.test.js 覆盖。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SETTINGS_DEFAULTS,
  SETTING_KEYS,
  buildSettingsHtml,
  normalizeSettings,
  readSettings,
  GITHUB_TOKEN_STORAGE_KEY,
  readGithubToken,
  readIssueReportForm,
  writeGithubToken,
  clearGithubToken,
  getIssueLogSummary,
  buildIssueLogSummaryText,
  renderMarkdownSafe,
} from '../src/ui/settings-panel.js';
import { keysOf, t } from '../src/i18n/index.js';
import { buildReportMarkdown } from '../src/ui/issue-report.js';
import {
  buildGitHubNewIssueUrl,
  buildGitHubNewIssueUrlSafe,
  MAX_ISSUE_URL_LENGTH,
} from '../src/ui/issue-report.js';
import { logger } from '../src/core/logger.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFile(ROOT + rel, 'utf8');

describe('issue-report 接线 · 设置键', () => {
  it('新键自动进入 SETTING_KEYS 且有正确默认值', () => {
    for (const key of [
      'issueOwner', 'issueRepo', 'issueTitle', 'issueDescription',
      'issueSteps', 'issueIncludeLogs', 'githubToken', 'issueAccount',
    ]) {
      expect(SETTING_KEYS).toContain(key);
      expect(SETTINGS_DEFAULTS).toHaveProperty(key);
    }
    expect(SETTINGS_DEFAULTS.issueOwner).toBe('');
    expect(SETTINGS_DEFAULTS.issueIncludeLogs).toBe(true);
    expect(SETTINGS_DEFAULTS.githubToken).toBe('');
    expect(SETTINGS_DEFAULTS.issueAccount).toBe('');
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
      issueAccount: 'github:github.com:alice:xxxx',
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
    expect(out.issueAccount).toBe('github:github.com:alice:xxxx');
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
    expect(html).toContain('data-action="issue-preview"');
    expect(html).toContain('data-action="issue-submit"');
    expect(html).not.toContain('data-setting="githubToken"');
    // 令牌自 2026-11-20 起不在面板手填，#issue-token 已移除；只保留「不落持久化字段」契约。
    expect(html).not.toContain('id="issue-token"');
  });

  it('issueAccount 下拉存在且为只读指示，空态含禁用占位 option', () => {
    const html = buildSettingsHtml({});
    // 账号下拉存在，且带 disabled（令牌来自本机，不可切换账号）。
    expect(html).toMatch(/<select[^>]*data-setting="issueAccount"[^>]*disabled/);
    // 空态：option 文案为「未配置 请到开发者设置添加令牌」（en-US 为 "Not configured"），且该 option 自身 disabled。
    // 断言语言无关：CI 环境默认 locale 为 en-US，t() 渲染英文文案。
    expect(html).toContain(t('issue.accountEmpty'));
    expect(html).toMatch(/<option value="" disabled selected>[^<]*(?:未配置|Not configured)/);
  });

  it('issueAccount 有账号时 option 含该账号 label，并按 issueAccount 回显选中', () => {
    const gitAccounts = [{
      id: 'github:github.com:alice:xxxx',
      site: 'github',
      host: 'github.com',
      username: 'alice',
      label: '工作号',
      secret: 'ghp_dummy_secret',
    }];
    const html = buildSettingsHtml({ gitAccounts, issueAccount: 'github:github.com:alice:xxxx' });
    expect(html).toContain('工作号');
    expect(html).toContain('value="github:github.com:alice:xxxx"');
    expect(html).toMatch(/<option value="github:github.com:alice:xxxx" selected>工作号<\/option>/);
  });

  it('readIssueReportForm 返回对象含 issueAccount，值等于 select 选中值', () => {
    const body = {
      querySelector(selector) {
        const m = /data-setting="([^"]+)"/.exec(selector);
        if (!m) return null;
        if (m[1] === 'issueAccount') return { value: 'github:github.com:alice:xxxx' };
        if (m[1] === 'issueIncludeLogs') return { checked: true };
        return { value: '' };
      },
    };
    const form = readIssueReportForm(body);
    expect(form).toHaveProperty('issueAccount');
    expect(form.issueAccount).toBe('github:github.com:alice:xxxx');
  });

  it('问题报告组含三个操作按钮：id、原生类与委托属性齐全', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    const buttons = [
      { id: 'issue-copy-report', action: 'copy', label: t('settings.issueCopy') },
      { id: 'issue-export-md', action: 'export-md', label: t('settings.issueExportMd') },
      { id: 'issue-new-issue', action: 'new-issue', label: t('settings.issueNewIssue') },
    ];
    for (const b of buttons) {
      expect(html).toContain('id="' + b.id + '"');
      expect(html).toContain('data-issue-action="' + b.action + '"');
      expect(html).toContain(b.label);
    }
    // 复用宿主原生类，且不得内联 onclick
    expect((html.match(/class="menu_button"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain('onclick=');
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

  it('提交门禁：prereq 校验先于其它校验，且二次确认文案含责任声明、每次必弹无跳过', async () => {
    const code = await read('index.js');
    // 限定 submitIssueReport 函数体判顺序：未勾先拦，先于标题/仓库/令牌校验。
    const fnStart = code.indexOf('async function submitIssueReport');
    const fnEnd = code.indexOf('function openSettings', fnStart);
    const fn = code.slice(fnStart, fnEnd);
    const prereqAt = fn.indexOf('issuePrereqsMet(form.prereqs)');
    const titleAt = fn.indexOf("t('issue.missingTitle')");
    expect(fnStart).toBeGreaterThan(-1);
    expect(prereqAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(-1);
    expect(prereqAt).toBeLessThan(titleAt);
    // 确认模态用 t('issue.confirmBody') 作正文，且无 "never/不再提示" 类跳过开关。
    expect(code).toContain("t('issue.confirmBody')");
    expect(code).toContain('setIssueModalApi(');
    expect(code).not.toMatch(/issue[Cc]onfirm[Nn]ever|skipIssueConfirm|noIssueConfirm/);
  });

  it('提交按钮不设 disabled，点击可触发拦截提示（保留语义 data 属性）', () => {
    const code = readFileSync(ROOT + 'src/ui/settings-panel.js', 'utf8');
    expect(code).toContain("submitBtn.setAttribute('data-prereq-met'");
    expect(code).toContain("submitBtn.setAttribute('aria-disabled'");
    expect(code).not.toContain('submitBtn.disabled = !met');
  });

  it('网页跳转 new-issue 走 confirmIssueSubmit 二次确认，复制/导出不拦', () => {
    const code = readFileSync(ROOT + 'src/ui/settings-panel.js', 'utf8');
    expect(code).toContain('confirmIssueSubmit(');
    // 确认后才 window.open URL（网页提交也在确认链内）。
    expect(code).toMatch(/confirmIssueSubmit\(\(\) => \{[\s\S]*?window\.open\(result\.url/);
    // 统一确认函数每次调用 openModal，无跳过配置。
    expect(code).toContain("t('issue.confirmBody')");
  });

  it('issue.* 键在 zh-CN 与 en-US 两份字典同步', () => {
    const zh = keysOf('zh-CN').filter((k) => k.startsWith('issue.') || k.startsWith('help.issue.'));
    const en = keysOf('en-US').filter((k) => k.startsWith('issue.') || k.startsWith('help.issue.'));
    expect(zh.length).toBeGreaterThan(0);
    expect(en.sort()).toEqual(zh.sort());
  });

  it('settings.issue* 按钮文案键在两份字典同步存在', () => {
    const keys = [
      'settings.issueCopy', 'settings.issueExportMd', 'settings.issueNewIssue',
      'settings.issueCopyOk', 'settings.issueCopyFail',
    ];
    const zh = keysOf('zh-CN');
    const en = keysOf('en-US');
    for (const key of keys) {
      expect(zh).toContain(key);
      expect(en).toContain(key);
    }
  });
});

describe('issue-report 接线 · 日志开关差异', () => {
  it('buildReportMarkdown 随 includeLogs 产出不同文本', () => {
    const env = { pluginVersion: '1.0.0', hostPlatform: 'test' };
    const userInput = { title: 't', description: 'd', steps: 's' };
    const withLogs = buildReportMarkdown({ env, userInput, includeLogs: true });
    const withoutLogs = buildReportMarkdown({ env, userInput, includeLogs: false });
    expect(typeof withLogs).toBe('string');
    expect(typeof withoutLogs).toBe('string');
    expect(withLogs).not.toBe(withoutLogs);
    expect(withLogs).toContain('## 日志');
    expect(withoutLogs).not.toContain('## 日志');
  });
});

describe('issue-report · 日志附带实时统计（同源）', () => {
  it('统计条数与 buildReportMarkdown 实际产出的日志行数一致', () => {
    const before = logger.getEntries('ALL').length;
    const add = 3;
    for (let i = 0; i < add; i += 1) logger.info('__wiring_summary_probe__' + i);
    try {
      const md = buildReportMarkdown({
        env: {}, userInput: {}, includeLogs: true, logLevel: 'ALL', logCount: 100,
      });
      const marker = '## 日志\n```text\n';
      const body = md.slice(md.indexOf(marker) + marker.length).split('\n```')[0].trim();
      const actualLines = body.split('\n').filter((line) => line.trim()).length;
      const summary = getIssueLogSummary();
      expect(summary.count).toBe(actualLines);
      expect(summary.level).toBe('ALL');
      expect(summary.count).toBeGreaterThanOrEqual(add);
    } finally {
      // 不污染其它用例：记录数只增不减，测试本进程内不强行清空全局缓冲。
      expect(logger.getEntries('ALL').length).toBeGreaterThanOrEqual(before + add);
    }
  });

  it('logCount 上限生效：统计不会超过 100 条', () => {
    const summary = getIssueLogSummary();
    expect(summary.count).toBeLessThanOrEqual(100);
  });

  it('统计文案随勾选状态切换：三种文案键各自独立且非空', () => {
    const off = buildIssueLogSummaryText(false);
    const on = buildIssueLogSummaryText(true);
    expect(typeof off).toBe('string');
    expect(off.length).toBeGreaterThan(0);
    expect(typeof on).toBe('string');
    expect(on.length).toBeGreaterThan(0);
    // 关闭与开启必须产出不同文案（不附带 vs 附带/暂无日志）。
    expect(on).not.toBe(off);
    // 文案来自 i18n：落地后是中文，未落地时回退为 key 名，两种都从 t() 取值。
    const summary = getIssueLogSummary();
    const expectedKey = summary.count === 0 ? 'issue.logEmpty' : 'issue.logAttached';
    const expectedText = summary.count === 0
      ? t(expectedKey)
      : t(expectedKey, { n: summary.count });
    expect(on === expectedText || on === expectedKey).toBe(true);
    // 核心：有日志时文案必须真的把「多少条」显示出来。
    if (summary.count > 0) {
      expect(on).toContain(String(summary.count));
    }
  });

  it('设置面板表单渲染即含统计容器且文案已填入（非空闪烁）', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    expect(html).toContain('id="issue-log-summary"');
    // id 前还有 role/class 等属性，须用 [^>]* 跨越；仅断言「id=...>」会先命中 aria-describedby 而误配。
    const re = /<div[^>]*id="issue-log-summary"[^>]*>([^<]*)</;
    const m = re.exec(html);
    expect(m).not.toBeNull();
    expect(m[1].length).toBeGreaterThan(0);
  });
});

describe('issue-report · 安全 Markdown 渲染器', () => {
  it('渲染标题 / 粗体 / 行内代码 / 代码块 / 列表', () => {
    const html = renderMarkdownSafe('# 标题\n正文 **粗** 与 `code`\n- 列表项\n```\n<a>raw</a>\n```');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<strong>粗</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>列表项</li>');
    expect(html).toContain('<pre><code>&lt;a&gt;raw&lt;/a&gt;</code></pre>');
  });

  it('文本片段全部转义：脚本标签不穿透', () => {
    const html = renderMarkdownSafe('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&gt;');
    // 尖括号已实体化，onerror 仅剩无害纯文本，不构成属性或事件注入。
    expect(html).toMatch(/^<p>&lt;img[^<]*&gt;<\/p>$/);
  });

  it('链接仅放行 http(s)，javascript: 退化为纯文本', () => {
    const ok = renderMarkdownSafe('[站点](https://example.com/a?b=1&c=2)');
    expect(ok).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(ok).toContain('rel="noopener noreferrer"');
    const bad = renderMarkdownSafe('[点我](javascript:alert(1))');
    expect(bad).not.toContain('<a ');
    expect(bad).not.toContain('href=');
    expect(bad).toContain('点我');
  });

  it('代码块内的 Markdown 元字符不被解析', () => {
    const html = renderMarkdownSafe('```\n# 不当标题\n**不当粗体**\n```');
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('# 不当标题');
  });
});

/* 任务 A/B 新契约：动态坐标、模板解析、前置勾选、两条线跳转（零硬编码） */
describe('issue 跳转与模板 · 动态坐标零硬编码', () => {
  it('issue-report.js 源码不含硬编码 owner/repo 字面量', async () => {
    const code = await read('src/ui/issue-report.js');
    expect(code).not.toMatch(/['"]jiozhaoyue['"]/);
    expect(code).not.toMatch(/['"]ST-pack-transfer['"]/);
  });

  it('settings-panel.js 源码不含硬编码 owner/repo 字面量', async () => {
    const code = await read('src/ui/settings-panel.js');
    expect(code).not.toMatch(/['"]jiozhaoyue['"]/);
    expect(code).not.toMatch(/['"]ST-pack-transfer['"]/);
  });

  it('buildGitHubNewIssueUrl 无坐标返回空串，有坐标正确拼接', async () => {
    const mod = await import('../src/ui/issue-report.js');
    expect(mod.buildGitHubNewIssueUrl({})).toBe('');
    expect(mod.buildGitHubNewIssueUrl({ owner: 'o', repo: 'r', title: 't' }))
      .toContain('https://github.com/o/r/issues/new?title=');
  });

  it('两条线跳转按钮渲染存在，坐标缺失时 disabled', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    expect(html).toContain('data-issue-action="open-current-issues"');
    expect(html).toContain('data-issue-action="open-upstream-issues"');
    expect(html).toMatch(/id="issue-current-issues"[^>]*disabled/);
    expect(html).toMatch(/id="issue-upstream-issues"[^>]*disabled/);
  });

  it('两条线搜索/文档 URL 无坐标时返回空串', async () => {
    const mod = await import('../src/ui/issue-report.js');
    expect(mod.buildIssueSearchUrl({ current: null }, 'kw')).toBe('');
    expect(mod.buildDocsRepoUrl({ current: null })).toBe('');
  });
});

describe('issue 模板 · 解析、渲染、前置勾选', () => {
  const bugYml = [
    'name: Bug 报告', 'description: 报告错误', 'title: "[Bug] "',
    'labels:', '  - bug', 'body:',
    '  - type: textarea', '    id: summary', '    attributes:',
    '      label: 问题摘要', '    validations:', '      required: true',
    '  - type: dropdown', '    id: runtime', '    attributes:',
    '      label: 运行形态', '      options:', '        - A', '        - B',
    '  - type: checkboxes', '    id: privacy', '    attributes:',
    '      label: 隐私确认', '      options:', '        - label: 已搜索', '          required: true',
  ].join('\n');

  it('parseIssueTemplates 覆盖 name/labels/body 字段与 required/options', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const parsed = mod.parseIssueTemplates({ 'bug.yml': bugYml });
    const obj = parsed.templates[0];
    expect(obj.name).toBe('Bug 报告');
    expect(obj.labels).toEqual(['bug']);
    expect(obj.body.length).toBe(3);
    expect(obj.body[0].id).toBe('summary');
    expect(obj.body[0].required).toBe(true);
    expect(obj.body[1].attributes.options).toEqual([{ label: 'A', required: false }, { label: 'B', required: false }]);
    expect(obj.body[2].attributes.options[0]).toEqual({ label: '已搜索', required: true });
  });

  it('parseIssueTemplates 读取 config.yml 的 blank_issues_enabled/contact_links', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const cfg = 'blank_issues_enabled: false\ncontact_links:\n  - name: 文档\n    url: https://example.com\n    about: 说明\n';
    const r = mod.parseIssueTemplates({ 'config.yml': cfg });
    expect(r.config.blankIssuesEnabled).toBe(false);
    expect(r.config.contactLinks[0].name).toBe('文档');
  });

  it('前置勾选 disabled 逻辑：两项满足才 met', async () => {
    const mod = await import('../src/ui/issue-report.js');
    expect(mod.issuePrereqsMet({ docs: false, search: false })).toBe(false);
    expect(mod.issuePrereqsMet({ docs: true, search: true })).toBe(true);
    expect(mod.issuePrereqsMissing({ docs: false, search: true })).toEqual(['docs']);
  });

  it('buildIssueTemplateBody 生成模板章节一致的 Markdown', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const r = mod.parseIssueTemplates({ 'bug.yml': bugYml });
    const body = mod.buildIssueTemplateBody(r.templates[0],
      { summary: '崩了', runtime: 'A', privacy: ['已搜索'] },
      { prereqs: { docs: true, search: true }, docsUrl: 'https://d', searchUrl: 'https://s' });
    expect(body).toContain('### 问题摘要');
    expect(body).toContain('- [x] 已搜索');
    expect(body).toContain('### 提交前确认');
    expect(body).toContain('已查阅文档');
  });

  it('面板含模板选择、动态字段容器、前置勾选块与提交按钮 id', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    expect(html).toContain('data-setting="issueTemplate"');
    expect(html).toContain('id="issue-template-fields"');
    expect(html).toContain('data-setting="issuePrereqDocs"');
    expect(html).toContain('data-setting="issuePrereqSearch"');
    expect(html).toContain('id="issue-submit-btn"');
  });
});

/* 固定表单 → 模板字段映射：修复「问题摘要/复现步骤」章节全为 unavailable 的语义错位 */
describe('issue 报告 · 固定表单值合并到模板字段', () => {
  const bugYml = [
    'name: Bug 报告', 'description: 报告错误', 'title: "[Bug] "',
    'labels:', '  - bug', 'body:',
    '  - type: textarea', '    id: summary', '    attributes:',
    '      label: 问题摘要', '    validations:', '      required: true',
    '  - type: textarea', '    id: steps', '    attributes:',
    '      label: 复现步骤', '    validations:', '      required: true',
    '  - type: textarea', '    id: expected', '    attributes:',
    '      label: 期望结果', '    validations:', '      required: true',
  ].join('\n');

  const context = {
    prereqs: { docs: true, search: true },
    docsUrl: 'https://d',
    searchUrl: 'https://s',
  };

  // 取「### 章节标题」与下一个章节之间的正文，精确断言章节值而非整篇 contains。
  const sectionValue = (body, label) => {
    const marker = '### ' + label + '\n\n';
    const start = body.indexOf(marker);
    if (start < 0) return null;
    const rest = body.slice(start + marker.length);
    const end = rest.indexOf('\n### ');
    return (end < 0 ? rest : rest.slice(0, end)).trim();
  };

  it('settings-panel.js 把 description/steps 映射为模板 summary/steps，动态字段后置覆盖', async () => {
    const code = await read('src/ui/settings-panel.js');
    const summaryIdx = code.indexOf('summary: form.description');
    const stepsIdx = code.indexOf('steps: form.steps');
    const spreadIdx = code.indexOf('...(form.fieldValues || {})');
    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(stepsIdx).toBeGreaterThanOrEqual(0);
    expect(spreadIdx).toBeGreaterThanOrEqual(0);
    // 动态字段展开位于固定值之后 → 用户显式填写的值覆盖固定表单值。
    expect(spreadIdx).toBeGreaterThan(summaryIdx);
    expect(spreadIdx).toBeGreaterThan(stepsIdx);
  });

  it('动态字段留空：问题摘要/复现步骤取固定表单值，不再是 unavailable', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const parsed = mod.parseIssueTemplates({ 'bug.yml': bugYml });
    // 复现缺陷构造：固定表单填值 + 模板选 bug + 动态字段留空。
    const fieldValues = {};
    const mergedValues = { summary: '测试描述', steps: '测试步骤', ...fieldValues };
    const body = mod.buildIssueTemplateBody(parsed.templates[0], mergedValues, context);

    const summary = sectionValue(body, '问题摘要');
    const steps = sectionValue(body, '复现步骤');
    expect(summary).toBe('测试描述');
    expect(steps).toBe('测试步骤');
    expect(summary).not.toBe('unavailable');
    expect(steps).not.toBe('unavailable');
    // 固定表单无对应值的字段保持 unavailable（用户应在动态字段填）。
    expect(sectionValue(body, '期望结果')).toBe('unavailable');
  });

  it('动态字段显式填写时覆盖固定表单值（合并优先级）', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const parsed = mod.parseIssueTemplates({ 'bug.yml': bugYml });
    const mergedValues = {
      summary: '固定描述',
      steps: '固定步骤',
      ...{ summary: '动态摘要', steps: '动态步骤' },
    };
    const body = mod.buildIssueTemplateBody(parsed.templates[0], mergedValues, context);
    expect(sectionValue(body, '问题摘要')).toBe('动态摘要');
    expect(sectionValue(body, '复现步骤')).toBe('动态步骤');
  });
});

/* 审计补漏（安全敏感）：renderTemplateFields 拼接 yml 文案进 HTML，dom-injection-guard 对其放行。 */
describe('issue 模板字段渲染 · renderTemplateFields 全覆盖（安全敏感）', () => {
  // 五种 type 齐备，且 label / description / placeholder / options 均埋入 HTML 注入载荷。
  const xssYml = [
    'name: XSS 注入测试',
    'description: 模板描述',
    'title: "[XSS] "',
    'labels:',
    '  - audit',
    'body:',
    '  - type: textarea',
    '    id: ta_xss',
    '    attributes:',
    `      label: "<img src=x onerror=alert(1)>"`,
    `      description: "<script>alert(2)</script>"`,
    `      placeholder: 'p"onmouseover="alert(3)'`,
    '    validations:',
    '      required: true',
    '  - type: dropdown',
    '    id: dd_xss',
    '    attributes:',
    '      label: 下拉',
    '      options:',
    `        - 'a"b</option><script>alert(4)</script>'`,
    '    validations:',
    '      required: true',
    '  - type: input',
    '    id: in_xss',
    '    attributes:',
    '      label: 输入框',
    `      placeholder: "<svg onload=alert(5)>"`,
    '    validations:',
    '      required: true',
    '  - type: checkboxes',
    '    id: cb_xss',
    '    attributes:',
    '      label: 复选确认',
    '      options:',
    `        - label: 'x" onchange="alert(6)'`,
    '          required: true',
    '  - type: markdown',
    '    id: md_xss',
    '    attributes:',
    `      value: "<img src=z onerror=alert(7)>"`,
  ].join('\n');

  const render = async () => {
    const mod = await import('../src/ui/issue-report.js');
    const parsed = mod.parseIssueTemplates({ 'xss.yml': xssYml });
    expect(parsed.templates).toHaveLength(1);
    return { mod, tpl: parsed.templates[0], html: mod.renderTemplateFields(parsed.templates[0]) };
  };

  it('五种 type 各产出对应控件，可采集字段均带 data-issue-field', async () => {
    const { tpl, html } = await render();
    expect(tpl.body.map((f) => f.type)).toEqual([
      'textarea', 'dropdown', 'input', 'checkboxes', 'markdown',
    ]);
    expect(html).toMatch(/<textarea[^>]*data-issue-field="ta_xss"/);
    expect(html).toMatch(/<select[^>]*data-issue-field="dd_xss"/);
    expect(html).toMatch(/<input[^>]*type="text"[^>]*data-issue-field="in_xss"/);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*data-issue-field="cb_xss"/);
    // markdown 为只读提示块，实现上不挂 data-issue-field，按 class 断言其存在。
    expect(html).toContain('issue-tpl-markdown');
  });

  it('required 标记实测为 data-req="1"，仅出现在 textarea/dropdown/input', async () => {
    const { html } = await render();
    // 真源 src/ui/issue-report.js:789 —— field?.required ? ' data-req="1"' : ''
    expect((html.match(/data-req="1"/g) || []).length).toBe(3);
    expect(html).toMatch(/<textarea[^>]*data-req="1"/);
    expect(html).toMatch(/<select[^>]*data-req="1"/);
    expect(html).toMatch(/<input[^>]*type="text"[^>]*data-req="1"/);
    // checkboxes 的必填是可见星号文本，非 data-req 属性。
    expect(html).toContain(' *</label>');
  });

  it('XSS 关键：yml 的 label/description/placeholder 中裸标签被转义为实体', async () => {
    const { html } = await render();
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('&lt;svg onload=alert(5)&gt;');
    // 属性上下文：placeholder 内双引号被打断为实体，无法越出 value 边界。
    expect(html).toContain('placeholder="p&quot;onmouseover=&quot;alert(3)"');
  });

  it('options 的 value/label 含双引号与 </option> 时被正确转义', async () => {
    const { html } = await render();
    expect(html).not.toContain('</option><script>');
    expect(html).toContain('value="a&quot;b&lt;/option&gt;&lt;script&gt;alert(4)&lt;/script&gt;"');
    expect(html).toContain('value="x&quot; onchange=&quot;alert(6)"');
    // 正文与属性中的尖括号均已实体化，onerror/onchange 仅剩无害纯文本。
    expect(html).toContain('&gt;');
  });

  it('直接构造 template 对象（隔离解析器）：renderTemplateFields 自身逐字段转义', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const tpl = {
      body: [{
        type: 'textarea',
        id: 'direct',
        required: true,
        attributes: { label: payload, description: payload, placeholder: '"' + payload },
      }],
    };
    // 直接 import 被测函数，避开自研 YAML 解析器的边角行为干扰。
    return import('../src/ui/issue-report.js').then((mod) => {
      const html = mod.renderTemplateFields(tpl);
      expect(html).not.toContain('<img');
      expect((html.match(/&lt;img/g) || []).length).toBe(3);
      expect(html).toContain('data-req="1"');
    });
  });
});

/* 审计补漏：两条线跳转 URL 的真实拼接、编码与双 channel 取坐标。 */
describe('issue 跳转 URL · 真实拼接与编码（G-34 同源）', () => {
  const coords = {
    current: { owner: 'cur-owner', repo: 'cur-repo' },
    upstream: { owner: 'up-owner', repo: 'up-repo' },
  };

  it('buildIssueSearchUrl 拼 issues?q=is%3Aissue，关键词经 encodeURIComponent', async () => {
    const mod = await import('../src/ui/issue-report.js');
    // 真源签名：buildIssueSearchUrl(coords, keyword, key = 'current')
    const url = mod.buildIssueSearchUrl(coords, 'a b', 'current');
    expect(url).toContain('https://github.com/cur-owner/cur-repo/issues?q=');
    expect(url).toContain('is%3Aissue');
    expect(url).toContain('a%20b');
    expect(url).not.toContain('a b');
    expect(decodeURIComponent(url.slice(url.indexOf('?q=') + 3))).toBe('is:issue a b');
  });

  it('buildDocsRepoUrl 指向 current 坐标的 docs/DEVELOPER-GUIDE.md', async () => {
    const mod = await import('../src/ui/issue-report.js');
    // 真源签名：buildDocsRepoUrl(coords, key = 'current')
    expect(mod.buildDocsRepoUrl(coords, 'current'))
      .toBe('https://github.com/cur-owner/cur-repo/blob/main/docs/DEVELOPER-GUIDE.md');
  });

  it('传 upstream key 取上游坐标，与 current 得到不同 owner/repo', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const cur = mod.buildDocsRepoUrl(coords, 'current');
    const up = mod.buildDocsRepoUrl(coords, 'upstream');
    expect(cur).toContain('/cur-owner/cur-repo/');
    expect(up).toContain('/up-owner/up-repo/');
    expect(up).not.toBe(cur);
    expect(mod.buildIssueSearchUrl(coords, 'kw', 'upstream'))
      .toContain('https://github.com/up-owner/up-repo/issues?q=');
    // 指定 channel 无坐标仍返回空串，禁假数据。
    expect(mod.buildDocsRepoUrl({ upstream: null }, 'upstream')).toBe('');
  });
});

/* 审计补漏：预览 raw/渲染切换。issuePreviewBody/Toggle 为 index.js 闭包内函数，不可导入 → 方案 B。 */
describe('issue 预览 raw/渲染切换 · 方案 B 弱断言 + 渲染原语旁证', () => {
  it('[弱断言] index.js 闭包含 raw/rendered 两分支、标签切换与 accent 高亮接线', async () => {
    const code = await read('index.js');
    // 模块级模式状态与分支判定
    expect(code).toContain("let issuePreviewMode = 'raw'");
    expect(code).toContain("const rendered = issuePreviewMode === 'rendered'");
    // 两原语分流：原文逐字转义，渲染走安全 Markdown
    expect(code).toMatch(/rendered \? renderMarkdownSafe\(safe\) : escapeHtml\(safe\)/);
    // 标签与类名随模式切换
    expect(code).toContain("const tag = rendered ? 'div' : 'pre'");
    expect(code).toContain("'issue-report-preview issue-report-preview-rendered'");
    // 切换按钮 accent 随当前模式变化
    expect(code).toContain("issuePreviewMode === 'raw' ? 'btn accent' : 'btn'");
    expect(code).toContain("issuePreviewMode === 'rendered' ? 'btn accent' : 'btn'");
    // 点击仅重绘正文，且模式白名单校验
    expect(code).toContain("if (mode !== 'raw' && mode !== 'rendered') return;");
    expect(code).toContain('issuePreviewMode = mode;');
    expect(code).toContain('host.innerHTML = issuePreviewBody(safe)');
    expect(code).toContain("b.className = active ? 'btn accent' : 'btn';");
  });

  it('[旁证] 两底层原语行为确实不同：逐字转义 vs 安全 Markdown', async () => {
    const { escapeHtml } = await import('../src/ui/escape.js');
    expect(escapeHtml('<b>粗体</b>')).toBe('&lt;b&gt;粗体&lt;/b&gt;');
    expect(renderMarkdownSafe('<b>粗体</b>')).toContain('<p>');
    const md = renderMarkdownSafe('# H\n**B**');
    expect(md).toContain('<h1>H</h1>');
    expect(md).toContain('<strong>B</strong>');
  });
});

/* P0 护栏：新建 issue URL 长度上限 + 降级建议（向后兼容原 buildGitHubNewIssueUrl）。 */
describe('issue 跳转 URL · 长度护栏与降级建议（P0）', () => {
  const coords = { owner: 'o', repo: 'r', title: 't' };

  // 同源反推前缀长度：body='' 时 URL 长度即前缀，不硬编码魔法数（G-34）。
  const prefixLen = buildGitHubNewIssueUrl({ ...coords, body: '' }).length;
  const bodyFor = (targetLen) => 'a'.repeat(targetLen - prefixLen);

  it('阈值常量固定为 8000（GitHub 约 8KB 上限，留余量）', () => {
    expect(MAX_ISSUE_URL_LENGTH).toBe(8000);
  });

  it('正常长度 body → { ok: true, url }，url 为完整字符串', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const r = mod.buildGitHubNewIssueUrlSafe({ ...coords, body: 'hello world' });
    expect(r.ok).toBe(true);
    expect(typeof r.url).toBe('string');
    expect(r.url).toContain('https://github.com/o/r/issues/new?title=t&body=');
    expect(r.url).toContain('hello%20world');
    expect(r.reason).toBeUndefined();
    expect(r.length).toBeUndefined();
  });

  it('超长 body（10000 字符）→ ok:false / too-long / length>8000 / 降级建议 copy-markdown', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const r = mod.buildGitHubNewIssueUrlSafe({ ...coords, body: 'a'.repeat(10000) });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-long');
    expect(r.length).toBeGreaterThan(8000);
    expect(r.suggestion).toBe('copy-markdown');
    expect(r.url).toBeUndefined();
  });

  it('边界：URL 恰好 8000 → ok:true', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const body = bodyFor(8000);
    expect(mod.buildGitHubNewIssueUrl({ ...coords, body }).length).toBe(8000);
    const r = mod.buildGitHubNewIssueUrlSafe({ ...coords, body });
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('边界：URL 恰好 8001 → ok:false / too-long，length===8001', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const body = bodyFor(8001);
    expect(mod.buildGitHubNewIssueUrl({ ...coords, body }).length).toBe(8001);
    const r = mod.buildGitHubNewIssueUrlSafe({ ...coords, body });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-long');
    expect(r.length).toBe(8001);
  });

  it('无坐标 → ok:false / no-coords，length 0（不拼假 URL）', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const r = mod.buildGitHubNewIssueUrlSafe({ body: 'x' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-coords');
    expect(r.length).toBe(0);
  });

  it('向后兼容：原 buildGitHubNewIssueUrl 签名/返回类型不变，超长仍返回完整 string', async () => {
    const mod = await import('../src/ui/issue-report.js');
    const normal = mod.buildGitHubNewIssueUrl({ ...coords, body: 'x' });
    expect(typeof normal).toBe('string');
    expect(normal).toContain('https://github.com/o/r/issues/new?title=t&body=x');
    // 超长时原函数行为不变：仍返回完整 URL 字符串，不截断、不抛错。
    const longBody = 'a'.repeat(10000);
    const long = mod.buildGitHubNewIssueUrl({ ...coords, body: longBody });
    expect(typeof long).toBe('string');
    expect(long.length).toBeGreaterThan(8000);
    expect(long.endsWith(longBody)).toBe(true);
    // 无坐标仍返回空串。
    expect(mod.buildGitHubNewIssueUrl({})).toBe('');
  });
});
