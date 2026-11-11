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
  /** 旧版逐扩展三档（只保留读取兼容，界面不再使用）。 */
  gitDevMode: {},
  /** 逐扩展自动更新规则：{扩展名: {mode:'notify'|'auto', intervalSec}}；缺省即关闭。
   *  2026-11-11 第二轮用户裁定：自动更新只在宿主页每条扩展上设置，支持最短 5 秒轮询。 */
  gitAutoUpdateRules: {},
  /** 宿主页扩展列表的自定义顺序（拖拽排序；只存名字）。 */
  extOrder: [],
  /** 宿主页排序方式：custom（拖拽顺序）/ name / version / source。 */
  /** 宿主页排序方式：custom（拖拽顺序）/ name / version / source。 */
  extSort: 'custom',
  /** 自动更新策略（全部可手动调，代码不留运行阈值）：
   *  最短 / 最长轮询、默认间隔、失败退避倍数与上限、提醒超时。 */
  autoUpdateMinIntervalSec: 5,
  autoUpdateMaxIntervalSec: 86400,
  autoUpdateDefaultIntervalSec: 300,
  autoUpdateFailureBackoff: 2,
  autoUpdateFailureBackoffMaxSec: 3600,
  autoUpdateNotifyTimeoutSec: 8,
});

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS_DEFAULTS));

/** 数值夹紧（非法值回落 fallback）。 */
function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * 自动更新策略：**全部来自设置**，业务代码不得再写死任何运行阈值。
 * @returns {{min:number,max:number,fallback:number,backoff:number,backoffMaxSec:number,notifyTimeoutSec:number}}
 */
export function updatePolicyOf(settings = SETTINGS_DEFAULTS) {
  const s = settings && typeof settings === 'object' ? settings : SETTINGS_DEFAULTS;
  const d = SETTINGS_DEFAULTS;
  const min = Math.round(clampNumber(s.autoUpdateMinIntervalSec, 1, 86400, d.autoUpdateMinIntervalSec));
  const max = Math.round(clampNumber(s.autoUpdateMaxIntervalSec, min, 604800, d.autoUpdateMaxIntervalSec));
  const fallback = Math.round(clampNumber(s.autoUpdateDefaultIntervalSec, min, max, d.autoUpdateDefaultIntervalSec));
  return {
    min,
    max,
    fallback,
    backoff: clampNumber(s.autoUpdateFailureBackoff, 1, 10, d.autoUpdateFailureBackoff),
    backoffMaxSec: Math.round(clampNumber(s.autoUpdateFailureBackoffMaxSec, min, 604800, d.autoUpdateFailureBackoffMaxSec)),
    notifyTimeoutSec: Math.round(clampNumber(s.autoUpdateNotifyTimeoutSec, 1, 86400, d.autoUpdateNotifyTimeoutSec)),
  };
}

/** 间隔夹紧（秒），边界来自策略（不再有写死的 5 / 86400）。 */
export function normalizeUpdateInterval(value, policy = updatePolicyOf()) {
  return Math.round(clampNumber(value, policy.min, policy.max, policy.fallback));
}

/** 第 N 次失败后的等待秒数：`base × backoff^N`，上限来自策略。 */
export function updateBackoffDelay(intervalSec, failures, policy = updatePolicyOf()) {
  const base = normalizeUpdateInterval(intervalSec, policy);
  const exponent = Math.max(0, Number(failures) || 0);
  return Math.min(policy.backoffMaxSec, Math.round(base * Math.pow(policy.backoff, exponent)));
}

/**
 * 逐扩展自动更新规则归一：`{扩展名: {mode:'notify'|'auto', intervalSec}}`。
 * 兼容旧模型（`gitUpdateSelected` + `gitUpdateIntervalHours` + `gitUpdateMode`）一次性迁移。
 */
