/**
 * 设置面板（唯一源）
 *
 * 只承载「面板行为」类开关；打包选项（压缩/扩展/Git/构建/backups/缓存/私有/原生资产）
 * 属于图表选择面，不得回到这里。
 */
import { t } from '../i18n/index.js';
import { detectHost } from './host-bridge.js';
import { brandTokensOf } from '../data/target-ui.js';
import { normalizeAccounts } from '../core/git-accounts.js';
import { SITES } from '../core/git-url.js';
import { escapeHtml, isSafeHttpUrl } from './escape.js';
import { logger } from '../core/logger.js';
import { APP_VERSION, APP_COMMIT } from '../core/app-version.js';
import { resolveDocsTarget } from '../core/docs-site.js';
import {
  collectReportEnv,
  buildReportMarkdown,
  previewRedacted,
  buildGitHubNewIssueUrl,
  buildGitHubNewIssueUrlSafe,
  resolveIssueCoords,
  issueChannelAvailable,
  loadIssueTemplates,
  buildIssueTemplateBody,
  issuePrereqsMet,
  issuePrereqsMissing,
  buildIssueSearchUrl,
  buildDocsRepoUrl,
  renderTemplateOptions,
  renderTemplateFields,
  initIssueReportSync,
} from './issue-report.js';

/**
 * 问题报告默认坐标：由 resolveIssueCoords() 动态填充，禁止硬编码。
 * 初始为空对象，取不到时按钮置灰 + 提示「未提供」（G-34）。
 * 保留导出名只为兼容既有测试契约，值不再是写死的 owner/repo。
 */
export const ISSUE_REPO_DEFAULT = Object.freeze({ owner: '', repo: '', platform: 'github' });

/** 动态坐标缓存与模板缓存（异步拉取后一次写入，同步渲染读取）。 */
let issueCoordsCache = { current: null, upstream: null, provenance: '' };
let issueTemplateCache = { templates: [], config: null, source: 'local', warning: '' };

/**
 * 提交二次确认模态 API：由 index.js 在 view 创建后注入工作台的 openModal/closeModal。
 * 未注入时降级 window.confirm，保证「每次提交必弹、不可配置跳过」在任何宿主都不失效。
 */
let issueModalApi = null;
export function setIssueModalApi(api) {
  issueModalApi = api && typeof api === 'object' ? api : null;
}

/**
 * 异步初始化 issue 坐标与模板（两条线坐标全部来自 resolver，零硬编码）。
 * 在渲染设置面板前调用；失败时保持空态，UI 显示「未提供」。
 */
export async function initIssueReportContext() {
  issueCoordsCache = await resolveIssueCoords() || { current: null, upstream: null, provenance: '' };
  issueTemplateCache = await loadIssueTemplates({
    current: issueCoordsCache.current,
    branch: 'main',
  });
  return { coords: issueCoordsCache, templates: issueTemplateCache };
}

/** 当前坐标快照（供调试与测试；无坐标返回空值与可用性布尔）。 */
export function issueCoordsSnapshot() {
  return {
    current: issueCoordsCache.current ? { ...issueCoordsCache.current } : null,
    upstream: issueCoordsCache.upstream ? { ...issueCoordsCache.upstream } : null,
    provenance: issueCoordsCache.provenance || '',
    currentAvailable: issueChannelAvailable(issueCoordsCache, 'current'),
    upstreamAvailable: issueChannelAvailable(issueCoordsCache, 'upstream'),
  };
}

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
  extSort: 'custom',
  /** 自动更新策略（全部可手动调，代码不留运行阈值）：
   *  最短 / 最长轮询、默认间隔、失败退避倍数与上限、提醒超时。 */
  autoUpdateMinIntervalSec: 5,
  autoUpdateMaxIntervalSec: 86400,
  autoUpdateDefaultIntervalSec: 300,
  autoUpdateFailureBackoff: 2,
  autoUpdateFailureBackoffMaxSec: 3600,
  autoUpdateNotifyTimeoutSec: 8,
  /**
   * 问题报告：目标平台（当前仅 GitHub；结构预留扩展位）。仓库坐标由 resolveIssueCoords() 异步解析本仓与上游，ISSUE_REPO_DEFAULT 仅为空值占位。
   * issueOwner / issueRepo 为废弃兼容字段：UI 不再提供可见手填框，保留仅为兼容既有测试契约与
   * index.js 的 DOM 读取；其值由 hidden input 以 ISSUE_REPO_DEFAULT 默认值填充，用户无法编辑。
   */
  issuePlatform: 'github',
  /** 问题报告账号下拉（只读状态指示）：记录当前展示的账号 id / 'token' / ''（空态）。
   *  令牌始终来自本机专用 localStorage（readGithubToken），不按账号切换；详见 buildSettingsHtml 注释。 */
  issueAccount: '',
  issueOwner: '',
  issueRepo: '',
  /** 问题报告用户输入：标题 / 问题描述 / 复现步骤（对应 buildReportMarkdown.userInput）。 */
  issueTitle: '',
  issueDescription: '',
  issueSteps: '',
  /** 问题报告是否附带脱敏日志。 */
  issueIncludeLogs: true,
  /**
   * 问题报告附带日志的级别：all|info|warn|error|debug（≥ 语义，插件侧聚合过滤）。
   * 默认 warn（红队 P0-1：ALL 含调试属最危险档位，最小化默认到警告以上）。
   */
  issueLogLevel: 'warn',
  /** 问题报告附带日志的条数：'50'|'100'|'200'|'500'|'all'。默认 100（保持既有行为）。 */
  issueLogCount: '100',
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
  // 宿主态：主题由宿主控制，禁止写宿主 CSS 变量（D-02），仅独立 Web 生效
  try { if (detectHost()?.isPlugin === true) return; } catch { /* 探测失败按独立态处理 */ }
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
    /* issueOwner / issueRepo 为废弃兼容字段，UI 不再手填，保留归一只为兼容既有测试契约。 */
    if (typeof input.issueOwner === 'string') out.issueOwner = input.issueOwner.trim();
    if (typeof input.issueRepo === 'string') out.issueRepo = input.issueRepo.trim();
    if (input.issuePlatform === 'github') out.issuePlatform = input.issuePlatform;
    /* issueAccount 只读状态指示：合法值为 ''（空态）/ 'token'（仅令牌）/ 账号 id 字符串。 */
    if (typeof input.issueAccount === 'string') {
      const account = input.issueAccount.trim();
      if (account === '' || account === 'token' || /^[A-Za-z0-9_.:@/-]{1,200}$/.test(account)) {
        out.issueAccount = account;
      }
    }
    if (typeof input.issueTitle === 'string') out.issueTitle = input.issueTitle.trim();
    if (typeof input.issueDescription === 'string') out.issueDescription = input.issueDescription.trim();
    if (typeof input.issueSteps === 'string') out.issueSteps = input.issueSteps.trim();
    if (typeof input.issueIncludeLogs === 'boolean') out.issueIncludeLogs = input.issueIncludeLogs;
    if (['all', 'debug', 'info', 'warn', 'error'].includes(input.issueLogLevel)) out.issueLogLevel = input.issueLogLevel;
    if (['50', '100', '200', '500', 'all'].includes(String(input.issueLogCount))) {
      out.issueLogCount = String(input.issueLogCount);
    }
    if (typeof input.notifySanitizeDetails === 'boolean') out.notifySanitizeDetails = input.notifySanitizeDetails;
    if (typeof input.githubToken === 'string') out.githubToken = input.githubToken.trim();
  }
  return out;
}

