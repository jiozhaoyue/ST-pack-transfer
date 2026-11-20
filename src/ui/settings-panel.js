/**
 * 设置面板（唯一源）
 *
 * 只承载「面板行为」类开关；打包选项（压缩/扩展/Git/构建/backups/缓存/私有/原生资产）
 * 属于图表选择面，不得回到这里。
 */
import { t } from '../i18n/index.js';
import { brandTokensOf } from '../data/target-ui.js';
import { normalizeAccounts } from '../core/git-accounts.js';
import { escapeHtml } from './escape.js';
import { APP_VERSION, APP_COMMIT } from '../core/app-version.js';
import { resolveDocsTarget } from '../core/docs-site.js';
import {
  collectReportEnv,
  buildReportMarkdown,
  previewRedacted,
  buildGitHubNewIssueUrl,
} from './issue-report.js';

/** 设置默认值。新增项必须同步 zh-CN / en-US 文案与测试。 */
export const SETTINGS_DEFAULTS = Object.freeze({
  trafficPrompt: true,
  /** 点「从宿主拉取」时是否先提示「去原生界面点拉取」；默认每次提醒。 */
  nativePullNotice: true,
  autoTutorial: true,
  /** 版本变化后自动弹更新说明；默认开（用户 2026-11-17 裁定），可在弹窗里关闭。 */
  showChangelogOnUpdate: true,
  /** 下载导出区里的包后是否把它从导出区删除；默认不删。 */
  deleteAfterExport: false,
  /** 一键自动备份成功后是否删除自动流程产生的包（导入 + 导出）；默认删除（用户 2026-11-17 裁定）。 */
  autoDeleteBackupPacks: true,
  /** 可选 CORS 代理地址：只用于插件自己的 Git / WebDAV 外发请求；留空即直连。 */
  netProxyUrl: '',
  /** 自定义文档站基准地址：留空默认使用已部署的 GitHub Pages 文档站（绝对地址）。 */
  docsBaseUrl: '',
  /** 日志上限（条）；0/非法回落默认。 */
  logMaxEntries: 500,
  /** 日志显示/控制台镜像阈值：debug | info | warn | error；默认 warn（用户 2026-11-17 裁定）。 */
  logLevel: 'warn',
  /** 每次加载插件是否清空上次日志。 */
  clearLogOnLoad: true,
  /** 每次加载插件是否清空浏览器里暂存的数据包（IndexedDB files + OPFS packages）。 */
  clearPackagesOnLoad: false,
  /** 上传恢复成功后是否自动刷新页面；默认关闭（用户 2026-11-11 裁定）。 */
  autoRefreshAfterUpload: false,
  /** 上传恢复后自动按清单安装扩展：'off' | 'prompt' | 'auto'；默认 prompt。 */
  autoInstallManifestAfterUpload: 'prompt',
  /** Web 独立模式下的酒馆预设主题。 */
  webTheme: 'Dark Lite',
  /** 退出数据包偏好时若有未保存改动先提醒；默认开启。 */
  confirmDiscardChartPrefs: true,
  /**
   * 凭据存放位置（设置 → 隐私，2026-11-16 用户裁定）：
   * 默认一律 `browser` —— 只写本机 localStorage，不落酒馆 settings.json。
   * 旧用户若服务端已有账号且从未选过，`loadSettings()` 会按 `server` 显示以免账号消失。
   */
  gitCredentialStorage: 'browser',
  /** S3 凭据存放位置：默认只存本机浏览器。 */
  s3CredentialStorage: 'browser',
  /** WebDAV 凭据存放位置：默认只存本机浏览器。 */
  webdavCredentialStorage: 'browser',
  /**
   * 仅当 S3 / WebDAV 存放位置选「服务端」时才有值：随 extension_settings 落 settings.json。
   * 默认 null（浏览器模式不往服务端写任何凭据）。
   */
  s3Config: null,
  webdavConfig: null,
  /** Git 账号（结构见 src/core/git-accounts.js）。 */
  gitAccounts: [],
  /** 安装来源登记（更新检查用）：{name, url, ref, at}。 */
  gitInstalls: [],
  /** 旧版逐扩展三档（只保留读取兼容，界面不再使用）。 */
  gitDevMode: {},
  /** 逐扩展自动更新规则：{扩展名: {mode:'notify'|'auto', intervalSec}}；缺省即关闭。
   *  2026-11-11 第二轮用户裁定：自动更新只在宿主页每条扩展上设置，支持最短 5 秒轮询。 */
  gitAutoUpdateRules: {},
  /** 自动更新总开关（开发者页，2026-11-16 用户裁定）：默认关，开了宿主页才显示逐条设置。 */
  extAutoToolsOn: false,
  /** Git 云端读取开关（开发者页）：默认关，关=Git 可视化零云端请求。 */
  gitCloudReadOn: false,
  /** 切换分支按钮开关（开发者页）：默认关，开了 Git 可视化才显示「装到该版本」。 */
  gitRefInstallOn: false,
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
  /** 问题报告：目标 GitHub 仓库所有者 / 仓库名（随普通设置持久化）。 */
  issueOwner: '',
  issueRepo: '',
  /** 问题报告用户输入：标题 / 问题描述 / 复现步骤（对应 buildReportMarkdown.userInput）。 */
  issueTitle: '',
  issueDescription: '',
  issueSteps: '',
  /** 问题报告是否附带脱敏日志。 */
  issueIncludeLogs: true,
  /** 导出脱敏包时是否明示被剔除与清洗的明细列表（角色卡/凭据/配置）；默认开启，可在设置中关闭 */
  notifySanitizeDetails: true,
  /**
   * GitHub PAT：刻意不进入持久化 settings 对象——normalizeSettings 永不接收它。
   * 真实令牌只由 index.js 写入专用 localStorage 键，绝不随 extension_settings 落 settings.json。
   */
  githubToken: '',
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

export const TAVERN_THEMES = Object.freeze({
  'Dark Lite': {
    name: 'Dark Lite',
    vars: {
      '--SmartThemeBodyColor': 'rgba(220, 220, 210, 1)',
      '--SmartThemeEmColor': 'rgba(145, 145, 145, 1)',
      '--SmartThemeUnderlineColor': 'rgba(188, 231, 207, 1)',
      '--SmartThemeQuoteColor': 'rgba(225, 138, 36, 1)',
      '--SmartThemeBlurTintColor': 'rgba(23, 23, 23, 1)',
      '--SmartThemeChatTintColor': 'rgba(23, 23, 23, 1)',
      '--SmartThemeShadowColor': 'rgba(0, 0, 0, 0.5)',
      '--SmartThemeBorderColor': 'rgba(0, 0, 0, 0.5)',
    },
  },
  'Dark V 1.0': {
    name: 'Dark V 1.0',
    vars: {
      '--SmartThemeBodyColor': 'rgba(207, 207, 197, 1)',
      '--SmartThemeEmColor': 'rgba(145, 145, 145, 1)',
      '--SmartThemeUnderlineColor': 'rgba(145, 145, 145, 1)',
      '--SmartThemeQuoteColor': 'rgba(198, 193, 151, 1)',
      '--SmartThemeBlurTintColor': 'rgba(29, 33, 40, 0.95)',
      '--SmartThemeChatTintColor': 'rgba(29, 33, 40, 0.95)',
      '--SmartThemeShadowColor': 'rgba(0, 0, 0, 0.9)',
      '--SmartThemeBorderColor': 'rgba(0, 0, 0, 1)',
    },
  },
  'Azure': {
    name: 'Azure',
    vars: {
      '--SmartThemeBodyColor': 'rgba(171, 198, 223, 1)',
      '--SmartThemeEmColor': 'rgba(255, 255, 255, 1)',
      '--SmartThemeUnderlineColor': 'rgba(188, 231, 207, 1)',
      '--SmartThemeQuoteColor': 'rgba(111, 133, 253, 1)',
      '--SmartThemeBlurTintColor': 'rgba(23, 30, 33, 0.92)',
      '--SmartThemeChatTintColor': 'rgba(23, 30, 33, 0.92)',
      '--SmartThemeShadowColor': 'rgba(0, 0, 0, 1)',
      '--SmartThemeBorderColor': 'rgba(0, 0, 0, 0.5)',
    },
  },
  'Cappuccino': {
    name: 'Cappuccino',
    vars: {
      '--SmartThemeBodyColor': 'rgba(235, 235, 235, 1)',
      '--SmartThemeEmColor': 'rgba(145, 145, 145, 1)',
      '--SmartThemeUnderlineColor': 'rgba(188, 231, 207, 1)',
      '--SmartThemeQuoteColor': 'rgba(165, 140, 115, 1)',
      '--SmartThemeBlurTintColor': 'rgba(34, 30, 32, 0.95)',
      '--SmartThemeChatTintColor': 'rgba(34, 30, 32, 0.95)',
      '--SmartThemeShadowColor': 'rgba(0, 0, 0, 0.6)',
      '--SmartThemeBorderColor': 'rgba(0, 0, 0, 0.5)',
    },
  },
  'Celestial Macaron': {
    name: 'Celestial Macaron',
    vars: {
      '--SmartThemeBodyColor': 'rgba(229, 175, 162, 1)',
      '--SmartThemeEmColor': 'rgba(145, 145, 145, 1)',
      '--SmartThemeUnderlineColor': 'rgba(188, 231, 207, 1)',
      '--SmartThemeQuoteColor': 'rgba(197, 202, 206, 1)',
      '--SmartThemeBlurTintColor': 'rgba(23, 36, 55, 0.92)',
      '--SmartThemeChatTintColor': 'rgba(23, 36, 55, 0.92)',
      '--SmartThemeShadowColor': 'rgba(0, 0, 0, 0.6)',
      '--SmartThemeBorderColor': 'rgba(0, 0, 0, 0.5)',
    },
  },
});

export function applyWebTheme(themeKey) {
  const theme = TAVERN_THEMES[themeKey] || TAVERN_THEMES['Dark Lite'];
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const app = document.getElementById('app') || document.querySelector('.app-container');
  const targets = [root, app].filter(Boolean);
  for (const target of targets) {
    for (const [prop, val] of Object.entries(theme.vars)) {
      target.style.setProperty(prop, val);
    }
    // 强制同步刷新关键派生层级，确保立即生效无死角
    target.style.setProperty('--panel', theme.vars['--SmartThemeBlurTintColor']);
    target.style.setProperty('--text', theme.vars['--SmartThemeBodyColor']);
    const targetHost = target.getAttribute?.('data-target-host') || app?.getAttribute?.('data-target-host');
    const brandTokens = targetHost ? brandTokensOf(targetHost) : null;
    if (brandTokens) {
      target.style.setProperty('--accent', brandTokens.ring);
      target.style.setProperty('--accent-soft', brandTokens.soft);
      target.style.setProperty('--accent-soft-2', `color-mix(in srgb, ${brandTokens.ring} 32%, transparent)`);
      target.style.setProperty('--accent-line', `color-mix(in srgb, ${brandTokens.ring} 62%, transparent)`);
    } else {
      target.style.setProperty('--accent', theme.vars['--SmartThemeQuoteColor']);
    }
  }
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
    if (typeof input.autoDeleteBackupPacks === 'boolean') out.autoDeleteBackupPacks = input.autoDeleteBackupPacks;
    if (typeof input.netProxyUrl === 'string') out.netProxyUrl = input.netProxyUrl.trim();
    if (typeof input.docsBaseUrl === 'string') out.docsBaseUrl = input.docsBaseUrl.trim();
    const logMax = Number(input.logMaxEntries);
    if (Number.isFinite(logMax)) out.logMaxEntries = Math.max(50, Math.min(5000, Math.round(logMax)));
    if (['debug', 'info', 'warn', 'error'].includes(input.logLevel)) out.logLevel = input.logLevel;
    if (typeof input.showChangelogOnUpdate === 'boolean') out.showChangelogOnUpdate = input.showChangelogOnUpdate;
    if (typeof input.clearLogOnLoad === 'boolean') out.clearLogOnLoad = input.clearLogOnLoad;
    if (typeof input.clearPackagesOnLoad === 'boolean') out.clearPackagesOnLoad = input.clearPackagesOnLoad;
    if (typeof input.autoRefreshAfterUpload === 'boolean') out.autoRefreshAfterUpload = input.autoRefreshAfterUpload;
    if (['off', 'prompt', 'auto'].includes(input.autoInstallManifestAfterUpload)) {
      out.autoInstallManifestAfterUpload = input.autoInstallManifestAfterUpload;
    }
    if (typeof input.webTheme === 'string' && input.webTheme) {
      out.webTheme = input.webTheme;
    }
    if (typeof input.confirmDiscardChartPrefs === 'boolean') out.confirmDiscardChartPrefs = input.confirmDiscardChartPrefs;
    if (input.gitCredentialStorage === 'browser' || input.gitCredentialStorage === 'server') {
      out.gitCredentialStorage = input.gitCredentialStorage;
    }
    if (input.s3CredentialStorage === 'browser' || input.s3CredentialStorage === 'server') {
      out.s3CredentialStorage = input.s3CredentialStorage;
    }
    if (input.webdavCredentialStorage === 'browser' || input.webdavCredentialStorage === 'server') {
      out.webdavCredentialStorage = input.webdavCredentialStorage;
    }
    if (Array.isArray(input.gitAccounts)) out.gitAccounts = normalizeAccounts(input.gitAccounts);
    if (input.s3Config && typeof input.s3Config === 'object') out.s3Config = { ...input.s3Config };
    if (input.webdavConfig && typeof input.webdavConfig === 'object') out.webdavConfig = { ...input.webdavConfig };
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
    /* 2026-11-16 用户裁定：开发者页三个开关（布尔，缺省 false）。 */
    if (typeof input.extAutoToolsOn === 'boolean') out.extAutoToolsOn = input.extAutoToolsOn;
    if (typeof input.gitCloudReadOn === 'boolean') out.gitCloudReadOn = input.gitCloudReadOn;
    if (typeof input.gitRefInstallOn === 'boolean') out.gitRefInstallOn = input.gitRefInstallOn;
    if (Array.isArray(input.extOrder)) {
      out.extOrder = [...new Set(input.extOrder.filter((name) => typeof name === 'string' && name))];
    }
    if (input.extSort === 'custom' || input.extSort === 'name' || input.extSort === 'version' || input.extSort === 'source') {
      out.extSort = input.extSort;
    }
    /* 问题报告：仓库坐标与日志开关。githubToken 仅作类型归一，真实令牌由 index.js
       存专用 localStorage 键，绝不进持久化 settings（避免落服务端 settings.json）。 */
    if (typeof input.issueOwner === 'string') out.issueOwner = input.issueOwner.trim();
    if (typeof input.issueRepo === 'string') out.issueRepo = input.issueRepo.trim();
    if (typeof input.issueTitle === 'string') out.issueTitle = input.issueTitle.trim();
    if (typeof input.issueDescription === 'string') out.issueDescription = input.issueDescription.trim();
    if (typeof input.issueSteps === 'string') out.issueSteps = input.issueSteps.trim();
    if (typeof input.issueIncludeLogs === 'boolean') out.issueIncludeLogs = input.issueIncludeLogs;
    if (typeof input.notifySanitizeDetails === 'boolean') out.notifySanitizeDetails = input.notifySanitizeDetails;
    if (typeof input.githubToken === 'string') out.githubToken = input.githubToken.trim();
  }
  return out;
}

function setting(id, key, label, checked) {
  return `<label class="check"><input type="checkbox" id="${id}" data-setting="${key}"${checked ? ' checked' : ''}> ${label}</label>`;
}

/** 设置弹窗正文：分组可收起，不再全部平铺。 */
export function buildSettingsHtml(settings = {}) {
  const s = normalizeSettings(settings);
  ensureDocsSyncWired();
  ensureIssueReportWired();
  const group = (key, title, body, open) => '<details class="set-group" data-group="' + key + '"' + (open ? ' open' : '') + '>'
    + '<summary class="set-group-head">' + title + '</summary>'
    + '<div class="set-group-body">' + body + '</div></details>';

  const tips = '<div class="settings-subhead">'+t('settings.hintsFetch')+'</div>'
    + setting('set-traffic', 'trafficPrompt', t('settings.trafficPrompt'), s.trafficPrompt)
    + setting('set-native-pull-notice', 'nativePullNotice', t('settings.nativePullNotice'), s.nativePullNotice)
    + '<div class="settings-subhead">'+t('settings.hintsGuide')+'</div>'
    + setting('set-auto-tutorial', 'autoTutorial', t('settings.autoTutorial'), s.autoTutorial)
    + setting('set-show-changelog', 'showChangelogOnUpdate', t('settings.showChangelog'), s.showChangelogOnUpdate)
    + '<div class="settings-subhead">'+t('settings.hintsConfirm')+'</div>'
    + setting('set-confirm-discard-prefs', 'confirmDiscardChartPrefs', t('settings.confirmDiscardChartPrefs'), s.confirmDiscardChartPrefs);

  const exportGroup = '<div class="settings-subhead">'+t('settings.exportAfterUpload')+'</div>'
    + setting('set-auto-refresh', 'autoRefreshAfterUpload', t('settings.autoRefreshAfterUpload'), s.autoRefreshAfterUpload)
    + '<label class="et-git"><span>' + t('settings.autoInstallManifest') + '</span>'
    + '<select class="text_pole" data-setting="autoInstallManifestAfterUpload">'
    + '<option value="prompt"' + (s.autoInstallManifestAfterUpload === 'prompt' ? ' selected' : '') + '>' + t('settings.autoInstallPrompt') + '</option>'
    + '<option value="auto"' + (s.autoInstallManifestAfterUpload === 'auto' ? ' selected' : '') + '>' + t('settings.autoInstallAuto') + '</option>'
    + '<option value="off"' + (s.autoInstallManifestAfterUpload === 'off' ? ' selected' : '') + '>' + t('settings.autoInstallOff') + '</option>'
    + '</select></label>'
    + '<div class="settings-subhead">'+t('settings.exportLifecycle')+'</div>'
    + setting('set-delete-after-export', 'deleteAfterExport', t('settings.deleteAfterExport'), s.deleteAfterExport)
    + setting('set-auto-delete-backup', 'autoDeleteBackupPacks', t('settings.autoDeleteBackupPacks'), s.autoDeleteBackupPacks)
    + setting('set-notify-sanitize', 'notifySanitizeDetails', t('settings.notifySanitizeDetails'), s.notifySanitizeDetails)
    + '<div class="settings-subhead">'+t('settings.exportStartup')+'</div>'
    + setting('set-clear-packages', 'clearPackagesOnLoad', t('settings.clearPackagesOnLoad'), s.clearPackagesOnLoad);

  const logging = '<label class="et-git"><span>' + t('settings.logLevel') + '</span>'
    + '<select class="text_pole" data-setting="logLevel">'
    + ['debug', 'info', 'warn', 'error'].map((lv) =>
      '<option value="' + lv + '"' + (s.logLevel === lv ? ' selected' : '') + '>'
      + t('settings.logLevel.' + lv) + '</option>').join('')
    + '</select></label>'
    + '<label class="et-git"><span>' + t('settings.logMaxEntries') + '</span>'
    + '<input class="text_pole" type="number" min="50" max="5000" step="50" data-setting="logMaxEntries" value="' + s.logMaxEntries + '"></label>'
    + setting('set-clear-log', 'clearLogOnLoad', t('settings.clearLogOnLoad'), s.clearLogOnLoad);

  /* 凭据与数据合并：清晰划分两块（2026-11-18 用户裁定） */
  const credSelect = (key, label) => '<label class="et-git"><span>' + label + '</span>'
    + '<select class="text_pole" data-setting="' + key + '">'
    + '<option value="browser"' + (s[key] === 'browser' ? ' selected' : '') + '>' + t('settings.credStoreBrowser') + '</option>'
    + '<option value="server"' + (s[key] === 'server' ? ' selected' : '') + '>' + t('settings.credStoreServer') + '</option>'
    + '</select></label>';

  const dataCredGroup = '<div class="settings-subhead">' + t('settings.subheadCred') + '</div>'
    + credSelect('gitCredentialStorage', t('settings.credGit'))
    + credSelect('s3CredentialStorage', t('settings.credS3'))
    + credSelect('webdavCredentialStorage', t('settings.credWebdav'))
    + '<div class="ext-note">' + t('settings.credPrivacyHint') + '</div>'
    + '<hr class="settings-divider" style="margin:10px 0;border:0;border-top:1px solid var(--border)">'
    + '<div class="settings-subhead">' + t('settings.subheadData') + '</div>'
    + '<div class="ext-row">'
      + '<button type="button" class="btn" data-action="plugin-export">' + t('settings.exportData') + '</button>'
      + '<button type="button" class="btn" data-action="plugin-import">' + t('settings.importData') + '</button>'
    + '</div>'
    + '<label class="check"><input type="checkbox" id="set-include-creds" checked> ' + t('settings.includeCreds') + '</label>'
    + '<label class="check check-sub"><input type="checkbox" id="set-include-oauth"> ' + t('settings.includeOauth') + '</label>'
    + '<div class="ext-note">' + t('settings.dataNote') + '</div>'
    + '<div class="ext-row" style="margin-top:8px">'
      + '<button type="button" class="btn danger" data-action="plugin-git-clean">' + t('extmgr.gitCleanSettings') + '</button>'
    + '</div>'
    + '<div class="ext-note">' + t('extmgr.gitCleanSettingsDesc') + '</div>';

  const docsTarget = resolveDocsTarget(s.docsBaseUrl);
  const docsHint = t('settings.docsBaseUrlHint');
  const docsOpenLabel = t('settings.openDocsHint', { url: docsTarget.base });
  const netGroup = '<label class="et-git"><span>' + t('settings.netProxy') + '</span>'
    + '<input class="text_pole" type="url" data-setting="netProxyUrl" placeholder="' + t('settings.netProxyPlaceholder')
    + '" value="' + escapeHtml(s.netProxyUrl || '') + '"></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('settings.docsBaseUrl') + '</span>'
    + '<input class="text_pole" type="text" data-setting="docsBaseUrl" placeholder="' + t('settings.docsBaseUrlPlaceholder')
    + '" title="' + escapeHtml(docsHint) + '" value="' + escapeHtml(s.docsBaseUrl || '') + '"></label>'
    + '<div class="ext-note">' + t('settings.docsBaseUrlNote') + '</div>'
    + '<div class="ext-note" data-docs-invalid'
    + (docsTarget.invalid ? '' : ' hidden style="display:none"') + '>' + t('settings.docsInvalid') + '</div>'
    + '<div class="ext-row" style="margin-top:6px"><a class="btn" id="settings-open-docs" href="'
    + escapeHtml(docsTarget.base) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none"'
    + ' title="' + escapeHtml(docsOpenLabel) + '">' + t('settings.openDocs') + '</a></div>';

  const issueGroup = '<label class="et-git"><span>' + t('issue.title') + '</span>'
    + '<input class="text_pole" type="text" data-setting="issueTitle" placeholder="' + t('issue.titlePlaceholder')
    + '" value="' + escapeHtml(s.issueTitle || '') + '"></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.description') + '</span>'
    + '<textarea class="text_pole" rows="3" data-setting="issueDescription" placeholder="'
    + t('issue.descriptionPlaceholder') + '">' + escapeHtml(s.issueDescription || '') + '</textarea></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.steps') + '</span>'
    + '<textarea class="text_pole" rows="3" data-setting="issueSteps" placeholder="'
    + t('issue.stepsPlaceholder') + '">' + escapeHtml(s.issueSteps || '') + '</textarea></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.owner') + '</span>'
    + '<input class="text_pole" type="text" data-setting="issueOwner" placeholder="' + t('issue.ownerPlaceholder')
    + '" value="' + escapeHtml(s.issueOwner || '') + '"></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.repo') + '</span>'
    + '<input class="text_pole" type="text" data-setting="issueRepo" placeholder="' + t('issue.repoPlaceholder')
    + '" value="' + escapeHtml(s.issueRepo || '') + '"></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.token') + '</span>'
    + '<input class="text_pole" type="password" id="issue-token" autocomplete="off"'
    + ' placeholder="' + t('issue.tokenPlaceholder') + '" value="' + escapeHtml(readGithubToken()) + '"></label>'
    + '<div class="ext-note">' + t('issue.tokenStorageHint') + '</div>'
    + setting('set-issue-include-logs', 'issueIncludeLogs', t('issue.includeLogs'), s.issueIncludeLogs)
    + '<div class="ext-row" style="margin-top:8px">'
      + '<button type="button" class="btn" data-action="issue-preview">' + t('issue.preview') + '</button>'
      + '<button type="button" class="btn danger" data-action="issue-submit">' + t('issue.submit') + '</button>'
    + '</div>'
    + '<div class="ext-row" style="margin-top:6px">'
      + '<button type="button" class="menu_button" id="issue-copy-report" data-issue-action="copy">'
      + t('settings.issueCopy') + '</button>'
      + '<button type="button" class="menu_button" id="issue-export-md" data-issue-action="export-md">'
      + t('settings.issueExportMd') + '</button>'
      + '<button type="button" class="menu_button" id="issue-new-issue" data-issue-action="new-issue">'
      + t('settings.issueNewIssue') + '</button>'
    + '</div>'
    + '<div class="ext-note">' + t('issue.helpHint') + '</div>';

  return '<div class="settings-grid">'
    + group('behavior', t('settings.groupBehavior'), tips, true)
    + group('data', t('settings.groupDataCred'), dataCredGroup, true)
    + group('export', t('settings.groupExport'), exportGroup, true)
    + group('net', t('settings.groupNet'), netGroup, false)
    + group('log', t('settings.groupLog'), logging, false)
    + group('issue', t('issue.group'), issueGroup, false)
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
  const changelogEl = root.querySelector?.('[data-setting="showChangelogOnUpdate"]');
  if (changelogEl && typeof changelogEl.checked === 'boolean') out.showChangelogOnUpdate = changelogEl.checked;
  const confirmDiscardEl = root.querySelector?.('[data-setting="confirmDiscardChartPrefs"]');
  if (confirmDiscardEl && typeof confirmDiscardEl.checked === 'boolean') out.confirmDiscardChartPrefs = confirmDiscardEl.checked;
  const deleteEl = root.querySelector?.('[data-setting="deleteAfterExport"]');
  if (deleteEl && typeof deleteEl.checked === 'boolean') out.deleteAfterExport = deleteEl.checked;
  const autoDeleteBackupEl = root.querySelector?.('[data-setting="autoDeleteBackupPacks"]');
  if (autoDeleteBackupEl && typeof autoDeleteBackupEl.checked === 'boolean') out.autoDeleteBackupPacks = autoDeleteBackupEl.checked;

  const logMaxEl = root.querySelector?.('[data-setting="logMaxEntries"]');
  if (logMaxEl?.value) out.logMaxEntries = Number(logMaxEl.value);

  const logLevelEl = root.querySelector?.('[data-setting="logLevel"]');
  if (logLevelEl && ['debug', 'info', 'warn', 'error'].includes(logLevelEl.value)) {
    out.logLevel = logLevelEl.value;
  }

  const netProxyEl = root.querySelector?.('[data-setting="netProxyUrl"]');
  if (netProxyEl && typeof netProxyEl.value === 'string') out.netProxyUrl = netProxyEl.value.trim();

  const docsBaseEl = root.querySelector?.('[data-setting="docsBaseUrl"]');
  if (docsBaseEl && typeof docsBaseEl.value === 'string') out.docsBaseUrl = docsBaseEl.value.trim();

  const clearLogEl = root.querySelector?.('[data-setting="clearLogOnLoad"]');
  if (clearLogEl && typeof clearLogEl.checked === 'boolean') out.clearLogOnLoad = clearLogEl.checked;

  const clearPackagesEl = root.querySelector?.('[data-setting="clearPackagesOnLoad"]');
  if (clearPackagesEl && typeof clearPackagesEl.checked === 'boolean') out.clearPackagesOnLoad = clearPackagesEl.checked;

  const autoRefreshEl = root.querySelector?.('[data-setting="autoRefreshAfterUpload"]');
  if (autoRefreshEl && typeof autoRefreshEl.checked === 'boolean') out.autoRefreshAfterUpload = autoRefreshEl.checked;

  const autoInstallEl = root.querySelector?.('[data-setting="autoInstallManifestAfterUpload"]');
  if (autoInstallEl && ['off', 'prompt', 'auto'].includes(autoInstallEl.value)) {
    out.autoInstallManifestAfterUpload = autoInstallEl.value;
  }

  for (const key of ['gitCredentialStorage', 's3CredentialStorage', 'webdavCredentialStorage']) {
    const el = root.querySelector?.('[data-setting="' + key + '"]');
    if (el && (el.value === 'browser' || el.value === 'server')) out[key] = el.value;
  }

  const webThemeEl = root.querySelector?.('[data-setting="webTheme"]');
  if (webThemeEl && typeof webThemeEl.value === 'string' && webThemeEl.value) {
    out.webTheme = webThemeEl.value;
    applyWebTheme(out.webTheme);
  }

  /* 问题报告：仓库坐标与日志开关随普通设置持久化。
     githubToken 刻意不读回：它由 index.js 存专用 localStorage 键，
     若进入 out 会被 saveSettings() 双写到宿主 settings.json（违反 token 铁律）。 */
  const issueOwnerEl = root.querySelector?.('[data-setting="issueOwner"]');
  if (issueOwnerEl && typeof issueOwnerEl.value === 'string') out.issueOwner = issueOwnerEl.value.trim();
  const issueRepoEl = root.querySelector?.('[data-setting="issueRepo"]');
  if (issueRepoEl && typeof issueRepoEl.value === 'string') out.issueRepo = issueRepoEl.value.trim();
  const issueTitleEl = root.querySelector?.('[data-setting="issueTitle"]');
  if (issueTitleEl && typeof issueTitleEl.value === 'string') out.issueTitle = issueTitleEl.value.trim();
  const issueDescEl = root.querySelector?.('[data-setting="issueDescription"]');
  if (issueDescEl && typeof issueDescEl.value === 'string') out.issueDescription = issueDescEl.value.trim();
  const issueStepsEl = root.querySelector?.('[data-setting="issueSteps"]');
  if (issueStepsEl && typeof issueStepsEl.value === 'string') out.issueSteps = issueStepsEl.value.trim();
  const issueLogsEl = root.querySelector?.('[data-setting="issueIncludeLogs"]');
  if (issueLogsEl && typeof issueLogsEl.checked === 'boolean') out.issueIncludeLogs = issueLogsEl.checked;

  return normalizeSettings(out);
}

