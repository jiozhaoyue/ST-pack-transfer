/**
 * 设置面板（唯一源）
 *
 * 只承载「面板行为」类开关；打包选项（压缩/扩展/Git/构建/backups/缓存/私有/原生资产）
 * 属于图表选择面，不得回到这里。
 */
import { t } from '../i18n/index.js';
import { normalizeAccounts } from '../core/git-accounts.js';

/** 设置默认值。新增项必须同步 zh-CN / en-US 文案与测试。 */
export const SETTINGS_DEFAULTS = Object.freeze({
  trafficPrompt: true,
  /** 点「从宿主拉取」时是否先提示「去原生界面点拉取」；默认每次提醒。 */
  nativePullNotice: true,
  autoTutorial: true,
  /** 下载导出区里的包后是否把它从导出区删除；默认不删。 */
  deleteAfterExport: false,
  /** 日志上限（条）；0/非法回落默认。 */
  logMaxEntries: 500,
  /** 每次加载插件是否清空上次日志。 */
  clearLogOnLoad: true,
  /** 每次加载插件是否清空浏览器里暂存的数据包（IndexedDB files + OPFS packages）。 */
  clearPackagesOnLoad: false,
  /** 上传恢复成功后是否自动刷新页面；默认关闭（用户 2026-11-11 裁定）。 */
  autoRefreshAfterUpload: false,
  /** 退出数据包偏好时若有未保存改动先提醒；默认开启。 */
  confirmDiscardChartPrefs: true,
  /** Git 凭据存储位置：server = 随宿主 extension_settings 落 settings.json；browser = 只存本机。 */
  gitCredentialStorage: 'server',
  /** Git 账号（结构见 src/core/git-accounts.js）。 */
  gitAccounts: [],
  /** 安装来源登记（更新检查用）：{name, url, ref, at}。 */
  gitInstalls: [],
  /** 开发模式自动更新：{扩展名: 'silent' | 'prompt'}；缺省即关闭。 */
  gitDevMode: {},
});

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS_DEFAULTS));

/** 白名单归一：只保留已知键，非法/缺省回默认。 */
export function normalizeSettings(input) {
  const out = { ...SETTINGS_DEFAULTS };
  if (input && typeof input === 'object') {
    if (typeof input.trafficPrompt === 'boolean') out.trafficPrompt = input.trafficPrompt;
    if (typeof input.nativePullNotice === 'boolean') out.nativePullNotice = input.nativePullNotice;
    if (typeof input.autoTutorial === 'boolean') out.autoTutorial = input.autoTutorial;
    if (typeof input.deleteAfterExport === 'boolean') out.deleteAfterExport = input.deleteAfterExport;
    const logMax = Number(input.logMaxEntries);
    if (Number.isFinite(logMax)) out.logMaxEntries = Math.max(50, Math.min(5000, Math.round(logMax)));
    if (typeof input.clearLogOnLoad === 'boolean') out.clearLogOnLoad = input.clearLogOnLoad;
    if (typeof input.clearPackagesOnLoad === 'boolean') out.clearPackagesOnLoad = input.clearPackagesOnLoad;
    if (typeof input.autoRefreshAfterUpload === 'boolean') out.autoRefreshAfterUpload = input.autoRefreshAfterUpload;
    if (typeof input.confirmDiscardChartPrefs === 'boolean') out.confirmDiscardChartPrefs = input.confirmDiscardChartPrefs;
    if (input.gitCredentialStorage === 'browser' || input.gitCredentialStorage === 'server') {
      out.gitCredentialStorage = input.gitCredentialStorage;
    }
    if (Array.isArray(input.gitAccounts)) out.gitAccounts = normalizeAccounts(input.gitAccounts);
    if (Array.isArray(input.gitInstalls)) {
      out.gitInstalls = input.gitInstalls
        .filter((x) => x && typeof x === 'object' && typeof x.name === 'string' && x.name)
        .map((x) => ({
          name: String(x.name),
          url: typeof x.url === 'string' ? x.url : '',
          ref: typeof x.ref === 'string' ? x.ref : '',
          at: Number(x.at) || 0,
        }));
    }
    if (input.gitDevMode && typeof input.gitDevMode === 'object') {
      const modes = {};
      for (const [name, mode] of Object.entries(input.gitDevMode)) {
        if (name && (mode === 'silent' || mode === 'prompt')) modes[String(name)] = mode;
      }
      out.gitDevMode = modes;
    }
  }
  return out;
}

function setting(id, key, label, checked) {
  return `<label class="check"><input type="checkbox" id="${id}" data-setting="${key}"${checked ? ' checked' : ''}> ${label}</label>`;
}