function setting(id, key, label, checked) {
  return `<label class="check"><input type="checkbox" id="${id}" data-setting="${key}"${checked ? ' checked' : ''}> ${label}</label>`;
}

/**
 * 问题报告日志附带参数。
 * buildReportMarkdown({ includeLogs:true }) 不传 logLevel/logCount 时默认 ALL/100；
 * 面板侧用户选择的语义值经此映射到该默认入参，保证默认行为不变。
 */
const ISSUE_LOG_LEVEL_DEFAULT = 'warn';
const ISSUE_LOG_COUNT_DEFAULT = '100';
/** 语义级别 → 报告入参（'all' 对应 logger 的 'ALL'；其余交给插件侧聚合过滤）。导出供 index.js 两条组装路径同源复用。 */
export const ISSUE_LEVEL_TO_REPORT = Object.freeze({ all: 'ALL', debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR' });
/** 语义级别 → 文案 key（用于统计文案里的级别标签）。 */
const ISSUE_LEVEL_LABEL_KEY = Object.freeze({
  all: 'issue.logLevelAll', debug: 'issue.logLevelDebug', info: 'issue.logLevelInfo',
  warn: 'issue.logLevelWarn', error: 'issue.logLevelError',
});

/** 安全归一化级别/条数：非法值回落默认（与 normalizeSettings 白名单一致）。导出供 index.js 两条组装路径同源复用。 */
export function normalizeIssueLogParams(level, count) {
  const lv = ['all', 'debug', 'info', 'warn', 'error'].includes(level) ? level : ISSUE_LOG_LEVEL_DEFAULT;
  const ct = ['50', '100', '200', '500', 'all'].includes(String(count)) ? String(count) : ISSUE_LOG_COUNT_DEFAULT;
  return { level: lv, count: ct };
}

/** 无障碍替代：日志区块读不到时的统一降级文案由 i18n 提供。 */
const ISSUE_LOG_UNAVAILABLE = 'unavailable';

/** 反引号字符（避免正则/字符串里的反引号被 i18n 守卫误判为模板串起点）。 */
const BT = String.fromCharCode(96);
/** 日志区块标记，与 buildReportMarkdown 产出的「## 日志 / ```text」逐字对齐。 */
const LOG_MARKER = '## \u65E5\u5FD7\n' + BT + BT + BT + 'text\n';

/**
 * 实时统计「问题报告将附带多少条日志」。
 *
 * 同源保证（不另写取日志/过滤逻辑）：本函数直接调用 buildReportMarkdown({ includeLogs:true })
 * 并解析其产出的「## 日志」区块。取数、级别过滤、条数截断、safeRedact
 * 全部由 buildReportMarkdown 内的 collectLogText 完成；这里只数生成结果的行数。
 * 参数由调用方传入并映射为报告入参，确保与实际组装走同一条路径。
 * @param {string} level 语义级别 all|debug|info|warn|error
 * @param {string} count 条数 50|100|200|500|all
 */
export function getIssueLogSummary(level = 'all', count = ISSUE_LOG_COUNT_DEFAULT) {
  const p = normalizeIssueLogParams(level, count);
  const reportLevel = ISSUE_LEVEL_TO_REPORT[p.level];
  const md = buildReportMarkdown({
    env: {}, userInput: {}, includeLogs: true,
    logLevel: reportLevel, logCount: p.count,
  });
  const marker = LOG_MARKER;
  const start = md.indexOf(marker);
  if (start < 0) return { count: 0, level: reportLevel };
  const rest = md.slice(start + marker.length);
  const end = rest.indexOf('\n' + BT + BT + BT);
  const body = (end < 0 ? rest : rest.slice(0, end)).trim();
  if (!body || body === ISSUE_LOG_UNAVAILABLE) return { count: 0, level: reportLevel };
  const n = body.split('\n').filter((line) => line.trim()).length;
  return { count: n, level: reportLevel };
}

/**
 * 生成日志附带统计文案，与最终报告同源（都经 getIssueLogSummary → buildReportMarkdown）。
 * - 未勾选：显示「不附带日志」。
 * - 全量级别且 0 条：显示「暂无日志」；非全量级别 0 条：显示「暂无{level}日志」。
 * - 有日志：文案含 {n} 条数与 {level} 级别标签。
 * 兼容旧调用 buildIssueLogSummaryText(boolean)（当作 includeLogs）。
 */
export function buildIssueLogSummaryText(opts = {}) {
  // 布尔兼容分支：旧调用传 true/false 无级别/条数信息，等价于 ALL/100（与无参统计一致）。
  const isBool = typeof opts === 'boolean';
  const input = isBool ? { includeLogs: opts, level: 'all', count: '100' } : (opts || {});
  const includeLogs = input.includeLogs !== false;
  const level = input.level ?? ISSUE_LOG_LEVEL_DEFAULT;
  const count = input.count ?? ISSUE_LOG_COUNT_DEFAULT;
  if (!includeLogs) return t('issue.logNotIncluded');
  const p = normalizeIssueLogParams(level, count);
  const levelLabel = t(ISSUE_LEVEL_LABEL_KEY[p.level]);
  const { count: n } = getIssueLogSummary(p.level, p.count);
  if (n === 0) {
    return p.level === 'all' ? t('issue.logEmpty') : t('issue.logEmptyAtLevel', { level: levelLabel });
  }
  return t('issue.logAttached', { n, level: levelLabel });
}

/** 日志缓冲是否为空（供下拉禁用与空态文案判定）；同源取 logger。 */
function issueLogBufferEmpty() {
  try {
    return logger.getEntries('ALL').length === 0;
  } catch {
    return true;
  }
}

/**
 * 日志控件联动纯函数（可单测）：依据勾选状态返回两个下拉的禁用态与统计文案。
 * 取消勾选 → 禁用 + 「不附带日志」；勾选 → 可用 + 同源统计文案。
 */
export function applyIssueLogControlsState(includeLogs, level, count) {
  const p = normalizeIssueLogParams(level, count);
  return {
    disabled: !includeLogs,
    summaryText: buildIssueLogSummaryText({ includeLogs, level: p.level, count: p.count }),
    debugHintText: includeLogs ? issueLogDebugHintText(p.level) : '',
  };
}

/**
 * 调试/全量级别的脱敏提示文案（红队 P1）。
 * key 尚未由 i18n 专员补齐时返回英文回退；需补 key: issue.logLevelDebugHint。
 */
export function issueLogDebugHintText(level) {
  const p = normalizeIssueLogParams(level, ISSUE_LOG_COUNT_DEFAULT);
  if (p.level !== 'all' && p.level !== 'debug') return '';
  const key = 'issue.logLevelDebugHint';
  const text = t(key);
  return text === key ? 'Logs are always redacted; debug level reveals more internal detail.' : text;
}

/**
 * 行内 Markdown → 安全 HTML：仅处理行内代码 / 粗体 / 链接。
 * 关键安全顺序：先把原文整段 escapeHtml，再在已转义文本上做匹配——
 * 任何 `<` `>` `&` `"` `'` 都已是实体，插件无法借插值越出标签；
 * 链接 URL 额外经 escape.js 的 isSafeHttpUrl 校验，非 http(s) 一律退化为纯文本。
 */
function renderInline(text) {
  let out = escapeHtml(text);
  // 行内代码 `code`（先处理，避免内部 ** 被当粗体）；正则用 RegExp 构造避开字面量反引号。
  out = out.replace(new RegExp(BT + '([^' + BT + '\\n]+)' + BT, 'g'), (_, code) => '<code>' + code + '</code>');
  // 链接 [label](url)：URL 在转义后的文本里，& 已是 &amp;，校验前先还原 & 再判协议。
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, rawUrl) => {
    const decoded = rawUrl.replace(/&amp;/g, '&');
    if (!isSafeHttpUrl(decoded)) return label;
    // href 用转义后的 rawUrl（& 保持 &amp; 实体），既合规范又不破坏属性边界。
    return '<a href="' + rawUrl + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  });
  // 粗体 **text**
  out = out.replace(/\*\*([^*\n]+)\*\*/g, (_, bold) => '<strong>' + bold + '</strong>');
  return out;
}

