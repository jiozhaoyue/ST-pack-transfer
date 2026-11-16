import { describe, expect, it } from 'vitest';
import {
  SETTINGS_DEFAULTS, buildSettingsHtml, normalizeSettings, normalizeUpdateInterval, normalizeUpdateRules,
  readSettings, updateBackoffDelay, updatePolicyOf,
} from '../src/ui/settings-panel.js';

function fakeRoot(values) {
  return {
    querySelector(selector) {
      const matchSetting = /data-setting="([^"]+)"/.exec(selector);
      if (matchSetting) return { checked: !!values[matchSetting[1]] };
      return null;
    },
  };
}

describe('settings-panel 设置面板', () => {
  it('包含基础提示开关与导出清理项（打包选项不在设置页）', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    // 8 个行为开关 + 设置→数据 的 2 个凭据勾选（includeCreds / includeOauth）
    expect((html.match(/type="checkbox"/g) || []).length).toBe(11);
    expect(html).toContain('data-setting="deleteAfterExport"');
    expect(html).toContain('data-setting="logMaxEntries"');
    expect(html).toContain('data-setting="nativePullNotice"');
    // 自动更新已搬到宿主页每条扩展，设置页不再有相关开关
    expect(html).not.toContain('data-setting="devMode"');
    expect(html).not.toContain('data-setting="gitAutoUpdate"');
    expect(html).not.toContain('data-action="export-extensions"');
    expect(html).toContain('set-group');
  });

  it('从 DOM 读回设置项', () => {
    expect(readSettings(fakeRoot({
      deleteAfterExport: true,
      trafficPrompt: true,
      nativePullNotice: false,
      autoTutorial: false,
      showChangelogOnUpdate: true,
      clearLogOnLoad: true,
    }))).toEqual({
      ...SETTINGS_DEFAULTS,
      deleteAfterExport: true,
      trafficPrompt: true,
      nativePullNotice: false,
      autoTutorial: false,
      showChangelogOnUpdate: true,
      clearLogOnLoad: true,
      confirmDiscardChartPrefs: false,
    });
  });

  it('base 里的 Git 数据不被对话框默认值清空（回归：保存设置会丢账号）', () => {
    const base = {
      ...SETTINGS_DEFAULTS,
      gitAccounts: [{ id: 'acc-1', site: 'github', host: 'github.com', label: 'a', secret: 's', isDefault: true }],
      gitInstalls: [{ name: 'ST-x', url: 'https://github.com/o/ST-x', ref: 'main', at: 1 }],
      gitAutoUpdateRules: { 'ST-x': { mode: 'auto', intervalSec: 30 } },
      extOrder: ['ST-x'],
      extSort: 'name',
    };
    const out = readSettings(fakeRoot({ trafficPrompt: false }), base);
    expect(out.trafficPrompt).toBe(false);
    expect(out.gitAutoUpdateRules).toEqual({ 'ST-x': { mode: 'auto', intervalSec: 30 } });
    expect(out.extOrder).toEqual(['ST-x']);
    expect(out.extSort).toBe('name');
    expect(out.gitAccounts).toHaveLength(1);
    expect(out.gitInstalls).toHaveLength(1);
  });

  it('归一化非法值并回退默认值', () => {
    expect(normalizeSettings({ deleteAfterExport: 'x', trafficPrompt: false, logMaxEntries: 'bad' }))
      .toEqual({
        ...SETTINGS_DEFAULTS,
        trafficPrompt: false,
      });
  });
});

describe('逐扩展自动更新规则', () => {
  it('间隔夹在 5 秒到 1 天之间', () => {
    expect(normalizeUpdateInterval(1)).toBe(5);
    expect(normalizeUpdateInterval('7')).toBe(7);
    expect(normalizeUpdateInterval(999999)).toBe(86400);
    expect(normalizeUpdateInterval('bad')).toBe(300);
  });

  it('规则归一：只保留合法模式，间隔夹紧，忽略坏条目', () => {
    expect(normalizeUpdateRules({
      gitAutoUpdateRules: {
        'ST-a': { mode: 'auto', intervalSec: 5 },
        'ST-b': { mode: 'notify', intervalSec: 999999 },
        'ST-c': { mode: 'bogus', intervalSec: 30 },
        '': { mode: 'auto', intervalSec: 30 },
      },
    })).toEqual({
      'ST-a': { mode: 'auto', intervalSec: 5 },
      'ST-b': { mode: 'notify', intervalSec: 86400 },
    });
    expect(normalizeUpdateRules({})).toEqual({});
  });

  it('旧模型（参与集 + 全局小时/模式）一次性迁移到逐扩展规则', () => {
    expect(normalizeUpdateRules({
      gitUpdateSelected: ['ST-a', 'ST-b'],
      gitUpdateIntervalHours: 6,
      gitUpdateMode: 'auto',
    })).toEqual({
      'ST-a': { mode: 'auto', intervalSec: 21600 },
      'ST-b': { mode: 'auto', intervalSec: 21600 },
    });
  });

  it('策略全部来自设置：最短/最长/默认/退避倍数/退避上限/提醒超时都可调', () => {
    const policy = updatePolicyOf({
      ...SETTINGS_DEFAULTS,
      autoUpdateMinIntervalSec: 10,
      autoUpdateMaxIntervalSec: 600,
      autoUpdateDefaultIntervalSec: 120,
      autoUpdateFailureBackoff: 3,
      autoUpdateFailureBackoffMaxSec: 900,
      autoUpdateNotifyTimeoutSec: 4,
    });
    expect(policy).toEqual({
      min: 10, max: 600, fallback: 120, backoff: 3, backoffMaxSec: 900, notifyTimeoutSec: 4,
    });
    expect(normalizeUpdateInterval(1, policy)).toBe(10);
    expect(normalizeUpdateInterval(9999, policy)).toBe(600);
    expect(normalizeUpdateInterval('bad', policy)).toBe(120);
  });

  it('失败退避按倍数递增并在上限截断', () => {
    const policy = updatePolicyOf({
      ...SETTINGS_DEFAULTS,
      autoUpdateFailureBackoff: 2,
      autoUpdateFailureBackoffMaxSec: 3600,
    });
    expect(updateBackoffDelay(60, 0, policy)).toBe(60);
    expect(updateBackoffDelay(60, 1, policy)).toBe(120);
    expect(updateBackoffDelay(60, 2, policy)).toBe(240);
    expect(updateBackoffDelay(60, 10, policy)).toBe(3600);
  });

  it('自动更新策略已迁到扩展管理：设置面板不再提供这些输入', () => {
    const html = buildSettingsHtml(SETTINGS_DEFAULTS);
    for (const key of [
      'autoUpdateMinIntervalSec', 'autoUpdateMaxIntervalSec', 'autoUpdateDefaultIntervalSec',
      'autoUpdateFailureBackoff', 'autoUpdateFailureBackoffMaxSec', 'autoUpdateNotifyTimeoutSec',
    ]) {
      expect(html).not.toContain('data-setting="' + key + '"');
    }
  });

  it('readSettings 保留面板外的自动更新策略', () => {
    const out = readSettings({ querySelector: () => null }, {
      ...SETTINGS_DEFAULTS,
      autoUpdateMinIntervalSec: 9,
      autoUpdateNotifyTimeoutSec: 12,
    });
    expect(out.autoUpdateMinIntervalSec).toBe(9);
    expect(out.autoUpdateNotifyTimeoutSec).toBe(12);
  });
});