/** 设置弹窗正文：分组可收起，不再全部平铺。 */
export function buildSettingsHtml(settings = {}) {
  const s = normalizeSettings(settings);
  const group = (key, title, body, open) => '<details class="set-group" data-group="' + key + '"' + (open ? ' open' : '') + '>'
    + '<summary class="set-group-head">' + title + '</summary>'
    + '<div class="set-group-body">' + body + '</div></details>';

  const tips = setting('set-traffic', 'trafficPrompt', t('settings.trafficPrompt'), s.trafficPrompt)
    + setting('set-native-pull-notice', 'nativePullNotice', t('settings.nativePullNotice'), s.nativePullNotice)
    + setting('set-auto-tutorial', 'autoTutorial', t('settings.autoTutorial'), s.autoTutorial)
    + setting('set-confirm-discard-prefs', 'confirmDiscardChartPrefs', t('settings.confirmDiscardChartPrefs'), s.confirmDiscardChartPrefs);

  const exportGroup = setting('set-delete-after-export', 'deleteAfterExport', t('settings.deleteAfterExport'), s.deleteAfterExport)
    + setting('set-clear-packages', 'clearPackagesOnLoad', t('settings.clearPackagesOnLoad'), s.clearPackagesOnLoad)
    + setting('set-auto-refresh', 'autoRefreshAfterUpload', t('settings.autoRefreshAfterUpload'), s.autoRefreshAfterUpload);

  const logging = '<label class="et-git"><span>' + t('settings.logMaxEntries') + '</span>'
    + '<input class="text_pole" type="number" min="50" max="5000" step="50" data-setting="logMaxEntries" value="' + s.logMaxEntries + '"></label>'
    + setting('set-clear-log', 'clearLogOnLoad', t('settings.clearLogOnLoad'), s.clearLogOnLoad);

  const dataGroup = '<div class="ext-row">'
      + '<button type="button" class="btn" data-action="plugin-export">' + t('settings.exportData') + '</button>'
      + '<button type="button" class="btn" data-action="plugin-import">' + t('settings.importData') + '</button>'
    + '</div>'
    + '<label class="check"><input type="checkbox" id="set-include-creds" checked> ' + t('settings.includeCreds') + '</label>'
    + '<label class="check check-sub"><input type="checkbox" id="set-include-oauth"> ' + t('settings.includeOauth') + '</label>'
    + '<div class="ext-note">' + t('settings.dataNote') + '</div>';

  return '<div class="settings-grid">'
    + group('behavior', t('settings.groupBehavior'), tips, true)
    + group('export', t('settings.groupExport'), exportGroup, true)
    + group('log', t('settings.groupLog'), logging, false)
    + group('data', t('settings.groupData'), dataGroup, false)
    + '</div>';
}

/** 从弹窗 DOM 读回开关与选项；缺失项保持默认。 */
export function readSettings(root) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!root) return out;
  const trafficEl = root.querySelector?.('[data-setting="trafficPrompt"]');
  if (trafficEl && typeof trafficEl.checked === 'boolean') out.trafficPrompt = trafficEl.checked;
  const nativePullEl = root.querySelector?.('[data-setting="nativePullNotice"]');
  if (nativePullEl && typeof nativePullEl.checked === 'boolean') out.nativePullNotice = nativePullEl.checked;
  const tutorialEl = root.querySelector?.('[data-setting="autoTutorial"]');
  if (tutorialEl && typeof tutorialEl.checked === 'boolean') out.autoTutorial = tutorialEl.checked;
  const confirmDiscardEl = root.querySelector?.('[data-setting="confirmDiscardChartPrefs"]');
  if (confirmDiscardEl && typeof confirmDiscardEl.checked === 'boolean') out.confirmDiscardChartPrefs = confirmDiscardEl.checked;
  const deleteEl = root.querySelector?.('[data-setting="deleteAfterExport"]');
  if (deleteEl && typeof deleteEl.checked === 'boolean') out.deleteAfterExport = deleteEl.checked;

  const logMaxEl = root.querySelector?.('[data-setting="logMaxEntries"]');
  if (logMaxEl?.value) out.logMaxEntries = Number(logMaxEl.value);

  const clearLogEl = root.querySelector?.('[data-setting="clearLogOnLoad"]');
  if (clearLogEl && typeof clearLogEl.checked === 'boolean') out.clearLogOnLoad = clearLogEl.checked;

  const clearPackagesEl = root.querySelector?.('[data-setting="clearPackagesOnLoad"]');
  if (clearPackagesEl && typeof clearPackagesEl.checked === 'boolean') out.clearPackagesOnLoad = clearPackagesEl.checked;

  const autoRefreshEl = root.querySelector?.('[data-setting="autoRefreshAfterUpload"]');
  if (autoRefreshEl && typeof autoRefreshEl.checked === 'boolean') out.autoRefreshAfterUpload = autoRefreshEl.checked;

  return normalizeSettings(out);
}