/**
 * 安全 Markdown 子集渲染器（预览用）：标题 / 粗体 / 代码块 / 行内代码 / 列表 / 链接 / 换行。
 * 不引入任何外部依赖；每个文本片段都经过 renderInline→escapeHtml，链接协议白名单 http(s)。
 * 报告正文已由 previewRedacted 脱敏，这里只负责「可读地呈现」，不二次放宽任何注入面。
 */
export function renderMarkdownSafe(md) {
  const lines = String(md ?? '').split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let inList = false;

  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  const flushCode = () => {
    if (!inCode) return;
    out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    codeBuf = [];
    inCode = false;
  };

  /* 表格识别（红队 P2）：环境信息为 2 列 | 项 | 值 | 表格，分隔行形如 | --- | --- |。
     单元格一律经 renderInline→escapeHtml 转义，安全面与其余分支完全一致。 */
  const isTableDivider = (row) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row);
  /* splitCells 与上游 mdCell 的转义约定对齐：单元格内的 | 被写成 \|，
     故只按未转义的 | 切列，再把 \| 还原成 |，避免 th/td 数量错配。 */
  const splitCells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '')
    .split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  const isTableStart = (arr, i) => {
    const first = (arr[i] || '').trim();
    const second = (arr[i + 1] || '').trim();
    return first.startsWith('|') && second.startsWith('|') && isTableDivider(second);
  };
  const renderTable = (arr, i) => {
    const header = splitCells(arr[i]);
    const bodyRows = [];
    let j = i + 2; // 跳过表头 + 分隔行
    for (; j < arr.length && arr[j].trim().startsWith('|'); j += 1) {
      if (isTableDivider(arr[j])) continue;
      bodyRows.push(splitCells(arr[j]));
    }
    const headHtml = header.map((c) => '<th>' + renderInline(c) + '</th>').join('');
    const bodyHtml = bodyRows.map((cells) =>
      '<tr>' + cells.map((c) => '<td>' + renderInline(c) + '</td>').join('') + '</tr>').join('');
    return {
      html: '<table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table>',
      next: j,
    };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith(BT + BT + BT)) {
      if (inCode) flushCode();
      else { flushList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    if (isTableStart(lines, i)) {
      flushList();
      const table = renderTable(lines, i);
      out.push(table.html);
      i = table.next - 1; // for 循环 i+=1 后指向下一未消费行
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const lvl = heading[1].length;
      out.push('<h' + lvl + '>' + renderInline(heading[2]) + '</h' + lvl + '>');
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + renderInline(bullet[1]) + '</li>');
      continue;
    }
    flushList();
    if (line.trim() === '') continue;
    out.push('<p>' + renderInline(line) + '</p>');
  }
  flushList();
  flushCode();
  return out.join('\n');
}

