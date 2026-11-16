import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('铁律门禁：全 UI 绝对禁止重复语义按钮与非架构孤岛设计', () => {
  const templatePath = path.resolve(__dirname, '../src/ui/workbench-template.js');
  const viewPath = path.resolve(__dirname, '../src/ui/workbench-view.js');
  const cssPath = path.resolve(__dirname, '../style.css');

  it('铁律 1：扩展管理 tabs 中严禁包含独立的打包页签（打包归一为操作栏按钮）', () => {
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    expect(templateContent).not.toMatch(/data-exttab=["']pack["']/);
  });

  it('铁律 2：Git 视图顶部 headbar 严禁存在包含宿主全量扩展的 select 下拉框', () => {
    const viewContent = fs.readFileSync(viewPath, 'utf-8');
    // 严禁存在 <select ... id="git-viz-target">
    expect(viewContent).not.toMatch(/id=["']git-viz-target["']/);
    expect(viewContent).not.toMatch(/selectGitTargets\(installed,\s*installs\)\.map/);
  });

  it('铁律 3：宿主扩展列表中每一行严禁出现行级操作按钮（删除、更新、换位置）', () => {
    const viewContent = fs.readFileSync(viewPath, 'utf-8');
    // 严禁在 ext-ext-row 里渲染行级操作按钮容器 ext-row-actions
    expect(viewContent).not.toContain('ext-row-actions');
    // 严禁在行内放 data-extupdate、data-extremove、data-extmove
    expect(viewContent).not.toMatch(/<div class=["'][^"']*ext-ext-row[^"']*["'][\s\S]*?data-extremove=/);
    expect(viewContent).not.toMatch(/<div class=["'][^"']*ext-ext-row[^"']*["'][\s\S]*?data-extupdate=/);
    expect(viewContent).not.toMatch(/<div class=["'][^"']*ext-ext-row[^"']*["'][\s\S]*?data-extmove=/);
  });

  it('铁律 4：扩展管理的操作按钮全部收拢归一到顶部工具栏（更新、换目录、删除、打包唯一存在）', () => {
    const viewContent = fs.readFileSync(viewPath, 'utf-8');
    // 顶部唯一定义的操作按钮
    expect(viewContent).toContain('id="extmgr-batch-update"');
    expect(viewContent).toContain('id="extmgr-batch-remove"');
    expect(viewContent).toContain('id="extmgr-batch-move"');
    expect(viewContent).toContain('id="extmgr-batch-pack"');

    // 严禁在列表底部再放重复的导出清单按钮
    expect(viewContent).not.toContain('id="extmgr-export-selected"');
    expect(viewContent).not.toContain('ext-bottom-actions');
  });

  it('铁律 5：CSS 必须支持目标平台驱动主色，确保操作按钮颜色实时跟随当前选中的目标平台', () => {
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    // 断言必须存在针对 4 个目标平台的 --accent 定义，按钮颜色跟随目标平台实时变色
    expect(cssContent).toMatch(/#app\.app-container\[data-target-host=["']st["']\]\s*\{[^}]*--accent:/);
    expect(cssContent).toMatch(/#app\.app-container\[data-target-host=["']luker["']\]\s*\{[^}]*--accent:/);
    expect(cssContent).toMatch(/#app\.app-container\[data-target-host=["']tt["']\]\s*\{[^}]*--accent:/);
    expect(cssContent).toMatch(/#app\.app-container\[data-target-host=["']pt["']\]\s*\{[^}]*--accent:/);
  });

  it('铁律 6：设置项包含按清单自动安装与 Web 模式主题切换，且归一化正常', async () => {
    const { SETTINGS_DEFAULTS, normalizeSettings, TAVERN_THEMES } = await import('../src/ui/settings-panel.js');
    expect(SETTINGS_DEFAULTS.autoInstallManifestAfterUpload).toBe('prompt');
    expect(SETTINGS_DEFAULTS.webTheme).toBe('Dark Lite');
    expect(Object.keys(TAVERN_THEMES)).toContain('Dark Lite');
    expect(Object.keys(TAVERN_THEMES)).toContain('Azure');
    expect(Object.keys(TAVERN_THEMES)).toContain('Dark V 1.0');

    const s = normalizeSettings({ autoInstallManifestAfterUpload: 'auto', webTheme: 'Azure' });
    expect(s.autoInstallManifestAfterUpload).toBe('auto');
    expect(s.webTheme).toBe('Azure');
  });
});
