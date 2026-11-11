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
  /** 旧版逐扩展三档（保留读取兼容）；新版用 gitUpdateSelected + gitUpdateMode，缺省即关闭。 */
  gitDevMode: {},
  /** 开发者模式：打开后才出现 Git 可视化入口（数据包列「数据包 / Git」页签）；默认关闭。 */
  devMode: false,
  /** 自动更新总开关（逐扩展参与见 gitUpdateSelected）。 */
  gitAutoUpdate: false,
  /** 自动更新检查间隔（小时），默认 6；范围 1–168。 */
  gitUpdateIntervalHours: 6,
  /** 自动更新模式：notify = 仅提醒后更新；auto = 直接更新。 */
  gitUpdateMode: 'notify',
  /** 参与自动更新的扩展名（宿主页逐扩展勾选）。 */
  gitUpdateSelected: [],
  /** 上次自动检查时间（毫秒时间戳）；0 = 从未检查。 */
  gitAutoUpdateLastAt: 0,
  /** 宿主页扩展列表的自定义顺序（拖拽排序；只存名字）。 */
  extOrder: [],
  /** 宿主页排序方式：custom（拖拽顺序）/ name / version / source。 */
  extSort: 'custom',
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
    if (typeof input.devMode === 'boolean') out.devMode = input.devMode;
    if (typeof input.gitAutoUpdate === 'boolean') out.gitAutoUpdate = input.gitAutoUpdate;
    const interval = Number(input.gitUpdateIntervalHours);
    if (Number.isFinite(interval)) {
      out.gitUpdateIntervalHours = Math.max(1, Math.min(168, Math.round(interval)));
    }
    if (input.gitUpdateMode === 'auto' || input.gitUpdateMode === 'notify') {
      out.gitUpdateMode = input.gitUpdateMode;
    }
    if (Array.isArray(input.gitUpdateSelected)) {
      out.gitUpdateSelected = [...new Set(
        input.gitUpdateSelected.filter((name) => typeof name === 'string' && name),
      )];
    }
    const lastAt = Number(input.gitAutoUpdateLastAt);
    if (Number.isFinite(lastAt) && lastAt >= 0) out.gitAutoUpdateLastAt = lastAt;
    if (Array.isArray(input.extOrder)) {
      out.extOrder = [...new Set(input.extOrder.filter((name) => typeof name === 'string' && name))];
    }
    if (input.extSort === 'custom' || input.extSort === 'name' || input.extSort === 'version' || input.extSort === 'source') {
      out.extSort = input.extSort;
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
    + setting('set-confirm-discard-prefs', 'confirmDiscardChartPrefs', t('settings.confirmDiscardChartPrefs'), s.confirmDiscardChartPrefs)
    + setting('set-dev-mode', 'devMode', t('settings.devMode'), s.devMode);

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
/**
 * 从弹窗 DOM 读回开关与选项。
 *
 * `base` 是面板外的既有设置（Git 账号 / 安装登记 / 自动更新等不在本对话框里的键）：
 * 只覆盖对话框里真实存在的控件，其余键**原样保留**。此前以默认值起步，
 * 保存一次设置就会把 Git 账号与安装登记整段清空（2026-11-11 实测缺陷）。
 *
 * @param {{querySelector?:Function}} root
 * @param {object} [base]
 */
export function readSettings(root, base = SETTINGS_DEFAULTS) {
  const out = normalizeSettings(base);
  if (!root) return out;
  const devModeEl = root.querySelector?.('[data-setting="devMode"]');
  if (devModeEl && typeof devModeEl.checked === 'boolean') out.devMode = devModeEl.checked;
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
