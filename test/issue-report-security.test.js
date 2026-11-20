/**
 * 问题报告 · 安全专项测试（scout-D）。
 *
 * 聚焦两个零覆盖安全点：
 *  1) renderTemplateFields —— 把 yml 模板文案拼进 HTML；dom-injection-guard 对其 allow 放行，
 *     故必须单测证明所有插值经 escHtml 实体转义，绝不留下原生标签/可注入属性。
 *  2) 预览 raw/渲染切换 —— 逻辑在 index.js 闭包内，issue-report.js 无渲染预览导出纯函数，
 *     故只能弱断言 / 跳过，交主人裁定是否提取纯函数（见文末 test.skip）。
 * 另覆盖 collectReportEnv 的 file:// 脱敏（实现未落地，先跳过）与
 * buildGitHubNewIssueUrlSafe 的 reason 三分流边界。
 *
 * 注意：全部 import 取自真实导出 ../src/ui/issue-report.js，不改被测源码。
 */
import { describe, it, expect } from 'vitest';
import {
  renderTemplateFields,
  buildGitHubNewIssueUrlSafe,
  buildGitHubNewIssueUrl,
  MAX_ISSUE_URL_LENGTH,
  collectReportEnv,
} from '../src/ui/issue-report.js';

/* ---------------------------------------------------------------------------
 * 1. renderTemplateFields 转义安全
 * 直接构造 template 对象（绕开自研 YAML 解析器边角行为），隔离验证函数自身转义。
 * escHtml 真源 src/ui/issue-report.js:56-60 —— 覆盖 & < > " ' 五个字符。
 * ------------------------------------------------------------------------- */