/** 设置弹窗正文：分组可收起，不再全部平铺。 */
export function buildSettingsHtml(settings = {}) {
  const syncCtx = initIssueReportSync();
  issueCoordsCache = syncCtx.coords || issueCoordsCache;
  issueTemplateCache = {
    templates: syncCtx.templates || [],
    config: syncCtx.config || null,
    source: syncCtx.source || 'none',
    warning: '',
  };
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

  /* 问题报告账号下拉：基于当前平台（GitHub）已配置的账号 + 本机令牌；无账号显示空态提示。
     只读状态指示，不可切换令牌（2026-11-20 用户裁定）：账号 secret 属仓库 API 凭据体系，
     issue 令牌始终来自本机专用 localStorage（readGithubToken），不存在按账号取令牌的通路。 */
  const githubAccounts = s.gitAccounts.filter((a) => a.site === SITES.GITHUB);
  let accountOptions = '';
  let accountEmptyTitle = '';
  if (githubAccounts.length) {
    /* 选中项由持久化的 s.issueAccount 决定，缺省取第一个账号作为只读展示。 */
    accountOptions = githubAccounts.map((a) =>
      '<option value="' + escapeHtml(a.id) + '"'
      + (s.issueAccount === a.id || (!s.issueAccount && a === githubAccounts[0]) ? ' selected' : '')
      + '>' + escapeHtml(a.label || a.username || a.host) + '</option>'
    ).join('');
  } else if (readGithubToken()) {
    accountOptions = '<option value="token" selected>' + escapeHtml(t('issue.accountConfigured')) + '</option>';
  } else {
    accountOptions = '<option value="" disabled selected>' + escapeHtml(t('issue.accountEmpty')) + '</option>';
    accountEmptyTitle = escapeHtml(t('issue.accountEmptyTitle'));
  }

  /* Issue 模板：同步自本仓 .github/ISSUE_TEMPLATE（或 raw/内置降级）。
     模板文案来自 yml 原文，非中文本地化字符串，故不违反 i18n 守卫。 */
  const templates = issueTemplateCache.templates || [];

  /* 两条线坐标全部来自 resolver：取不到时按钮置灰 + 提示「未提供」(G-34)。 */
  const currentOk = issueChannelAvailable(issueCoordsCache, 'current');
  const upstreamOk = issueChannelAvailable(issueCoordsCache, 'upstream');

  /* 两条线跳转按钮：URL 全部动态拼接，取不到坐标时 disabled + 提示未提供的 key。 */
  const currentIssuesUrl = currentOk ? (issueCoordsCache.current.issuesUrl || '') : '';
  const upstreamIssuesUrl = upstreamOk ? (issueCoordsCache.upstream.issuesUrl || '') : '';
  const unavailableLabel = t('issue.unavailable');

  /* 模板选择 + 按 body[] 动态渲染字段。模板文案来自 yml，非本地化字符串。 */
  const firstTemplate = templates[0] || null;
  const templateBlock = '<label class="et-git"><span>' + t('issue.template') + '</span>'
    + '<select class="text_pole" data-setting="issueTemplate" id="issue-template-select">'
    + renderTemplateOptions(templates) + '</select></label>'
    + '<div id="issue-template-fields">'
    + (firstTemplate ? renderTemplateFields(firstTemplate) : '') + '</div>';
  const templateSourceNote = issueTemplateCache.warning
    ? '<div class="ext-note">' + t(issueTemplateCache.warning) + '</div>' : '';

  /* 强制前置勾选：均未勾选时提交按钮 disabled（由委托监听实时计算）。 */
  const prereqBlock = '<div class="issue-prereqs" id="issue-prereqs">'
    + '<label class="checkbox_label"><input type="checkbox" data-setting="issuePrereqDocs"> '
    + t('issue.prereqDocs') + ' <a href="' + escapeHtml(buildDocsRepoUrl(issueCoordsCache, 'current'))
    + '" target="_blank" rel="noopener">docs/DEVELOPER-GUIDE.md</a></label>'
    + '<label class="checkbox_label"><input type="checkbox" data-setting="issuePrereqSearch"> '
    + t('issue.prereqSearch') + ' <a href="' + escapeHtml(buildIssueSearchUrl(issueCoordsCache, s.issueTitle, 'current'))
    + '" target="_blank" rel="noopener">GitHub Issues</a></label>'
    + '<div class="ext-note" id="issue-prereq-hint"></div>'
    + '</div>';

  const issueGroup = '<label class="et-git"><span>' + t('issue.title') + '</span>'
    + '<input class="text_pole" type="text" data-setting="issueTitle" placeholder="' + t('issue.titlePlaceholder')
    + '" value="' + escapeHtml(s.issueTitle || '') + '"></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.description') + '</span>'
    + '<textarea class="text_pole" rows="3" data-setting="issueDescription" placeholder="'
    + t('issue.descriptionPlaceholder') + '">' + escapeHtml(s.issueDescription || '') + '</textarea></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.steps') + '</span>'
    + '<textarea class="text_pole" rows="3" data-setting="issueSteps" placeholder="'
    + t('issue.stepsPlaceholder') + '">' + escapeHtml(s.issueSteps || '') + '</textarea></label>'
    + '<label class="et-git" style="margin-top:6px"><span>' + t('issue.platform') + '</span>'
    + '<select class="text_pole" data-setting="issuePlatform">'
    + '<option value="github"' + (s.issuePlatform === 'github' ? ' selected' : '') + '>'
    + t('issue.platformGitHub') + '</option>'
    + '</select></label>'
    + '<label class="et-git" style="margin-top:6px"' + (accountEmptyTitle ? ' title="' + accountEmptyTitle + '"' : '') + '><span>' + t('issue.account') + '</span>'
    + '<select class="text_pole" data-setting="issueAccount" disabled>' + accountOptions + '</select></label>'
    /* 令牌不在本面板手填：真实配置处在「扩展管理 → 开发者 → Git 账号」，此处仅提示指向（复用已有 key）。 */
    + '<div class="ext-note">' + t('issue.tokenCreateHint') + '</div>'
    + '<div class="ext-note">' + t('issue.tokenStorageHint') + '</div>'
    /* 废弃兼容字段：UI 不再手填，以默认值填充供 index.js 提交路径读取。 */
    + '<input type="hidden" data-setting="issueOwner" value="' + escapeHtml(s.issueOwner || ISSUE_REPO_DEFAULT.owner) + '">'
    + '<input type="hidden" data-setting="issueRepo" value="' + escapeHtml(s.issueRepo || ISSUE_REPO_DEFAULT.repo) + '">'
    + templateSourceNote
    + templateBlock
    + prereqBlock
    + setting('set-issue-include-logs', 'issueIncludeLogs', t('issue.includeLogs'), s.issueIncludeLogs)
    /* 日志级别/条数下拉：未勾选附带日志时 disabled（联动见 issueLogChangeHandler）。
       空缓冲时保持可操作（遵循主人指令 E3「下拉仍可操作但说明清楚」），统计行给出「暂无日志」。 */
    + '<div class="issue-log-controls"' + (s.issueIncludeLogs ? '' : ' data-disabled="1"') + '>'
    + '<label class="et-git"><span>' + t('issue.logLevel') + '</span>'
    + '<select class="text_pole" data-setting="issueLogLevel" aria-describedby="issue-log-summary"'
    + (s.issueIncludeLogs ? '' : ' disabled') + '>'
    + [
        ['all', 'issue.logLevelAll'], ['info', 'issue.logLevelInfo'], ['warn', 'issue.logLevelWarn'],
        ['error', 'issue.logLevelError'], ['debug', 'issue.logLevelDebug'],
      ].map(([v, key]) =>
        '<option value="' + v + '"' + (s.issueLogLevel === v ? ' selected' : '') + '>' + t(key) + '</option>').join('')
    + '</select></label>'
    + '<label class="et-git"><span>' + t('issue.logCount') + '</span>'
    + '<select class="text_pole" data-setting="issueLogCount" aria-describedby="issue-log-summary"'
    + (s.issueIncludeLogs ? '' : ' disabled') + '>'
    /* 上限 1000 如实呈现（红队 P3）：ASCII 后缀避免硬编码中文触发 i18n 守卫。 */
    + ['50', '100', '200', '500', 'all'].map((v) =>
        '<option value="' + v + '"' + (s.issueLogCount === v ? ' selected' : '') + '>'
        + (v === 'all' ? t('issue.logCountAll') + ' (max 1000)' : v) + '</option>').join('')
    + '</select></label>'
    + '</div>'
    + '<div role="status" class="ext-note" id="issue-log-summary">'
    + escapeHtml(buildIssueLogSummaryText({ includeLogs: s.issueIncludeLogs, level: s.issueLogLevel, count: s.issueLogCount }))
    + '</div>'
    /* 调试/全量级别的脱敏提示（红队 P1）：无提示时 hidden，避免空占位。 */
    + '<div class="ext-note" id="issue-log-debug-hint"' + (issueLogDebugHintText(s.issueLogLevel) ? '' : ' hidden') + '>'
    + escapeHtml(issueLogDebugHintText(s.issueLogLevel)) + '</div>'
    + '<div class="ext-row" style="margin-top:8px">'
      + '<button type="button" class="btn" data-action="issue-preview">' + t('issue.preview') + '</button>'
      + '<button type="button" class="btn danger" data-action="issue-submit" id="issue-submit-btn"'
      + ' title="' + escapeHtml(t('issue.submitTitle')) + '">'
      + t('issue.submit') + '</button>'
    + '</div>'
    + '<div class="ext-row" style="margin-top:6px">'
      + '<button type="button" class="menu_button" id="issue-copy-report" data-issue-action="copy">'
      + t('settings.issueCopy') + '</button>'
      + '<button type="button" class="menu_button" id="issue-export-md" data-issue-action="export-md"'
      + ' title="' + escapeHtml(t('settings.issueExportMdTitle')) + '">'
      + t('settings.issueExportMd') + '</button>'
      + '<button type="button" class="menu_button" id="issue-new-issue" data-issue-action="new-issue"'
      + ' title="' + escapeHtml(t('settings.issueNewIssueTitle')) + '">'
      + t('settings.issueNewIssue') + '</button>'
    + '</div>'
    /* 两条线跳转按钮：坐标动态取，取不到置灰 + 提示未提供。 */
    + '<div class="ext-row" style="margin-top:6px">'
      + '<button type="button" class="menu_button" id="issue-current-issues" data-issue-action="open-current-issues"'
      + (currentIssuesUrl ? '' : ' disabled') + ' title="' + escapeHtml(currentIssuesUrl || unavailableLabel) + '">'
      + t('issue.currentIssues') + '</button>'
      + '<button type="button" class="menu_button" id="issue-upstream-issues" data-issue-action="open-upstream-issues"'
      + (upstreamIssuesUrl ? '' : ' disabled') + ' title="' + escapeHtml(upstreamIssuesUrl || unavailableLabel) + '">'
      + t('issue.upstreamIssues') + '</button>'
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
     若进入 out 会被 saveSettings() 双写到宿主 settings.json（违反 token 铁律）。
     issueAccount 只读状态指示，但仍持久化选中值（刷新后展示不丢）；
     issuePlatform 走 normalizeSettings 白名单。 */
  const issueOwnerEl = root.querySelector?.('[data-setting="issueOwner"]');
  if (issueOwnerEl && typeof issueOwnerEl.value === 'string') out.issueOwner = issueOwnerEl.value.trim();
  const issueRepoEl = root.querySelector?.('[data-setting="issueRepo"]');
  if (issueRepoEl && typeof issueRepoEl.value === 'string') out.issueRepo = issueRepoEl.value.trim();
  const issuePlatformEl = root.querySelector?.('[data-setting="issuePlatform"]');
  if (issuePlatformEl && issuePlatformEl.value === 'github') out.issuePlatform = issuePlatformEl.value;
  const issueAccountEl = root.querySelector?.('[data-setting="issueAccount"]');
  if (issueAccountEl && typeof issueAccountEl.value === 'string') out.issueAccount = issueAccountEl.value.trim();
  const issueTitleEl = root.querySelector?.('[data-setting="issueTitle"]');
  if (issueTitleEl && typeof issueTitleEl.value === 'string') out.issueTitle = issueTitleEl.value.trim();
  const issueDescEl = root.querySelector?.('[data-setting="issueDescription"]');
  if (issueDescEl && typeof issueDescEl.value === 'string') out.issueDescription = issueDescEl.value.trim();
  const issueStepsEl = root.querySelector?.('[data-setting="issueSteps"]');
  if (issueStepsEl && typeof issueStepsEl.value === 'string') out.issueSteps = issueStepsEl.value.trim();
  const issueLogsEl = root.querySelector?.('[data-setting="issueIncludeLogs"]');
  if (issueLogsEl && typeof issueLogsEl.checked === 'boolean') out.issueIncludeLogs = issueLogsEl.checked;
  const issueLogLevelEl = root.querySelector?.('[data-setting="issueLogLevel"]');
  if (issueLogLevelEl && ['all', 'debug', 'info', 'warn', 'error'].includes(issueLogLevelEl.value)) {
    out.issueLogLevel = issueLogLevelEl.value;
  }
  const issueLogCountEl = root.querySelector?.('[data-setting="issueLogCount"]');
  if (issueLogCountEl && ['50', '100', '200', '500', 'all'].includes(String(issueLogCountEl.value))) {
    out.issueLogCount = String(issueLogCountEl.value);
  }

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
/** 缓存文档站委托处理器引用，供 disposeSettingsPanel 移除（避免匿名监听泄漏）。 */
let docsInputHandler = null;
let docsClickHandler = null;

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

  docsInputHandler = (ev) => {
    const el = ev.target;
    if (!el || el.getAttribute?.('data-setting') !== 'docsBaseUrl') return;
    const parts = resolveParts(el);
    if (parts) syncDocsLink(parts.input, parts.link, parts.warn);
  };

  /* 草稿恢复（applySettingsDraft）直接写 value、不触发事件，故点击前再兜一次。 */
  docsClickHandler = (ev) => {
    const link = ev.target?.closest?.('#settings-open-docs');
    if (!link) return;
    const parts = resolveParts(link);
    if (parts) syncDocsLink(parts.input, parts.link, parts.warn);
  };

  document.addEventListener('input', docsInputHandler, true);
  document.addEventListener('change', docsInputHandler, true);
  document.addEventListener('click', docsClickHandler, true);
}

