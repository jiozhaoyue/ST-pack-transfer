/**
 * 设置持久化（localStorage 与宿主 settings.json 双层同步）
 *
 * 优先与宿主环境上下文 extension_settings['ST-pack-transfer'] 及 saveSettingsDebounced()
 * 联动，持久化至服务端的 settings.json；同时落盘 localStorage 作离线/独立态与极速初值双重保障。
 * 非法 JSON / 隐私模式 / Node 环境一律静默回落默认值，绝不阻塞主路径。
 */
import { SETTINGS_DEFAULTS, normalizeSettings } from './settings-panel.js';

export const SETTINGS_STORAGE_KEY = 'st-pack-transfer:settings';
export const EXTENSION_SETTINGS_KEY = 'ST-pack-transfer';
export const EXTENSION_SETTINGS_ALT_KEY = 'st-pack-transfer';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function getHostContext() {
  try {
    const st = globalThis.SillyTavern;
    return st && typeof st.getContext === 'function' ? st.getContext() : null;
  } catch {
    return null;
  }
}

function getHostExtensionBucket() {
  try {
    const ctx = getHostContext();
    if (ctx && typeof ctx === 'object') {
      if (ctx.extensionSettings && typeof ctx.extensionSettings === 'object') {
        return ctx.extensionSettings;
      }
      if (ctx.extension_settings && typeof ctx.extension_settings === 'object') {
        return ctx.extension_settings;
      }
    }
    if (typeof globalThis !== 'undefined' && globalThis.extension_settings && typeof globalThis.extension_settings === 'object') {
      return globalThis.extension_settings;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadHostSettings() {
  const bucket = getHostExtensionBucket();
  if (!bucket) return null;
  const raw = bucket[EXTENSION_SETTINGS_KEY] ?? bucket[EXTENSION_SETTINGS_ALT_KEY];
  return raw && typeof raw === 'object' ? raw : null;
}

export function saveHostSettings(normalized) {
  try {
    const bucket = getHostExtensionBucket();
    if (bucket && typeof bucket === 'object') {
      bucket[EXTENSION_SETTINGS_KEY] = { ...normalized };
      bucket[EXTENSION_SETTINGS_ALT_KEY] = { ...normalized };
    }
    const ctx = getHostContext();
    if (typeof ctx?.saveSettingsDebounced === 'function') {
      ctx.saveSettingsDebounced();
      return true;
    }
    if (typeof ctx?.saveSettings === 'function') {
      ctx.saveSettings();
      return true;
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.saveSettingsDebounced === 'function') {
      globalThis.saveSettingsDebounced();
      return true;
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.saveSettings === 'function') {
      globalThis.saveSettings();
      return true;
    }
    return false;
  } catch {
    /* 离线 / 独立态静默降级 */
    return false;
  }
}

export function loadSettings() {
  let localData = null;
  const s = storage();
  if (s) {
    try {
      const raw = s.getItem(SETTINGS_STORAGE_KEY);
      if (raw) localData = JSON.parse(raw);
    } catch {
      localData = null;
    }
  }

  const hostData = loadHostSettings();

  const merged = {
    ...SETTINGS_DEFAULTS,
    ...(localData && typeof localData === 'object' ? localData : {}),
    ...(hostData && typeof hostData === 'object' ? hostData : {}),
  };

  return normalizeSettings(merged);
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  const s = storage();
  if (s) {
    try {
      s.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* 隐私模式 / 配额不足：静默降级，不阻塞 */
    }
  }
  saveHostSettings(normalized);
  return normalized;
}