describe('renderTemplateFields · 转义安全（安全敏感，dom-injection-guard 放行点）', () => {
  const PL = {
    script: '<script>alert(1)</script>',
    img: '<img src=x onerror=alert(2)>',
    quote: 'a" onmouseover="alert(3)',
    cn: '中文文案<安全测试>',
  };

  // 五种 type 全部埋入注入载荷：label / description / placeholder / options / markdown value。
  const tpl = {
    body: [
      {
        type: 'textarea', id: 'ta_x', required: true,
        attributes: { label: PL.script, description: PL.img, placeholder: PL.quote },
      },
      {
        type: 'dropdown', id: 'dd_x', required: true,
        attributes: { label: '下拉', options: [{ label: PL.quote }] },
      },
      {
        type: 'input', id: 'in_x',
        attributes: { label: PL.cn, placeholder: PL.img },
      },
      {
        type: 'checkboxes', id: 'cb_x',
        attributes: { label: '复选', options: [{ label: PL.img, required: true }] },
      },
      {
        type: 'markdown',
        attributes: { value: PL.script },
      },
    ],
  };

  it('恶意片段全部实体转义：无原生 <script>/<img> 标签存活', () => {
    const html = renderTemplateFields(tpl);
    // 原生尖括号标签一律不得出现。
    expect(html).not.toContain('<script');
    expect(html).not.toContain('</script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    // 被实体化的对应片段必须存在（逐字，证明是"转义"而非"丢弃"）。
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('中文文案&lt;安全测试&gt;');
  });

  it('属性上下文的双引号被打断为 &quot;，无法越出 value/placeholder 边界', () => {
    const html = renderTemplateFields(tpl);
    // PL.quote = a" onmouseover="alert(3) —— 引号实体后 onerror/onmouseover 仅剩纯文本。
    expect(html).toContain('a&quot; onmouseover=&quot;alert(3)');
    expect(html).not.toContain('placeholder="a" onmouseover=');
    expect(html).not.toContain('value="a" onmouseover=');
    // 所有尖括号均已实体化。
    expect((html.match(/&lt;/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('check markdown/option 分支：只读提示块与 option value 同样转义', () => {
    const html = renderTemplateFields(tpl);
    // markdown 分支输出在 ext-note issue-tpl-markdown 容器内。
    expect(html).toMatch(/class="ext-note issue-tpl-markdown">&lt;script&gt;/);
    // dropdown option 的 value 与文本均实体化。
    expect(html).toContain('value="a&quot; onmouseover=&quot;alert(3)"');
  });
});

/* ---------------------------------------------------------------------------
 * 2. renderTemplateFields 结构：必填/可选分支与字段计数
 * ------------------------------------------------------------------------- */
describe('renderTemplateFields · 结构与字段计数', () => {
  const tpl = {
    body: [
      { type: 'textarea', id: 'f_ta', required: true, attributes: { label: '摘要', placeholder: 'p' } },
      { type: 'input', id: 'f_in', attributes: { label: '输入' } }, // 可选
      {
        type: 'dropdown', id: 'f_dd', required: true,
        attributes: { label: '下拉', options: [{ label: 'A' }, { label: 'B' }] },
      },
      {
        type: 'checkboxes', id: 'f_cb',
        attributes: { label: '复选', options: [{ label: 'X', required: true }, { label: 'Y' }] },
      },
      { type: 'markdown', attributes: { value: '只读提示' } },
    ],
  };

  it('五种 type 各产出对应控件，markdown 为只读提示块', () => {
    const html = renderTemplateFields(tpl);
    expect(html).toMatch(/<textarea[^>]*data-issue-field="f_ta"/);
    expect(html).toMatch(/<input[^>]*type="text"[^>]*data-issue-field="f_in"/);
    expect(html).toMatch(/<select[^>]*data-issue-field="f_dd"/);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*data-issue-field="f_cb"/);
    expect(html).toContain('issue-tpl-markdown');
    expect(html).toContain('只读提示');
  });

  it('required 字段带 data-req="1"，可选字段不带；复选框必填为可见星号', () => {
    const html = renderTemplateFields(tpl);
    // 真源 src/ui/issue-report.js:841 —— field?.required ? ' data-req="1"' : ''
    // 本模板仅 textarea(f_ta) 与 dropdown(f_dd) 为 field 级 required。
    expect((html.match(/data-req="1"/g) || []).length).toBe(2);
    expect(html).toMatch(/<textarea[^>]*data-req="1"/);
    expect(html).toMatch(/<select[^>]*data-req="1"/);
    // input(f_in) 为可选，其标签段不得带 data-req。
    expect(html).toMatch(/<input[^>]*type="text"[^>]*data-issue-field="f_in"[^>]*>/);
    // checkboxes 的必填是 option 级可见星号，非 data-req。
    expect(html).toContain('X *</label>');
  });

  it('data-issue-field 计数 = 可采集控件数（markdown 不挂）', () => {
    const html = renderTemplateFields(tpl);
    // textarea(1) + input(1) + dropdown(1) + checkboxes 两个 option(2) = 5；markdown 无。
    expect((html.match(/data-issue-field=/g) || []).length).toBe(5);
  });

  it('空 body / 未知 type 产出空串，不抛错', () => {
    expect(renderTemplateFields({})).toBe('');
    expect(renderTemplateFields({ body: [] })).toBe('');
    expect(renderTemplateFields({ body: [{ type: 'unknown', id: 'u', attributes: { label: 'x' } }] })).toBe('');
  });
});

/* ---------------------------------------------------------------------------
 * 3. collectReportEnv 的 file:// 脱敏（另一个写手 scout-A 正在实现）
 * 当前实现 src/ui/issue-report.js:142-149 仅对 pageUrl 做 query/hash 截断，尚未脱敏本地路径。
 * 故先跳过；scout-A 落地 file:// → file:///[LOCAL]/<basename> 后取消 skip。
 * ------------------------------------------------------------------------- */
describe('collectReportEnv · file:// 本地路径脱敏（scout-A 已落地 redactPageUrl）', () => {
  it('file:///D:/Repo/secret/index.html → file:///[LOCAL]/index.html，不含盘符/本地目录', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: 'file:///D:/Repo/secret/index.html' },
    });
    try {
      const env = await collectReportEnv();
      // 真源 src/ui/issue-report.js:92-100 redactPageUrl：file:// 只留文件名，目录全抹掉。
      // 用精确 toBe 而非盘符正则——file:/// 本身含 `e:/`，正则会误命中。
      expect(env.pageUrl).toBe('file:///[LOCAL]/index.html');
      expect(env.pageUrl).not.toContain('D:/Repo');
      expect(env.pageUrl).not.toContain('secret');
    } finally {
      if (saved) Object.defineProperty(globalThis, 'location', saved);
      else delete globalThis.location;
    }
  });
});

/* ---------------------------------------------------------------------------
 * 4. buildGitHubNewIssueUrlSafe 的 reason 三分流（too-long / no-coords / ok）边界
 * 同源反推前缀长度，不硬编码魔法数（G-34）。
 * ------------------------------------------------------------------------- */
describe('buildGitHubNewIssueUrlSafe · reason 三分流与 8000 边界', () => {
  const coords = { owner: 'o', repo: 'r', title: 't' };
  const prefixLen = buildGitHubNewIssueUrl({ ...coords, body: '' }).length;
  const bodyFor = (targetLen) => 'a'.repeat(targetLen - prefixLen);

  it('阈值常量为 8000', () => {
    expect(MAX_ISSUE_URL_LENGTH).toBe(8000);
  });

  it('ok 分流：正常 body → { ok: true, url }，无 reason/length/suggestion', () => {
    const r = buildGitHubNewIssueUrlSafe({ ...coords, body: 'hello world' });
    expect(r.ok).toBe(true);
    expect(typeof r.url).toBe('string');
    expect(r.url).toContain('https://github.com/o/r/issues/new?title=t&body=');
    expect(r.url).toContain('hello%20world');
    expect(r.reason).toBeUndefined();
  });

  it('边界：URL 恰好 8000 → ok:true（阈值含等号，不误杀）', () => {
    const body = bodyFor(8000);
    expect(buildGitHubNewIssueUrl({ ...coords, body }).length).toBe(8000);
    const r = buildGitHubNewIssueUrlSafe({ ...coords, body });
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('边界：URL 恰好 8001 → ok:false / reason=too-long / length=8001 / suggestion=copy-markdown', () => {
    const body = bodyFor(8001);
    expect(buildGitHubNewIssueUrl({ ...coords, body }).length).toBe(8001);
    const r = buildGitHubNewIssueUrlSafe({ ...coords, body });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-long');
    expect(r.length).toBe(8001);
    expect(r.suggestion).toBe('copy-markdown');
    expect(r.url).toBeUndefined();
  });

  it('远超阈值（10000 body）同样 too-long 且不返回假 URL', () => {
    const r = buildGitHubNewIssueUrlSafe({ ...coords, body: 'a'.repeat(10000) });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-long');
    expect(r.length).toBeGreaterThan(8000);
    expect(r.url).toBeUndefined();
  });

  it('no-coords 分流：无坐标 → ok:false / reason=no-coords / length=0（不拼假 URL）', () => {
    const r = buildGitHubNewIssueUrlSafe({ body: 'x' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-coords');
    expect(r.length).toBe(0);
    expect(r.url).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
 * 5. 预览 raw/渲染切换的弱断言
 * 已 grep src/ui/issue-report.js 全部导出（见任务书）：无渲染预览相关纯函数导出
 * （唯一相近的 previewRedacted 是脱敏，非渲染）。渲染原语 renderMarkdownSafe 在
 * settings-panel.js:585、escapeHtml 在 escape.js:22；切换主体 issuePreviewBody/Toggle
 * 是 index.js:2430-2498 闭包内函数，不可 import，且任务书禁止为测试改 index.js。
 * 故按约定跳过，交主人裁定是否提取可测纯函数。
 * ------------------------------------------------------------------------- */
describe.skip('预览 raw/渲染切换 · 闭包内不可测（需主人裁定是否提函数）', () => {
  it('renderMarkdownSafe 与 escapeHtml 两原语行为差异（待提取纯函数后启用）', async () => {
    const { renderMarkdownSafe } = await import('../src/ui/settings-panel.js');
    const { escapeHtml } = await import('../src/ui/escape.js');
    const src = '# 标题\n<img src=x onerror=alert(1)>';
    expect(escapeHtml(src)).not.toContain('<h1>');
    expect(renderMarkdownSafe(src)).toContain('<h1>标题</h1>');
    expect(renderMarkdownSafe(src)).not.toContain('<img');
  });
});