/** 问题报告按钮委托只注册一次；模块导入本身无副作用（Node 测试无 document）。 */
let issueReportWired = false;
/** 缓存委托 click 处理器，供 disposeSettingsPanel 移除；随 ensure 注册时赋值。 */
let issueClickHandler = null;
/** 缓存日志勾选 change 处理器，用于勾选切换时刷新附带统计文案。 */
let issueLogChangeHandler = null;
/** 缓存 issue 模板/前置勾选 change 处理器，用于切换模板与刷新提交按钮 disabled。 */
let issueTemplateChangeHandler = null;
/** 日志联动文案写入的 debounce 定时器（避免连续切换时读屏播报堆积）；首次渲染不 debounce。 */
let issueLogSyncTimer = null;

/** 依据两项前置勾选刷新提交按钮语义与缺失提示（按钮始终可点击，拦截在提交路径统一做）。 */
function refreshIssuePrereqs(body) {
  const docs = body?.querySelector?.('[data-setting="issuePrereqDocs"]')?.checked === true;
  const search = body?.querySelector?.('[data-setting="issuePrereqSearch"]')?.checked === true;
  const met = issuePrereqsMet({ docs, search });
  const submitBtn = body?.querySelector?.('#issue-submit-btn');
  // 关键：不设 disabled。禁用按钮点击不触发事件、无法提示（G-20 失败不静默）。
  // 未勾选仅标记 data/aria 供样式，点击由 submitIssueReport 统一拦截 + toast。
  if (submitBtn) {
    submitBtn.setAttribute('data-prereq-met', met ? '1' : '0');
    submitBtn.setAttribute('aria-disabled', met ? 'false' : 'true');
  }
  const hint = body?.querySelector?.('#issue-prereq-hint');
  if (hint && typeof hint.textContent === 'string') {
    const missing = issuePrereqsMissing({ docs, search });
    hint.textContent = missing.length ? t('issue.prereqHint', { items: missing.map((k) => t('issue.prereq.' + k)).join(' / ') }) : '';
  }
}

