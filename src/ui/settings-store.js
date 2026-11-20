/**
 * 设置持久化（localStorage 与宿主 settings.json 双层同步）
 *
 * 优先与宿主环境上下文 extension_settings['ST-pack-transfer'] 及 saveSettingsDebounced()
 * 联动，持久化至服务端的 settings.json；同时落盘 localStorage 作离线/独立态与极速初值双重保障。
 * 非法 JSON / 隐私模式 / Node 环境一律静默回落默认值，绝不阻塞主路径。
 */
import { SETTINGS_DEFAULTS, normalizeSettings } from './settings-panel.js';
import { getHostContext } from './host-bridge.js';

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
  /* 凭据存放位置：显式选择优先；否则若服务端已有账号，按 server 显示
     （否则旧用户在「默认仅浏览器」上线后会看到账号凭空消失）；都不是才用新默认 browser。
     browser 档只取本机副本，服务端那份是空壳、不可信。 */
  const explicitMode = (hostData && hostData.gitCredentialStorage)
    || (localData && localData.gitCredentialStorage);
  const hostAccounts = (hostData && Array.isArray(hostData.gitAccounts)) ? hostData.gitAccounts : [];
  merged.gitCredentialStorage = explicitMode || (hostAccounts.length ? 'server' : 'browser');
  if (merged.gitCredentialStorage === 'browser') {
    merged.gitAccounts = (localData && Array.isArray(localData.gitAccounts)) ? localData.gitAccounts : [];
  }

  /* S3 / WebDAV：同一套识别规则（服务端已有配置但本地没选过 → 按 server 显示）。 */
  const s3Explicit = (hostData && hostData.s3CredentialStorage) || (localData && localData.s3CredentialStorage);
  merged.s3CredentialStorage = s3Explicit || ((hostData && hostData.s3Config) ? 'server' : 'browser');
  if (merged.s3CredentialStorage === 'browser') merged.s3Config = null;

  const wdExplicit = (hostData && hostData.webdavCredentialStorage) || (localData && localData.webdavCredentialStorage);
  merged.webdavCredentialStorage = wdExplicit || ((hostData && hostData.webdavConfig) ? 'server' : 'browser');
  if (merged.webdavCredentialStorage === 'browser') merged.webdavConfig = null;

  return normalizeSettings(merged);
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  const s = storage();
  /* 本机始终保留完整副本：导出插件数据、离线下次启动都直接读它。 */
  if (s) {
    try {
      s.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* 隐私模式 / 配额不足：静默降级，不阻塞 */
    }
  }
  /* 服务端按各凭据自己的存放位置剥除：选「仅浏览器」的凭据绝不落 settings.json
     （2026-11-16 用户明令）。此前是无条件双写，服务端一直残留明文。 */
  const forHost = { ...normalized };
  if (normalized.gitCredentialStorage === 'browser') forHost.gitAccounts = [];
  if (normalized.s3CredentialStorage === 'browser') forHost.s3Config = null;
  if (normalized.webdavCredentialStorage === 'browser') forHost.webdavConfig = null;
  saveHostSettings(forHost);
  return normalized;
}
