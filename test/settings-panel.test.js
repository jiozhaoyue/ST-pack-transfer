import { describe, expect, it } from 'vitest';
import {
  SETTINGS_DEFAULTS, buildSettingsHtml, normalizeSettings, readSettings,
} from '../src/ui/settings-panel.js';

function fakeRoot(values) {
  return {
    querySelector(selector) {
      const match = /data-setting="([^"]+)"/.exec(selector);
      if (!match) return null;
      return { checked: !!values[match[1]] };
    },
  };
}

describe('settings-panel 设置面板', () => {
  it('恰好 3 个开关，不含 git / 压缩 / 扩展包 / 构建 / 备份 / 缓存 / 私有 / 清理', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    expect((html.match(/type="checkbox"/g) || []).length).toBe(3);
    expect(html).not.toMatch(/git|压缩|扩展包|构建|backups|缓存|私有|清理/i);
  });

  it('从 DOM 读回 3 个开关', () => {
    expect(readSettings(fakeRoot({ keepExport: false, trafficPrompt: true, autoTutorial: false })))
      .toEqual({ keepExport: false, trafficPrompt: true, autoTutorial: false });
  });

  it('归一忽略非布尔值', () => {
    expect(normalizeSettings({ keepExport: 'x', trafficPrompt: false }))
      .toEqual({ keepExport: true, trafficPrompt: false, autoTutorial: true });
  });
});