/** GitHub PAT 专用 localStorage 键：与持久化 settings 分离，绝不进 settings.json。 */
export const GITHUB_TOKEN_STORAGE_KEY = 'st-pack-transfer:github-token';

function tokenStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** 读取本机 GitHub PAT；无存储 / 隐私模式一律返回空串。 */
export function readGithubToken() {
  const s = tokenStorage();
  if (!s) return '';
  try {
    const raw = s.getItem(GITHUB_TOKEN_STORAGE_KEY);
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

/** 仅写本机 localStorage；令牌永不进入 extension_settings / settings.json。 */
export function writeGithubToken(token) {
  const s = tokenStorage();
  if (!s) return false;
  try {
    const value = typeof token === 'string' ? token.trim() : '';
    if (value) s.setItem(GITHUB_TOKEN_STORAGE_KEY, value);
    else s.removeItem(GITHUB_TOKEN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 清空本机 GitHub PAT。 */
export function clearGithubToken() {
  return writeGithubToken('');
}

/**
 * 把「打开文档站」按钮同步到当前输入值。
 *
 * 修复的真实缺陷：按钮的 `href` 原先只在渲染时算一次，用户改完输入框
 * 不重新渲染就点按钮，跳的仍是旧地址（2026-11-19 用户报障）。
 *
 * 同时把非法地址显式暴露出来：`resolveDocsTarget` 对非绝对 http(s) 回退部署站，
 * 若不提示，用户会以为用的是自己填的地址。
 *
 * @param {HTMLInputElement} input 文档站地址输入框
 * @param {Element} link 「打开文档站」锚点
 * @param {Element|null} warn 非法地址提示行
 */
function syncDocsLink(input, link, warn) {
  const target = resolveDocsTarget(input.value);
  link.setAttribute('href', target.base);
  const label = t('settings.openDocsHint', { url: target.base });
  link.setAttribute('title', label);
  if (warn) {
    warn.hidden = !target.invalid;
    warn.style.display = target.invalid ? '' : 'none';
  }
}

/** 文档站控件的事件委托只注册一次；模块导入本身无副作用（Node 测试无 document）。 */
let docsSyncWired = false;

/**
 * 惰性注册文档站控件的委托监听。
 *
 * 必须在**捕获阶段**接 `click`：默认跳转发生在冒泡后，此时改 `href` 已太晚；
 * 捕获阶段先重算，才能保证点下去用的就是输入框里的当前地址。
 */
function ensureDocsSyncWired() {
  if (docsSyncWired) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  docsSyncWired = true;

  const resolveParts = (node) => {
    if (!node || typeof node.closest !== 'function' || !node.closest('#settings-body')) return null;
    const input = node.closest('#settings-body')?.querySelector('[data-setting="docsBaseUrl"]');
    const link = node.closest('#settings-body')?.querySelector('#settings-open-docs');
    if (!input || !link) return null;
    return { input, link, warn: node.closest('#settings-body').querySelector('[data-docs-invalid]') };
  };

  const onInput = (ev) => {
    const el = ev.target;
    if (!el || el.getAttribute?.('data-setting') !== 'docsBaseUrl') return;
    const parts = resolveParts(el);
    if (parts) syncDocsLink(parts.input, parts.link, parts.warn);
  };

  /* 草稿恢复（applySettingsDraft）直接写 value、不触发事件，故点击前再兜一次。 */
  const onClick = (ev) => {
    const link = ev.target?.closest?.('#settings-open-docs');
    if (!link) return;
    const parts = resolveParts(link);
    if (parts) syncDocsLink(parts.input, parts.link, parts.warn);
  };

  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onInput, true);
  document.addEventListener('click', onClick, true);
}

/** 问题报告按钮委托只注册一次；模块导入本身无副作用（Node 测试无 document）。 */
let issueReportWired = false;
/** 缓存委托 click 处理器，供 disposeSettingsPanel 移除；随 ensure 注册时赋值。 */
let issueClickHandler = null;

/** 读取设置弹窗里的问题报告字段与日志开关；未渲染时返回确定默认值。 */
function readIssueReportForm(body) {
  const val = (key) => {
    const el = body?.querySelector?.('[data-setting="' + key + '"]');
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  };
  const logsEl = body?.querySelector?.('[data-setting="issueIncludeLogs"]');
  return {
    title: val('issueTitle'),
    description: val('issueDescription'),
    steps: val('issueSteps'),
    owner: val('issueOwner'),
    repo: val('issueRepo'),
    includeLogs: typeof logsEl?.checked === 'boolean' ? logsEl.checked : true,
  };
}

/** 采集环境并组装脱敏报告全文；includeLogs 由当前勾选状态透传。 */
async function composeIssueReportText(body) {
  const form = readIssueReportForm(body);
  const env = await collectReportEnv();
  const text = previewRedacted(buildReportMarkdown({
    env,
    userInput: { title: form.title, description: form.description, steps: form.steps },
    includeLogs: form.includeLogs,
  }));
  return { form, text };
}

/** 写剪贴板：优先异步 API，失败降级 textarea + execCommand。 */
function legacyCopy(text) {
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    // dom-scope:allow 剪贴板降级临时 textarea 须在 body 内才能 select，用完立即 remove
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function writeClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      return Promise.resolve(navigator.clipboard.writeText(text)).then(
        () => true,
        () => legacyCopy(text),
      );
    }
  } catch { /* 无剪贴板 API，走降级 */ }
  return Promise.resolve(legacyCopy(text));
}

/** 用 Blob 下载 Markdown 产物；objectURL 随后释放，避免内存泄露。 */
function downloadMarkdown(text) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'issue-report.md';
  // dom-scope:allow 下载 a 元素须在文档内才能触发 click，触发后立即 remove
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 释放时机不能是 0ms：Safari/Firefox 尚未消费该 URL 就失效会导致下载失败。与仓内其它下载点一致用 60s。
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* 忽略 */ } }, 60000);
}