/** 读取设置弹窗里的问题报告字段与日志开关；未渲染时返回确定默认值。 */
export function readIssueReportForm(body) {
  const val = (key) => {
    const el = body?.querySelector?.('[data-setting="' + key + '"]');
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  };
  const checked = (key) => {
    const el = body?.querySelector?.('[data-setting="' + key + '"]');
    return !!el && el.checked === true;
  };
  const logsEl = body?.querySelector?.('[data-setting="issueIncludeLogs"]');
  const current = issueCoordsCache.current;
  return {
    title: val('issueTitle'),
    description: val('issueDescription'),
    steps: val('issueSteps'),
    /* 只读账号指示：记录用户看到的账号 id / 'token' / ''；令牌仍走 readGithubToken。 */
    issueAccount: val('issueAccount'),
    /* 仓库坐标来自 resolver 动态缓存，绝不硬编码；取不到为空串，UI 置灰。 */
    owner: presentCoord(current?.owner),
    repo: presentCoord(current?.repo),
    /* 模板选择 + 动态字段值 + 前置勾选。 */
    templateName: val('issueTemplate'),
    fieldValues: collectTemplateFields(body),
    prereqs: { docs: checked('issuePrereqDocs'), search: checked('issuePrereqSearch') },
    docsUrl: buildDocsRepoUrl(issueCoordsCache, 'current'),
    searchUrl: buildIssueSearchUrl(issueCoordsCache, val('issueTitle') || val('issueDescription'), 'current'),
    includeLogs: typeof logsEl?.checked === 'boolean' ? logsEl.checked : true,
    /* 日志级别/条数：与下拉 option value 对齐，非法值由 normalizeIssueLogParams 回落。 */
    logLevel: val('issueLogLevel'),
    logCount: val('issueLogCount'),
  };
}

