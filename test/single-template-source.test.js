import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_STANDALONE_IDS,
  REQUIRED_TEMPLATE_IDS,
  checkSingleTemplateSource,
} from '../scripts/single-template-source.js';
import { getWorkbenchHtml } from '../src/ui/workbench-template.js';

describe('单一模板源守卫', () => {
  const skeleton = `<!DOCTYPE html>
<html lang="zh-CN">
<body>
  <div class="app-container" id="app"></div>
  <script type="module" src="./index.js"></script>
</body>
</html>`;

  const fullTemplate = REQUIRED_TEMPLATE_IDS.map((id) => `<div id="${id}"></div>`).join('\n');

  it('允许 index.html 仅含骨架容器，且模板含全部业务节点', () => {
    const violations = checkSingleTemplateSource({ html: skeleton, template: fullTemplate });

    expect(violations).toEqual([]);
    expect(ALLOWED_STANDALONE_IDS.has('app')).toBe(true);
  });

  it.each([
    ['业务节点 id', '<div id="zone-body"></div>', 'zone-body', 1],
    ['业务控件 id', '<button id="btn-convert"></button>', 'btn-convert', 1],
    ['宿主原生类', '<button class="menu_button"></button>', 'menu_button', 1],
    ['折叠容器类', '<div class="inline-drawer"></div>', 'inline-drawer', 1],
  ])('当 index.html 出现%s时报告文件与行号', (_label, extra, id, expectedLineOffset) => {
    const html = `${skeleton}\n${extra}`;
    const violations = checkSingleTemplateSource({ html, template: fullTemplate });
    const target = violations.find((v) => v.id === id);

    expect(target).toBeDefined();
    expect(target.file).toBe('index.html');
    expect(target.line).toBeGreaterThanOrEqual(expectedLineOffset);
  });

  it('当模板缺失被 index.js 引用的节点时报告违规', () => {
    const template = fullTemplate.replace('<div id="zone-body"></div>', '');
    const violations = checkSingleTemplateSource({ html: skeleton, template });
    const target = violations.find((v) => v.id === 'zone-body');

    expect(target).toBeDefined();
    expect(target.file).toBe('src/ui/workbench-template.js');
    expect(target.message).toMatch(/缺少必需节点/);
  });

  it('仓库实况通过：index.html 为骨架，业务节点全部定义于模板', async () => {
    const [html, template] = await Promise.all([
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../src/ui/workbench-template.js', import.meta.url), 'utf8'),
    ]);

    const violations = checkSingleTemplateSource({ html, template });

    expect(violations).toEqual([]);
    // 反向断言：曾经的旧版副本节点不得复活
    expect(html).not.toContain('workspace-panel');
    expect(html).not.toContain('host-export-card');
    expect(html).not.toContain('btn-clear-workspace');
  });

  it('死开关不得复活：#incremental-mode-check 已移除（T4 取证确认其值从不被读取）', async () => {
    const [html, template] = await Promise.all([
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../src/ui/workbench-template.js', import.meta.url), 'utf8'),
    ]);

    // 它曾是一个「勾了却无任何行为」的复选框，且与「差量补丁」及恢复写入的
    // mode:'merge' 三者撞名。三个位置（模板 / REQUIRED_TEMPLATE_IDS / index.js 绑定）
    // 都已清除；任一复活都说明消歧被回退。
    expect(template).not.toContain('incremental-mode-check');
    expect(html).not.toContain('incremental-mode-check');
    expect(REQUIRED_TEMPLATE_IDS).not.toContain('incremental-mode-check');
  });
});

describe('双入口渲染一致性（R8.2 · 独立态 / 模态态）', () => {
  // 2026-10-15：插件态改挂全屏模态后，「抽屉态」这一支已无调用点，随之删除。
  // 现存两态：独立 Web 与插件态（同用模态模板），两者根容器都是 #app.app-container。
  const MODES = [
    ['独立态', { isStandalone: true }],
    ['模态态', { isModal: true }],
  ];

  // 三个入口必须由同一函数产出同一套业务节点，避免再次分歧成两份副本（L1-MR-10）
  it.each(MODES)('%s 渲染出全部必需业务节点 id', (_label, opts) => {
    const html = getWorkbenchHtml(opts);
    const missing = REQUIRED_TEMPLATE_IDS.filter((id) => !html.includes(`id="${id}"`));

    expect(missing).toEqual([]);
  });

  it('两态返回完全相同的 HTML；关闭按钮由独立态 CSS 隐藏', () => {
    expect(getWorkbenchHtml({ isStandalone: true })).toBe(getWorkbenchHtml({ isModal: true }));
    expect(getWorkbenchHtml()).toContain('id="btn-close"');
    expect(getWorkbenchHtml()).toContain('class="app-header"');
  });
});
