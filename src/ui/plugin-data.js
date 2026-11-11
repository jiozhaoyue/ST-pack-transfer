/**
 * 整个插件的配置数据导入导出（不含数据包 / 产物 / 日志）。
 *
 * 收录：设置（含 Git 账号与安装登记）、图表偏好、图表布局、S3 与 WebDAV 配置。
 * 凭据默认不导出；勾选后也只带普通令牌，OAuth 令牌需要再勾一次才跟随。
 */
import { loadSettings, saveSettings } from './settings-store.js';
import { loadChartPrefs, saveChartPrefs } from './chart-prefs.js';

const EXTRA_KEYS = Object.freeze({
  layout: 'stpt.chartLayout',
  cloud: 'st-pack-transfer:s3',
  webdav: 'st-pack-transfer:webdav',
});

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const PLUGIN_DATA_KIND = 'stpt.plugin-data';

export function buildPluginData({ includeCredentials = false, includeOAuth = false } = {}) {
  const settings = loadSettings();
  const accounts = Array.isArray(settings.gitAccounts) ? settings.gitAccounts : [];
  const exportedAccounts = includeCredentials
    ? accounts
      .filter((a) => a.authKind !== 'oauth' || includeOAuth)
      .map((a) => ({
        site: a.site, baseUrl: a.baseUrl, host: a.host, username: a.username, label: a.label,
        authKind: a.authKind, isDefault: a.isDefault, createdAt: a.createdAt, secret: a.secret,
      }))
    : [];
  return {
    kind: PLUGIN_DATA_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    /** 未勾选凭据时不写 accounts 内容，导入端据此判定是否覆盖账号。 */
    includeCredentials,
    includeOAuth: includeCredentials && includeOAuth,
    settings: { ...settings, gitAccounts: exportedAccounts },
    chartPrefs: loadChartPrefs(),
    chartLayout: readJson(EXTRA_KEYS.layout),
    cloud: readJson(EXTRA_KEYS.cloud),
    webdav: readJson(EXTRA_KEYS.webdav),
  };
}

export function isPluginData(data) {
  return !!data && typeof data === 'object' && data.kind === PLUGIN_DATA_KIND;
}

/** 应用导入数据。账号只在导出明确包含凭据时覆盖，避免「没导凭据」被当成「清空账号」。 */
export function applyPluginData(data) {
  if (!isPluginData(data)) return { ok: false, reason: 'kind' };
  const incoming = data.settings && typeof data.settings === 'object' ? { ...data.settings } : {};
  if (data.includeCredentials !== true || !Array.isArray(incoming.gitAccounts)) {
    delete incoming.gitAccounts;
  }
  saveSettings({ ...loadSettings(), ...incoming });
  if (data.chartPrefs && typeof data.chartPrefs === 'object') saveChartPrefs(data.chartPrefs);
  writeJson(EXTRA_KEYS.layout, data.chartLayout ?? null);
  writeJson(EXTRA_KEYS.cloud, data.cloud ?? null);
  writeJson(EXTRA_KEYS.webdav, data.webdav ?? null);
  return {
    ok: true,
    accounts: Array.isArray(incoming.gitAccounts) ? incoming.gitAccounts.length : 0,
    hasCredentials: data.includeCredentials === true,
  };
}

export function downloadPluginData(data, name = 'stpt-plugin-data.json') {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