/** 坐标归一：仅非空字符串保留，其余返回空串（G-34 禁假数据）。 */
function presentCoord(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** 采集动态模板字段：[data-issue-field] 的值；checkboxes 多选聚合成数组。 */
function collectTemplateFields(body) {
  const values = {};
  const nodes = body?.querySelectorAll?.('[data-issue-field]');
  if (!nodes || typeof nodes.forEach !== 'function') return values;
  nodes.forEach((el) => {
    const id = el.getAttribute?.('data-issue-field');
    if (!id) return;
    if (el.type === 'checkbox') {
      if (el.checked) {
        if (!Array.isArray(values[id])) values[id] = [];
        values[id].push(el.value);
      }
    } else if (typeof el.value === 'string') {
      values[id] = el.value.trim();
    }
  });
  return values;
}

/** 采集环境并组装脱敏报告全文；includeLogs 由当前勾选状态透传。 */
async function composeIssueReportText(body) {
  const form = readIssueReportForm(body);
  const env = await collectReportEnv();
  const p = normalizeIssueLogParams(form.logLevel, form.logCount);
  const text = previewRedacted(buildReportMarkdown({
    env,
    userInput: { title: form.title, description: form.description, steps: form.steps },
    includeLogs: form.includeLogs,
    /* 与统计同源：级别/条数按同一归一化 + 映射表透传给报告组装。 */
    logLevel: ISSUE_LEVEL_TO_REPORT[p.level],
    logCount: p.count,
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

/** 用按钮自身的 timer 句柄做互斥，避免连续闪烁时旧 timer 提前还原文案。 */
const flashTimers = new WeakMap();
function flashLabel(btn, msg) {
  if (!btn || typeof btn.textContent !== 'string') return;
  const prev = flashTimers.get(btn);
  if (prev && typeof clearTimeout === 'function') clearTimeout(prev);
  const original = btn.textContent;
  btn.textContent = msg;
  const timer = setTimeout(() => {
    btn.textContent = original;
    flashTimers.delete(btn);
  }, 1500);
  flashTimers.set(btn, timer);
}

/**
 * issue 提交统一二次确认：每次提交必弹，不可配置跳过。
 * 有工作台 openModal 时复用 #confirm-dialog；否则降级 window.confirm。
 * 无任何确认能力时保守不发——宁可不成，也不可无确认就提交。
 */
function confirmIssueSubmit(onConfirm) {
  const body = t('issue.confirmBody');
  const api = issueModalApi;
  if (api && typeof api.openModal === 'function') {
    api.openModal(
      t('issue.confirmTitle'),
      body,
      [],
      [
        { label: t('modal.cancel'), onClick: () => { api.closeModal?.(); } },
        { label: t('issue.confirmSubmit'), primary: true, onClick: () => { api.closeModal?.(); onConfirm(); } },
      ],
    );
    return;
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (window.confirm(body)) onConfirm();
  }
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

    /* 两条线跳转：URL 从动态坐标拼接，取不到（坐标未提供）直接提示，绝不拼假 URL。 */
    if (action === 'open-current-issues' || action === 'open-upstream-issues') {
      const key = action === 'open-current-issues' ? 'current' : 'upstream';
      const channel = issueCoordsCache[key];
      const url = issueChannelAvailable(issueCoordsCache, key) ? (channel?.issuesUrl || '') : '';
      if (!url) { flashLabel(btn, t('issue.unavailable')); return; }
      if (typeof window === 'undefined' || typeof window.open !== 'function') return;
      const opened = window.open(url, '_blank', 'noopener');
      if (!opened) flashLabel(btn, t('settings.issuePopupBlocked'));
      return;
    }

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
        if (!issuePrereqsMet(form.prereqs)) {
          const items = issuePrereqsMissing(form.prereqs).map((k) => t('issue.prereq.' + k)).join(' / ');
          flashLabel(btn, t('issue.prereqHint', { items }));
          return;
        }
        if (typeof window === 'undefined' || typeof window.open !== 'function') return;
        const tpl = (issueTemplateCache.templates || []).find((x) => x.name === form.templateName)
          || (issueTemplateCache.templates || [])[0] || null;
        const envText = text || '';
        // 固定表单字段映射到模板同名字段；动态字段值后置以覆盖固定值（用户显式填写优先）。
        const mergedValues = {
          summary: form.description,
          steps: form.steps,
          ...(form.fieldValues || {}),
        };
        const templateBody = buildIssueTemplateBody(tpl, mergedValues, {
          prereqs: form.prereqs,
          docsUrl: form.docsUrl,
          searchUrl: form.searchUrl,
          envText,
        });
        const result = buildGitHubNewIssueUrlSafe({
          owner: form.owner || undefined,
          repo: form.repo || undefined,
          title: form.title,
          body: templateBody,
        });
        if (!result.ok) {
          if (result.reason === 'too-long') {
            // URL 超过 GitHub 阈值会打开空白页，不跳转，提示改用复制或 API 提交（G-20 失败不静默）。
            flashLabel(btn, t('issue.urlTooLong'));
            return;
          }
          if (result.reason === 'no-coords') {
            flashLabel(btn, t('issue.unavailable'));
            return;
          }
          return;
        }
        // 每次网页提交必弹二次确认，确认后才 window.open；取消则不发（无跳过配置）。
        confirmIssueSubmit(() => {
          const opened = window.open(result.url, '_blank', 'noopener');
          // 弹窗被浏览器拦截时 window.open 返回 null，必须告知用户而不是静默失败。
          if (!opened) flashLabel(btn, t('settings.issuePopupBlocked'));
        });
      }
    }).catch(() => {
      flashLabel(btn, t('settings.issueCopyFail'));
    });
  };

  document.addEventListener('click', issueClickHandler, false);

  /* 日志联动：勾选/级别/条数任一变化时实时刷新统计、脱敏提示与下拉禁用态。
     文案同源取自 applyIssueLogControlsState → buildIssueLogSummaryText → buildReportMarkdown。 */
  issueLogChangeHandler = (ev) => {
    const el = ev.target;
    const name = el?.getAttribute?.('data-setting');
    if (!['issueIncludeLogs', 'issueLogLevel', 'issueLogCount'].includes(name)) return;
    const host = el.closest('#settings-body') || document;
    const includeEl = host.querySelector?.('[data-setting="issueIncludeLogs"]');
    const levelEl = host.querySelector?.('[data-setting="issueLogLevel"]');
    const countEl = host.querySelector?.('[data-setting="issueLogCount"]');
    const includeLogs = includeEl ? includeEl.checked === true : el.checked === true;
    const level = levelEl?.value || 'all';
    const count = countEl?.value || '100';
    const state = applyIssueLogControlsState(includeLogs, level, count);

    /* disabled 同步：两个下拉与勾选状态一致，即时生效（不做 debounce）。 */
    for (const sel of [levelEl, countEl]) {
      if (sel && 'disabled' in sel) sel.disabled = state.disabled;
    }
    const controls = host.querySelector?.('.issue-log-controls');
    if (controls) {
      if (state.disabled) controls.setAttribute('data-disabled', '1');
      else controls.removeAttribute('data-disabled');
    }

    /* live region 文案做 200ms debounce，避免连续切换时读屏播报堆积。 */
    if (issueLogSyncTimer !== null && typeof clearTimeout === 'function') clearTimeout(issueLogSyncTimer);
    const applyText = () => {
      const summary = host.querySelector?.('#issue-log-summary');
      if (summary && typeof summary.textContent === 'string') summary.textContent = state.summaryText;
      const hint = host.querySelector?.('#issue-log-debug-hint');
      if (hint) {
        hint.textContent = state.debugHintText;
        hint.hidden = !state.debugHintText;
      }
      issueLogSyncTimer = null;
    };
    if (typeof setTimeout === 'function') issueLogSyncTimer = setTimeout(applyText, 200);
    else applyText();
  };
  document.addEventListener('change', issueLogChangeHandler, false);

  /* 模板切换：按选中 name 重新渲染字段；前置勾选：实时刷新提交按钮 disabled。 */
  issueTemplateChangeHandler = (ev) => {
    const el = ev.target;
    const name = el?.getAttribute?.('data-setting');
    if (name === 'issuePrereqDocs' || name === 'issuePrereqSearch') {
      refreshIssuePrereqs(el.closest('#settings-body') || document);
      return;
    }
    if (name !== 'issueTemplate') return;
    const host = el.closest('#settings-body') || document;
    const tpl = (issueTemplateCache.templates || []).find((x) => x.name === el.value);
    const fieldsHost = host.querySelector?.('#issue-template-fields');
    if (tpl && fieldsHost && 'innerHTML' in fieldsHost) {
      // dom-injection-guard:allow renderTemplateFields 内部对每个 yml 文案字段均经 escHtml 转义，输出为可信安全 markup
      fieldsHost.innerHTML = renderTemplateFields(tpl);
    }
    refreshIssuePrereqs(host);
  };
  document.addEventListener('change', issueTemplateChangeHandler, false);

  /* 首帧同步：若面板已渲染，按当前勾选设置提交按钮初始态。 */
  refreshIssuePrereqs(document);

  /* 异步补全（仅浏览器）：拿到真实上游坐标后刷新两条线按钮可用态；静默降级。
     Node 测试环境无 window，跳过以避免网络请求与日志计数扰动。 */
  if (typeof window !== 'undefined') {
    void initIssueReportContext().then(() => {
      const refreshLink = (sel, key) => {
        const btn = typeof document !== 'undefined' ? document.querySelector?.(sel) : null;
        if (!btn || !('disabled' in btn)) return;
        const ok = issueChannelAvailable(issueCoordsCache, key);
        const url = ok ? (issueCoordsCache[key]?.issuesUrl || '') : '';
        btn.disabled = !url;
        if ('title' in btn) btn.title = url || t('issue.unavailable');
      };
      refreshLink('#issue-current-issues', 'current');
      refreshLink('#issue-upstream-issues', 'upstream');
    }).catch(() => { /* 静默降级：保留同步首帧的置灰态 */ });
  }
}

/** 单页常驻下不会被调用，供 HMR / 测试 / 未来卸载路径使用：注销问题报告 click 委托并复位注册标志。 */
export function disposeSettingsPanel() {
  if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    if (issueClickHandler) document.removeEventListener('click', issueClickHandler, false);
    if (issueLogChangeHandler) document.removeEventListener('change', issueLogChangeHandler, false);
    if (issueTemplateChangeHandler) document.removeEventListener('change', issueTemplateChangeHandler, false);
    // 文档站委托监听（捕获阶段）一并移除，避免 HMR / 测试卸载后残留
    if (docsInputHandler) {
      document.removeEventListener('input', docsInputHandler, true);
      document.removeEventListener('change', docsInputHandler, true);
    }
    if (docsClickHandler) document.removeEventListener('click', docsClickHandler, true);
  }
  if (issueLogSyncTimer !== null && typeof clearTimeout === 'function') {
    clearTimeout(issueLogSyncTimer);
    issueLogSyncTimer = null;
  }
  issueClickHandler = null;
  issueLogChangeHandler = null;
  issueTemplateChangeHandler = null;
  issueReportWired = false;
  docsInputHandler = null;
  docsClickHandler = null;
  docsSyncWired = false;
}
