// T6: 标准 ST/Luker 扩展结构与清单冒烟测试
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

describe('SillyTavern 标准插件工程结构 (ST-pack-transfer)', () => {
  it('根目录包含合规的 manifest.json', async () => {
    expect(existsSync('manifest.json')).toBe(true);
    const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
    expect(manifest.name).toBe('ST-pack-transfer');
    expect(manifest.display_name).toBe('数据包转运');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.author).toBe('jiozhaoyue');
    expect(manifest.js).toBe('index.js');
    expect(manifest.css).toBe('style.css');
  });

  it('根目录包含标准的 index.html 与 style.css', async () => {
    expect(existsSync('index.html')).toBe(true);
    expect(existsSync('style.css')).toBe(true);

    const html = await readFile('index.html', 'utf8');
    expect(html).toContain('ST-pack-transfer');
    expect(html).toContain('<link rel="stylesheet" href="./style.css">');
    expect(html).toContain('<script type="module" src="./index.js"></script>');
  });

  it('根目录 index.js 存在且包含模态工作台与宿主自适应启动能力', async () => {
    expect(existsSync('index.js')).toBe(true);
    const code = await readFile('index.js', 'utf8');
    expect(code).toContain('import');
    expect(code).toContain('convert');
    expect(code).toContain('detectHost');
    expect(code).toContain('openConverterModal');
    expect(code).toContain('mountExtensionRowButton');
  });

  it('设置弹窗只提供 3 个行为开关；打包选项不在设置页（index.html 仅为骨架）', async () => {
    const src = await readFile('index.js', 'utf8');
    // 旧契约已推翻：Git / 扩展 / 构建 / 压缩 / backups / 缓存 / 私有 / 清理不得回到设置页
    for (const legacy of [
      'set-extension-mode', 'set-keep-dev', 'set-git-mode', 'set-compression',
      'set-include-backups', 'set-include-cache', 'set-include-private', 'set-prune-builtin',
    ]) {
      expect(src, `设置页不得再出现 ${legacy}`).not.toContain(legacy);
    }

    const panelSrc = await readFile('src/ui/settings-panel.js', 'utf8');
    for (const key of ['keepExport', 'trafficPrompt', 'autoTutorial']) {
      expect(panelSrc).toContain(key);
    }
    const { buildSettingsHtml } = await import('../src/ui/settings-panel.js');
    const settingsHtml = buildSettingsHtml({});
    expect((settingsHtml.match(/type="checkbox"/g) || []).length).toBe(3);
    expect(settingsHtml).not.toMatch(/git|扩展包|构建配置|backups|派生缓存|清理/i);

    // 反向断言：index.html 不得出现这些业务节点（防回归成两份副本）
    const html = await readFile('index.html', 'utf8');
    expect(html).not.toContain('set-extension-mode');
    expect(html).not.toContain('set-keep-dev');
  });

  it('打包选项回到图表：扩展/清单切换、Git 仅完整显示、压缩在顶部', async () => {
    const view = await readFile('src/ui/workbench-view.js', 'utf8');
    expect(view).toContain('data-extmode');
    expect(view).toContain('data-gitmode');
    expect(view).toContain('data-keepdev');
    expect(view).toContain('data-suball');
    expect(view).toContain('extension-tools');
    expect(view).toContain('EXTENSION_MODES.MANIFEST');

    const tpl = await readFile('src/ui/workbench-template.js', 'utf8');
    expect(tpl).toContain('compression-select');

    const model = await readFile('src/core/chart-model.js', 'utf8');
    expect(model).toContain('deriveExportOptions');
    expect(model).toContain('chartTreeFor');
    expect(model).toContain('group:native');
  });

  it('host-bridge 导出了 discoverHostExtensions, installExtensionViaHost, checkHostThirdPartyAnomaly, deleteExtensionViaHost 与 mountExtensionRowButton', async () => {
    const bridge = await import('../src/ui/host-bridge.js');
    const {
      discoverHostExtensions,
      installExtensionViaHost,
      renderExtensionInstallerModal,
      checkHostThirdPartyAnomaly,
      deleteExtensionViaHost,
      mountExtensionRowButton,
      mountNativeBackupButton,
      mountLukerBackupManagerButton,
    } = bridge;
    expect(typeof discoverHostExtensions).toBe('function');
    expect(typeof installExtensionViaHost).toBe('function');
    expect(typeof renderExtensionInstallerModal).toBe('function');
    expect(typeof checkHostThirdPartyAnomaly).toBe('function');
    expect(typeof deleteExtensionViaHost).toBe('function');
    expect(typeof mountExtensionRowButton).toBe('function');
    expect(typeof mountNativeBackupButton).toBe('function');
    expect(typeof mountLukerBackupManagerButton).toBe('function');
    // R1.3：扩展菜单（顶栏魔方棒）入口已删除，不得再导出
    expect(bridge.registerMenuButton).toBeUndefined();

    // PT / TT 平台自适应：原生支持 third-party，不应报告异常
    const ptCheck = await checkHostThirdPartyAnomaly('pt');
    expect(ptCheck.hasAnomaly).toBe(false);
    const ttCheck = await checkHostThirdPartyAnomaly('tt');
    expect(ttCheck.hasAnomaly).toBe(false);
  });
});
