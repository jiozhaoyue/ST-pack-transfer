/**
 * 设置持久化（localStorage）
 *
 * 只持久化 settings-panel 的 3 个布尔开关；非法 JSON / 隐私模式 / Node 环境
 * 一律静默回落默认值，绝不阻塞主路径。
 */
import { SETTINGS_DEFAULTS, normalizeSettings } from './settings-panel.js';

export const SETTINGS_STORAGE_KEY = 'st-pack-transfer:settings';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSettings() {
  const s = storage();
  if (!s) return { ...SETTINGS_DEFAULTS };
  try {
    const raw = s.getItem(SETTINGS_STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
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
  return normalized;
}
