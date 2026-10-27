import { beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY, loadSettings, saveSettings } from '../src/ui/settings-store.js';
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
  });

  it('无存档返回默认值', () => {
    expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it('保存后读回', () => {
    saveSettings({ keepExport: false, trafficPrompt: false, autoTutorial: true });
    expect(loadSettings()).toEqual({ keepExport: false, trafficPrompt: false, autoTutorial: true });
  });

  it('只持久化 3 个白名单键，打包选项不落盘', () => {
    saveSettings({ keepExport: false, compression: '9', gitMode: 'strip' });
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    expect(Object.keys(raw).sort()).toEqual(['autoTutorial', 'keepExport', 'trafficPrompt']);
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
});