/** 在按钮上短暂闪现提示文案，文案全部来自 i18n。 */
function flashLabel(btn, msg) {
  if (!btn || typeof btn.textContent !== 'string') return;
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = original; }, 1500);
}

/**
 * 惰性注册问题报告按钮的委托监听。
 *
 * 用独立的 data-issue-action 属性，避开 index.js 的 data-action 路由；
 * 这样三个按钮的事件由本模块自包含处理，不改动根控制器。
 */
function ensureIssueReportWired() {
  if (issueReportWired) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  issueReportWired = true;

  issueClickHandler = (ev) => {
    const btn = ev.target?.closest?.('[data-issue-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-issue-action');
    const body = btn.closest('#settings-body') || document;

    composeIssueReportText(body).then(({ form, text }) => {
      if (action === 'copy') {
        writeClipboard(text).then((ok) => {
          flashLabel(btn, t(ok ? 'settings.issueCopyOk' : 'settings.issueCopyFail'));
        });
        return;
      }
      if (action === 'export-md') {
        downloadMarkdown(text);
        return;
      }
      if (action === 'new-issue') {
        if (typeof window === 'undefined' || typeof window.open !== 'function') return;
        const url = buildGitHubNewIssueUrl({
          owner: form.owner || undefined,
          repo: form.repo || undefined,
          title: form.title,
          body: text,
        });
        const opened = window.open(url, '_blank', 'noopener');
        // 弹窗被浏览器拦截时 window.open 返回 null，必须告知用户而不是静默失败。
        if (!opened) flashLabel(btn, t('settings.issuePopupBlocked'));
      }
    }).catch(() => {
      flashLabel(btn, t('settings.issueCopyFail'));
    });
  };

  document.addEventListener('click', issueClickHandler, false);
}

/** 单页常驻下不会被调用，供 HMR / 测试 / 未来卸载路径使用：注销问题报告 click 委托并复位注册标志。 */
export function disposeSettingsPanel() {
  if (issueClickHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('click', issueClickHandler, false);
  }
  issueClickHandler = null;
  issueReportWired = false;
}