export function normalizeUpdateRules(input, policy = updatePolicyOf(input)) {
  const out = {};
  const rules = input?.gitAutoUpdateRules;
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    for (const [name, rule] of Object.entries(rules)) {
      if (!name || !rule || typeof rule !== 'object') continue;
      if (rule.mode !== 'notify' && rule.mode !== 'auto') continue;
      out[name] = { mode: rule.mode, intervalSec: normalizeUpdateInterval(rule.intervalSec, policy) };
    }
    return out;
  }
  const legacy = Array.isArray(input?.gitUpdateSelected) ? input.gitUpdateSelected : [];
  const legacyMode = input?.gitUpdateMode === 'auto' ? 'auto' : 'notify';
  const legacySec = normalizeUpdateInterval((Number(input?.gitUpdateIntervalHours) || 6) * 3600, policy);
  for (const name of legacy) {
    if (typeof name === 'string' && name) out[name] = { mode: legacyMode, intervalSec: legacySec };
  }
  return out;
}

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
    const clampInto = (key, lo, hi) => {
      const value = Number(input[key]);
      if (Number.isFinite(value)) out[key] = Math.max(lo, Math.min(hi, value));
    };
    clampInto('autoUpdateMinIntervalSec', 1, 86400);
    clampInto('autoUpdateMaxIntervalSec', Math.max(1, out.autoUpdateMinIntervalSec), 604800);
    clampInto('autoUpdateDefaultIntervalSec', out.autoUpdateMinIntervalSec, out.autoUpdateMaxIntervalSec);
    clampInto('autoUpdateFailureBackoff', 1, 10);
    clampInto('autoUpdateFailureBackoffMaxSec', out.autoUpdateMinIntervalSec, 604800);
    clampInto('autoUpdateNotifyTimeoutSec', 1, 86400);
    out.gitAutoUpdateRules = normalizeUpdateRules(input, updatePolicyOf(out));
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

  const numSetting = (key, label, min, max, step) => '<label class="et-git"><span>' + label + '</span>'
    + '<input class="text_pole" type="number" min="' + min + '" max="' + max + '" step="' + step + '" data-setting="' + key + '" value="' + s[key] + '"></label>';
  const autoGroup = '<div class="ext-note">' + t('settings.autoPolicyNote') + '</div>'
    + '<div class="ext-row">'
    + numSetting('autoUpdateMinIntervalSec', t('settings.autoMinInterval'), 1, 86400, 1)
    + numSetting('autoUpdateMaxIntervalSec', t('settings.autoMaxInterval'), 1, 604800, 60)
    + numSetting('autoUpdateDefaultIntervalSec', t('settings.autoDefaultInterval'), 1, 604800, 60)
    + '</div><div class="ext-row">'
    + numSetting('autoUpdateFailureBackoff', t('settings.autoBackoff'), 1, 10, 0.1)
    + numSetting('autoUpdateFailureBackoffMaxSec', t('settings.autoBackoffMax'), 1, 604800, 60)
    + numSetting('autoUpdateNotifyTimeoutSec', t('settings.autoNotifyTimeout'), 1, 86400, 1)
    + '</div>';

  return '<div class="settings-grid">'
    + group('behavior', t('settings.groupBehavior'), tips, true)
    + group('auto', t('settings.groupAuto'), autoGroup, false)
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
  /* 自动更新策略：全部从对话框读，缺省保留 base（不再写死阈值）。 */
  for (const key of [
    'autoUpdateMinIntervalSec', 'autoUpdateMaxIntervalSec', 'autoUpdateDefaultIntervalSec',
    'autoUpdateFailureBackoff', 'autoUpdateFailureBackoffMaxSec', 'autoUpdateNotifyTimeoutSec',
  ]) {
    const el = root.querySelector?.('[data-setting="' + key + '"]');
    const value = el?.value === '' || el?.value === undefined ? NaN : Number(el.value);
    if (Number.isFinite(value)) out[key] = value;
  }

  const clearLogEl = root.querySelector?.('[data-setting="clearLogOnLoad"]');
  if (clearLogEl && typeof clearLogEl.checked === 'boolean') out.clearLogOnLoad = clearLogEl.checked;

  const clearPackagesEl = root.querySelector?.('[data-setting="clearPackagesOnLoad"]');
  if (clearPackagesEl && typeof clearPackagesEl.checked === 'boolean') out.clearPackagesOnLoad = clearPackagesEl.checked;

  const autoRefreshEl = root.querySelector?.('[data-setting="autoRefreshAfterUpload"]');
  if (autoRefreshEl && typeof autoRefreshEl.checked === 'boolean') out.autoRefreshAfterUpload = autoRefreshEl.checked;

  return normalizeSettings(out);
}
