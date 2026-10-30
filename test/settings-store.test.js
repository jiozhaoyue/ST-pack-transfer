import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXTENSION_SETTINGS_KEY, SETTINGS_STORAGE_KEY, loadHostSettings,
  loadSettings, saveHostSettings, saveSettings,
} from '../src/ui/settings-store.js';
import { SETTINGS_DEFAULTS } from '../src/ui/settings-panel.js';

function mockStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
  return map;
}

describe('settings-store 持久化', () => {
  beforeEach(() => {
    mockStorage();
    delete globalThis.SillyTavern;
    delete globalThis.extension_settings;
    delete globalThis.saveSettingsDebounced;
    delete globalThis.saveSettings;
  });

  it('无存档返回默认值', () => {
    expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it('保存后读回', () => {
    saveSettings({
      keepExport: false,
      trafficPrompt: false,
      autoTutorial: true,
      defaultExtensionMode: 'manifest',
      defaultGitMode: 'strip',
      defaultKeepDev: true,
    });
    expect(loadSettings()).toEqual({
      keepExport: false,
      trafficPrompt: false,
      autoTutorial: true,
      defaultExtensionMode: 'manifest',
      defaultGitMode: 'strip',
      defaultKeepDev: true,
    });
  });

  it('只持久化白名单键，多余打包选项不落盘', () => {
    saveSettings({ keepExport: false, compression: '9', invalidKey: 'strip' });
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    expect(Object.keys(raw).sort()).toEqual(Object.keys(SETTINGS_DEFAULTS).sort());
  });

  it('非法 JSON 回默认', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{bad');
    expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it('非布尔值忽略', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      keepExport: 'no', trafficPrompt: 0, autoTutorial: null,
    }));
    expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  describe('宿主后端 settings.json (extension_settings) 联动', () => {
    it('saveSettings 同步写入宿主 extensionSettings 并触发 saveSettingsDebounced', () => {
      const extSettings = {};
      const debouncedSpy = vi.fn();
      globalThis.SillyTavern = {
        getContext: () => ({
          extensionSettings: extSettings,
          saveSettingsDebounced: debouncedSpy,
        }),
      };

      saveSettings({
        keepExport: false,
        trafficPrompt: false,
        autoTutorial: true,
        defaultExtensionMode: 'manifest',
        defaultGitMode: 'strip',
        defaultKeepDev: true,
      });

      expect(debouncedSpy).toHaveBeenCalledTimes(1);
      expect(extSettings[EXTENSION_SETTINGS_KEY]).toEqual({
        keepExport: false,
        trafficPrompt: false,
        autoTutorial: true,
        defaultExtensionMode: 'manifest',
        defaultGitMode: 'strip',
        defaultKeepDev: true,
      });
      // 确认 localStorage 亦有备份
      const local = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
      expect(local.defaultExtensionMode).toBe('manifest');
    });

    it('loadSettings 优先使用宿主后端的 extension_settings 真源', () => {
      const extSettings = {
        [EXTENSION_SETTINGS_KEY]: {
          keepExport: false,
          trafficPrompt: false,
          autoTutorial: false,
          defaultExtensionMode: 'manifest',
          defaultGitMode: 'strip',
          defaultKeepDev: true,
        },
      };
      globalThis.SillyTavern = {
        getContext: () => ({
          extensionSettings: extSettings,
        }),
      };

      // localStorage 即使存了旧值，也由宿主真源优先覆盖
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        ...SETTINGS_DEFAULTS,
        keepExport: true,
      }));

      const loaded = loadSettings();
      expect(loaded.keepExport).toBe(false);
      expect(loaded.defaultExtensionMode).toBe('manifest');
      expect(loaded.defaultGitMode).toBe('strip');
    });

    it('宿主缺少某些配置键时平滑回退 localStorage 与默认值', () => {
      globalThis.SillyTavern = {
        getContext: () => ({
          extensionSettings: {
            [EXTENSION_SETTINGS_KEY]: {
              defaultExtensionMode: 'manifest',
            },
          },
        }),
      };

      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        trafficPrompt: false,
      }));

      const loaded = loadSettings();
      expect(loaded.defaultExtensionMode).toBe('manifest');
      expect(loaded.trafficPrompt).toBe(false);
      expect(loaded.keepExport).toBe(true); // 回退默认值
    });
  });
});
