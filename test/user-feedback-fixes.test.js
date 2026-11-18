import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { brandTokensOf, TARGET_UI } from '../src/data/target-ui.js';
import { UI_TOKENS } from '../src/data/ui-tokens.js';

describe('用户反馈专项修复验证', () => {
  const templatePath = new URL('../src/ui/workbench-template.js', import.meta.url);
  const viewPath = new URL('../src/ui/workbench-view.js', import.meta.url);
  const zhPath = new URL('../src/i18n/locales/zh-CN.js', import.meta.url);
  const enPath = new URL('../src/i18n/locales/en-US.js', import.meta.url);

  it('1. 云端仓库无跳转设置按钮，仅有纯文字指引', () => {
    const template = readFileSync(templatePath, 'utf8');
    expect(template).not.toContain('id="btn-cloud-to-settings"');
    expect(template).toContain('class="cloud-settings-guide"');
    expect(template).toContain('data-i18n="cloud.settingsGuide"');
  });

  it('2. 绝对禁止裸字段：全代码库无 zones.allPrefix 拼接残留', () => {
    const view = readFileSync(viewPath, 'utf8');
    expect(view).not.toContain('zones.allPrefix');
    expect(view).toContain('isTransferView ? t(\'zones.selTransferHintShort\') : t(\'zones.selDiffHintShort\')');
  });

  it('3. 扩展管理包内头部完全删除 pkgBar 显示当前选择包，保持只有一行', () => {
    const view = readFileSync(viewPath, 'utf8');
    expect(view).not.toContain('class="ext-pkg-bar"');
    expect(view).not.toContain('id="extmgr-package-select"');
    expect(view).not.toContain('class="ext-pkg-current');
  });

  it('4. 扩展管理包内具有正在读取状态及 i18n 定义', () => {
    const view = readFileSync(viewPath, 'utf8');
    expect(view).toContain('t(\'extmgr.readingPackage\')');
    const zh = readFileSync(zhPath, 'utf8');
    const en = readFileSync(enPath, 'utf8');
    expect(zh).toContain('extmgr.readingPackage');
    expect(en).toContain('extmgr.readingPackage');
  });

  it('5. 品牌色完全由 target-ui 与 ui-tokens 统一管理', () => {
    for (const host of ['st', 'luker', 'tt', 'pt']) {
      const tokens = brandTokensOf(host);
      expect(tokens).toBeDefined();
      expect(tokens.accent).toBe(`var(--brand-${host})`);
      expect(tokens.ink).toBe(`var(--brand-${host}-ink)`);
      expect(tokens.ring).toBe(`var(--brand-${host}-ring)`);
      expect(tokens.soft).toBe(`var(--brand-${host}-soft)`);
    }
  });

  it('6. 扫码关闭逻辑释放媒体流且具备 AbortSignal 支持', async () => {
    const qrModule = await import('../src/ui/qr.js');
    expect(typeof qrModule.scan).toBe('function');
    const view = readFileSync(viewPath, 'utf8');
    expect(view).toContain('releaseScanVideo');
    expect(view).toContain('lanScanAbortCtrl');
  });
});
