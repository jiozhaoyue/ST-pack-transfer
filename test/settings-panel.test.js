import { describe, expect, it } from 'vitest';
import {
  SETTINGS_DEFAULTS, buildSettingsHtml, normalizeSettings, readSettings,
} from '../src/ui/settings-panel.js';

function fakeRoot(values) {
  return {
    querySelector(selector) {
      const matchSetting = /data-setting="([^"]+)"/.exec(selector);
      if (matchSetting) return { checked: !!values[matchSetting[1]] };
      if (selector === '[data-setting-extmode].active') {
        return values.defaultExtensionMode ? { dataset: { settingExtmode: values.defaultExtensionMode } } : null;
      }
      if (selector === '[data-setting-gitmode]') {
        return values.defaultGitMode ? { value: values.defaultGitMode } : null;
      }
      return null;
    },
  };
}

describe('settings-panel 设置面板', () => {
  it('包含 3 个基础行为开关与导出默认偏好项', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    expect((html.match(/type="checkbox"/g) || []).length).toBe(4);
    expect(html).toContain('data-setting-extmode');
    expect(html).toContain('data-setting-gitmode');
  });

  it('从 DOM 读回设置与导出偏好', () => {
    expect(readSettings(fakeRoot({
      keepExport: false,
      trafficPrompt: true,
      autoTutorial: false,
      defaultExtensionMode: 'manifest',
      defaultGitMode: 'strip',
      defaultKeepDev: true,
    }))).toEqual({
      keepExport: false,
      trafficPrompt: true,
      autoTutorial: false,
      defaultExtensionMode: 'manifest',
      defaultGitMode: 'strip',
      defaultKeepDev: true,
    });
  });

  it('归一化非法值并回退默认值', () => {
    expect(normalizeSettings({ keepExport: 'x', trafficPrompt: false, defaultExtensionMode: 'invalid' }))
      .toEqual({
        ...SETTINGS_DEFAULTS,
        keepExport: true,
        trafficPrompt: false,
        autoTutorial: true,
        defaultExtensionMode: 'full',
      });
  });
});
