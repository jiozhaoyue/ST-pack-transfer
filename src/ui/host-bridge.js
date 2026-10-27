/**
 * 宿主环境桥接与增量流控模块 (SillyTavern & Luker)
 * 负责环境嗅探、CSRF Token 获取、细粒度备份拉取、恢复写入（合并/覆盖）与多包合并。
 */

import { logger } from '../core/logger.js';
import { zipIo, readZipEntryManifest } from '../core/zip-io.js';
import { buildTargetManifest } from '../core/target-inventory.js';
import * as zip from '../vendor/zip.js';
import { isSafeHttpUrl, trustedStaticMarkup } from './escape.js';
import {
  AVAILABILITY,
  isInstallableUrl,
  normalizeManifestEntries,
  shouldAutoOpenInstaller,
} from '../core/extension-manifest.js';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DOWNLOAD_STALL_TIMEOUT_MS,
  SHORT_FETCH_TIMEOUT_MS,
  TimeoutError,
  UPLOAD_TIMEOUT_MS,
  fetchWithTimeout,
  readJsonBounded,
  readStreamChunkBounded,
} from './fetch-bounds.js';
import { STAGE_LABELS } from '../core/stage-timings.js';
import { buildEndpointSelection } from '../core/selection-defaults.js';

/**
 * 恢复在途标志（并发互斥）。
 *
 * 两个 `restoreToHost` 并发写同一用户目录时宿主侧行为未定义，故在途时直接拒绝第二次调用。
 * UI 层经 `isRestoreInFlight()` 查询以禁用全部「写回宿主」入口。
 */
let restoreInFlight = false;

/**
 * 在途恢复的内部取消控制器。
 *
 * 存在原因（审计 R-01）：大包上传可能持续数分钟，此前用户**唯一能做的只有刷新页面**。
 * 内部持有控制器而非要求调用方自建，是为了让「取消」在无 DOM 的 Node 环境下也可被测试，
 * 同时收敛成单一取消入口（`cancelRestoreInFlight`）。
 */
let restoreAbort = null;

/** @returns {boolean} 是否有恢复事务正在进行 */
export function isRestoreInFlight() {
  return restoreInFlight;
}

/**
 * 取消在途的恢复写入（R1「UI 提供取消入口」）。
 *
 * 取消是**请求级**的：已上传的数据宿主可能已部分落盘，故调用方必须提示用户
 * 「宿主可能仍在处理，请稍后核对数据」。无在途恢复时为无操作。
 * @returns {boolean} 是否确实取消了一个在途恢复
 */
export function cancelRestoreInFlight() {
  if (!restoreAbort) return false;
  restoreAbort.abort();
  return true;
}

/**
 * 恢复端点候选表（**只作首选顺序**，不是「平台 ↔ 端点」的静态断言）。
 *
 * 事实依据（2026-09-25 认证态黑盒实测，见任务
 * `.trellis/tasks/09-25-batch-restore-luker-endpoint/research/host-endpoint-facts.md`）：
 *   - Luker 2.7.0：`/api/users/restore` → 404；`/api/users/restore-backup` 存在（空体 → 400）。
 *   - ST 1.19.0：两者**均为 404** —— ST 不提供整包恢复能力。
 * 命中结果记入会话缓存，宿主版本演进时靠 404 回退自愈，故本表无需随版本维护。
 */
const RESTORE_ENDPOINT_CANDIDATES = Object.freeze({
  luker: Object.freeze(['/api/users/restore-backup', '/api/users/restore']),
  st: Object.freeze(['/api/users/restore', '/api/users/restore-backup']),
});

/** 会话内命中的恢复端点（不持久化；刷新页面即重新探测） */
let restoreEndpointHit = null;

/**
 * 会话内恢复能力标记：`'unknown'` | `'available'` | `'unsupported'`。
 *
 * `'unsupported'` = 全部候选返回 404/405 ⇒ **本宿主没有整包恢复能力**（ST 实测如此）。
 * 此时必须禁用恢复入口并给出「改用宿主原生方式导入」的说明：既不得把 404 报成「恢复失败」，
 * 也不得留下点了必然失败的按钮（本仓「不出现死按钮」原则）。
 */
let restoreCapability = 'unknown';

/** 判定为不支持时记录「已探测端点 → 状态码」，供 UI 展示原因 */
let restoreUnsupportedDetail = '';

/** @returns {'unknown'|'available'|'unsupported'} 本会话内探测到的恢复能力 */
export function getRestoreCapability() {
  return restoreCapability;
}

/** @returns {boolean} 本宿主是否已被判定为「无整包恢复能力」 */
export function isRestoreUnsupported() {
  return restoreCapability === 'unsupported';
}

/** @returns {string} 不支持时的人类可读原因（含已探测端点），否则空串 */
export function getRestoreUnsupportedReason() {
  return restoreUnsupportedDetail;
}

/**
 * 只读调试探针：供自动化（E2E）断言恢复能力**三态**。
 *
 * 存在的理由：`restoreCapability` 是模块级 `let`，此前**没有任何出口**给页面侧读取
 * ⇒ Playwright 只能验非破坏性的可见性契约，**断言不了真正的三态**（R-19）。
 *
 * 三条硬约束（`design.md` D3.2，违约即缺陷）：
 * 1. **只读**：返回 `Object.freeze` 的快照，**不得**暴露 setter
 *    （否则 E2E 能伪造状态，断言当场失去判别力）；
 * 2. **不成为攻击面**：只暴露**能力枚举 + 原因文案**，
 *    **不得**含 CSRF token / user handle / 文件系统路径
 *    —— 那些有各自的受控获取路径（`getCsrfToken()` / `getHandle()`），不从这里漏出；
 * 3. **挂载由调用方负责**：本函数只在 `host-bridge`（平台差异唯一落点，`L0-9`）产出数据，
 *    是否挂到 `window` 由 `index.js` 决定（含占用检查）。
 *
 * 挂载后须在 `.trellis/spec/frontend/hook-guidelines.md` 的「无全局命名空间」一节**登记**
 * （该节 `:121` 的明文要求）。
 *
 * @returns {Readonly<{capability: 'unknown'|'available'|'unsupported', unsupportedReason: string}>}
 */
export function getRestoreProbe() {
  return Object.freeze({
    capability: restoreCapability,
    unsupportedReason: restoreUnsupportedDetail || '',
  });
}

/** 构造「本宿主无恢复能力」错误（统一文案，避免各处措辞漂移） */
function restoreUnsupportedError() {
  const err = new Error(
    `本宿主未提供整包恢复接口（已探测：${restoreUnsupportedDetail}）。`
    + '请改用宿主原生的导入方式恢复数据包。',
  );
  err.code = 'RESTORE_UNSUPPORTED';
  return err;
}

/**
 * 按平台候选序提交恢复请求，**仅在 404/405 时**回退下一候选。
 *
 * 安全约束（硬）：非 404/405 的失败（超时 / 5xx / 413 / 网络中断 / 取消）一律原样交回，
 * **绝不**改试另一端点——那些情况下请求可能已被宿主处理，换端点重试等于对同一用户目录重复写入。
 *
 * `formData` 内的 body 是 Blob（非流），可安全重复提交。
 *
 * @param {FormData} formData 含 `avatar` / `handle` / `mode` / `incremental` 的表单体
 * @param {{platform: string, token: string, signal?: AbortSignal, timeoutMs?: number}} opts
 * @returns {Promise<Response>} 首个「非 404/405」响应（无论其成败，交由调用方按既有三态处理）
 * @throws {Error} 全部候选均 404/405 时抛 `code='RESTORE_UNSUPPORTED'`
 */
async function postRestoreWithFallback(formData, { platform, token, signal, timeoutMs }) {
  const candidates = RESTORE_ENDPOINT_CANDIDATES[platform] || RESTORE_ENDPOINT_CANDIDATES.st;
  // 命中缓存优先（会话内后续恢复直接打已验证端点，省一次 404 往返）
  const ordered = restoreEndpointHit && candidates.includes(restoreEndpointHit)
    ? [restoreEndpointHit, ...candidates.filter((ep) => ep !== restoreEndpointHit)]
    : candidates;
  const attempted = [];
  for (const endpoint of ordered) {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-CSRF-Token': token,
      },
      body: formData,
    }, { timeoutMs, signal, label: '恢复数据包至宿主' });

    if (response.status !== 404 && response.status !== 405) {
      restoreEndpointHit = endpoint;
      restoreCapability = 'available';
      return response;
    }
    // 404/405 = 该路径无此路由（或方法不符）→ 请求未达处理器，无副作用，可安全试下一候选
    logger.warn(`恢复端点不可用，尝试下一候选：${endpoint} → HTTP ${response.status}`);
    attempted.push(`${endpoint} → ${response.status}`);
  }
  restoreCapability = 'unsupported';
  restoreUnsupportedDetail = attempted.join('、');
  const err = restoreUnsupportedError();
  logger.error(err.message);
  throw err;
}

/**
 * 安全渲染状态文本：图标拆为独立节点，文本走 textContent。
 *
 * 存在原因：安装失败时的错误消息可能来自宿主响应正文（用户/服务端可控），
 * 若走 innerHTML 模板插值即构成注入面。
 * @param {HTMLElement|null} el 目标元素
 * @param {string} iconClass Font Awesome 类名（空则不加图标）
 * @param {string} text 展示文本（按纯文本处理）
 * @param {string} [color] 文本颜色
 * @param {string} [iconColor] 图标颜色（缺省继承文本色）
 */
function setStatusContent(el, iconClass, text, color, iconColor) {
  if (!el) return;
  el.textContent = '';
  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = iconClass;
    if (iconColor) icon.style.color = iconColor;
    el.appendChild(icon);
    el.appendChild(document.createTextNode(' '));
  }
  el.appendChild(document.createTextNode(text));
  if (color) el.style.color = color;
}

/**
 * 宿主平台代码 → 转换器布局代码映射。
 * convert() 只接受 st|l|tt|pt (src/core/transform.js TARGETS)，
 * 而 detectHost() 返回 st|luker|standalone —— 'luker' 必须映射为 'l'，
 * 否则宿主导出直出路径把 'luker' 传给 convert() 会抛
 * "convert: target 必须是 st|l|tt|pt 之一"。
 * @param {'st'|'luker'|'standalone'|string} platform detectHost() 平台代码
 * @returns {string} 转换器布局代码 (st|l) 或原样透传
 */
export function hostLayoutCode(platform) {
  if (platform === 'luker') return 'l';
  return platform;
}

/** 转换器接受的四个布局码（`convert()` 的 TARGETS 子集）。 */
const TARGET_LAYOUT_CODES = new Set(['st', 'l', 'tt', 'pt']);

/**
 * 目标选择器的**原始值** → 转换器布局代码（`st|l|tt|pt`）。
 *
 * 2026-10-27 R1.2 起选择器只有四项英文全称（值仍是布局码），
 * 旧版 `native` 选项已删除——「宿主原生格式」的等价物就是当前宿主那一项本身。
 *
 * @param {string} [rawValue] 选择器原始值
 * @param {'st'|'luker'|'standalone'|string} [platform] 当前宿主平台码（保留签名，仅用于空值兜底）
 * @param {string} [fallback='l'] 选择器缺失/为空时的缺省布局码
 * @returns {string} 布局码 `st|l|tt|pt`
 */
export function resolveTargetLayout(rawValue, platform, fallback = 'l') {
  const known = TARGET_LAYOUT_CODES;
  const v = String(rawValue ?? '').trim();
  if (known.has(v)) return v;
  // 未知值（含已删除的旧版 `native`、脏存档）一律回落到当前宿主布局：
  // 「宿主原生格式」的语义本来就等于宿主那一项，不能把字符串直接交给转换器。
  const hostLayout = hostLayoutCode(platform || '');
  if (known.has(hostLayout)) return hostLayout;
  return known.has(fallback) ? fallback : 'st';
}

/**
 * 宿主导出端点的**缺省选择体**：只含 10 个标准类目、全 `true`。
 *
 * 由唯一默认源派生（`src/core/selection-defaults.js`）——形状与既往逐字节相同，
 * 只是不再手写第二份字面量（用户 2026-10-14 裁定 OQ-1「13 键为准」后的统一）。
 * 特殊类目（backups/cache/appPrivate）**不在**这里：它们走插件侧的 `include*` 参数，不走端点布尔。
 */
export const FULL_SELECTION = buildEndpointSelection();

/**
 * 宿主平台代码 → `/api/users/backup` 是否支持 **selection 透传**。
 *
 * **显式声明，不做布尔推导**（R4.1）。此前该判断是 `index.js` 里的一行
 * `host.platform === 'luker'`——新增宿主时会**静默**走入错误分支，
 * 且看不出「其它宿主到底是不支持还是没验过」。
 *
 * 语义差异：
 * - `st`：端点不支持 selection → 必须请求全量包，类目筛选在**插件内过滤**生效。
 * - `luker`：端点原生支持 selection → **直接透传**勾选。
 * - `tt` / `pt`：**未取证**，按保守处理（不支持 → 全量 + 插件内过滤）——
 *   结果正确，只是多传一些字节。
 *
 * 未列出的宿主同样按「不支持」处理；调用方可通过 `known: false` 区分
 * 「确认不支持」与「未取证」。
 */
const BACKUP_SELECTION_SUPPORT = Object.freeze({
  st: false,
  luker: true,
  tt: false,
  pt: false,
});

/**
 * 求值宿主 `/api/users/backup` 的 selection 能力——**唯一求值点**（R4.1）。
 *
 * @param {'st'|'luker'|'standalone'|string} platform detectHost() 平台代码
 * @returns {{ supported: boolean, known: boolean, reason: string }}
 *   `supported` 是否可透传 selection；
 *   `known` 该宿主是否已取证（false = 走保守路径）；
 *   `reason` **状态读数**（非解释性文案，可直接展示）
 */
export function hostSelectionCapability(platform) {
  const declared = BACKUP_SELECTION_SUPPORT[platform];
  return {
    supported: declared === true,
    known: declared !== undefined,        // 区分「确认不支持」与「未取证」
    reason: declared === true ? '宿主透传勾选' : '全量导出后插件内过滤',   // 状态读数
  };
}

/**
 * 拉取前预览文案（R-A5 纯函数）：发起宿主拉取前给用户看的**状态读数行**。
 * 数据源零新增请求——类目数来自选择表，能力读数来自 `hostSelectionCapability` 声明表。
 * 不支持透传的宿主按端点实际行为展示全量数（FULL_SELECTION 的真值类目数），不展示用户勾选数。
 * @param {'st'|'luker'|string} platform 宿主平台码
 * @param {Record<string, boolean>} [selection] 当前类目勾选（13 键表；透传宿主才采用）
 * @returns {string} 如「将拉取 8 类目 · 宿主透传勾选」
 */
export function describeHostFetchPlan(platform, selection = null) {
  const cap = hostSelectionCapability(platform);
  const base = cap.supported && selection ? selection : FULL_SELECTION;
  const count = Object.values(base).filter(Boolean).length;
  return `将拉取 ${count} 类目 · ${cap.reason}`;
}

/**
 * 宿主注册表（R-A4，数据驱动判定——新增宿主＝加一行，不改判定逻辑）。
 *
 * 判据全部为 2026-10-14 实测（四宿主取证，见 workbench-single-view.md §6）：
 *  - `globalFlag`：前端全局标识（数组顺序即判定优先级；Luker 同时暴露 SillyTavern 全局，故必须最先判）
 *  - `agentIncl` / `agentPrefix`：`/version` 响应 `agent` 串的二级复核特征
 *  - `domProbe`：仅 st 用的 DOM 兜底（老版 ST 可能无全局只有挂载点）
 */
const HOST_REGISTRY = Object.freeze([
  Object.freeze({ code: 'luker', globalFlag: 'lukerContext', agentPrefix: 'Luker', versionKeys: ['stCompatVersion'] }),
  Object.freeze({ code: 'tt', globalFlag: '__TAURITAVERN__', agentIncl: 'TauriTavern' }),
  Object.freeze({ code: 'pt', globalFlag: '__PURE_TAVERN__', agentIncl: 'PureTavern' }),
  Object.freeze({ code: 'st', globalFlag: 'SillyTavern', agentPrefix: 'SillyTavern', domProbe: '#extensionsMenu' }),
]);

/** 注册表单条是否命中（globalFlag 为惰性 getter 时读取可能抛错，按未命中继续） */
function registryHit(entry) {
  try {
    if (typeof globalThis[entry.globalFlag] !== 'undefined') return true;
  } catch {
    // lukerContext 惰性 getter 在宿主脚本未就绪时可能抛错，走后续判据
  }
  if (entry.domProbe && typeof document !== 'undefined' && document.querySelector(entry.domProbe)) {
    return true;
  }
  return false;
}

/**
 * 检测当前运行环境（第 1 级：前端全局，同步）
 *
 * 返回 platform ∈ st|luker|tt|pt|standalone：
 *  - 命中注册表 → 对应宿主码（isPlugin: true）
 *  - 无任何宿主信号 → `standalone`（独立 Web / Node）
 *
 * `unknown` **不在本层产生**——本层的信号集是穷举的（四宿主判据全量登记），
 * 硬造一个不可达分支就是死代码。未登记宿主的兜底在两处：
 *  - 第 2 级 `verifyHostPlatform()`：`/version` 响应形如宿主但映射不上任何注册项 → `unknown`；
 *  - 展示层 `currentHostLabel()`：探测抛错 → `unknown`。
 *
 * 第 2 级复核（`/version` 的 `agent` 串）两级不一致以服务端为准。
 *
 * @returns {{ platform: 'st'|'luker'|'tt'|'pt'|'standalone', isPlugin: boolean, confidence: 'frontend'|'none' }}
 */
export function detectHost() {
  if (typeof window === 'undefined') {
    return { platform: 'standalone', isPlugin: false, confidence: 'none' };
  }
  for (const entry of HOST_REGISTRY) {
    if (registryHit(entry)) {
      return { platform: entry.code, isPlugin: true, confidence: 'frontend' };
    }
  }
  return { platform: 'standalone', isPlugin: false, confidence: 'none' };
}

/** 宿主原生弹窗标题——插件自身的功能名，非说明性文案（R4）。确认与信息提示共用同一标题 */
const HOST_DIALOG_TITLE = '数据包转运';

/**
 * 读取宿主上下文对象（`SillyTavern.getContext()`）。
 * ST 与 Luker 均暴露该全局（Luker `script.js` 亦暴露 `SillyTavern`），
 * 独立态、宿主脚本未就绪或调用抛错时返回 null。
 * @returns {object|null}
 */
function getHostContext() {
  try {
    const st = globalThis.SillyTavern;
    return st && typeof st.getContext === 'function' ? st.getContext() : null;
  } catch {
    return null;
  }
}

/**
 * 宿主原生确认对话框适配器（L0-11：适配器 + 特性检测 + 静默降级）。
 *
 * 优先使用**官方文档记载**的 `SillyTavern.getContext().Popup.show.confirm(header, text)`，
 * 返回 `Promise<POPUP_RESULT|null>`（ST `popup.js` 与 Luker 同名副本签名一致）。
 * 宿主不可用（独立态 / 非 ST 系宿主 / 脚本未就绪）或调用抛错时，
 * 静默降级为 `window.confirm`，主路径不阻塞、不缺失。
 *
 * @param {string} message 确认文案
 * @returns {Promise<boolean>} 用户是否确认
 */
export async function confirmDialog(message) {
  const ctx = getHostContext();
  const hostConfirm = ctx?.Popup?.show?.confirm;
  const affirmative = ctx?.POPUP_RESULT?.AFFIRMATIVE;
  // 两者齐备才走宿主原生弹窗；POPUP_RESULT 缺失时不猜常量值，直接降级
  if (typeof hostConfirm === 'function' && affirmative !== undefined) {
    try {
      const result = await hostConfirm(HOST_DIALOG_TITLE, message);
      return result === affirmative;
    } catch (err) {
      console.warn('[ST-pack-transfer] 宿主原生确认弹窗不可用，降级为原生 confirm：', err);
    }
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message);
  }
  // 无任何确认手段（纯 Node 环境）：不阻断调用方
  return true;
}

/**
 * 宿主原生**信息提示**适配器（R5，2026-09-26）。
 *
 * 为什么是 `Popup.show.text` 而不是 `Popup.show.alert`：
 * **官方文档里没有 alert**。`docs.sillytavern.app`（Writing Extensions）只文档化了
 * `Popup.show.confirm` / `.input` / `.text` 三个方法，其中 `.text(header, text)`
 * 被标为 "Information display"——即"只显示一条信息"的那一个。
 * 运行时交叉核对（`research/host-api-check-8003.json`）：`getContext().Popup.show`
 * 的方法键**恰为** `['confirm','input','text']`，与文档一致。
 * ⇒ 按 L1-MR-5（API 事实以官方文档为准、禁止翻源码猜 API），此处用 `.text`；
 *   **不得**由 `.confirm` 的形状外推出一个 `alert`。
 *
 * 降级链与 `confirmDialog` 同构，逐级不抛：宿主 `.text` → `window.alert` → 纯 Node 静默返回。
 * 注意宿主路径是**非阻塞**的（Promise），浏览器 `alert` 是**阻塞**的：
 * 调用方在同步上下文里用 `void alertDialog(...)`，在 async 上下文里 `await`。
 *
 * @param {string} message 提示正文
 * @param {string} [title] 标题，默认插件功能名
 * @returns {Promise<void>}
 */
export async function alertDialog(message, title = HOST_DIALOG_TITLE) {
  const ctx = getHostContext();
  const hostText = ctx?.Popup?.show?.text;
  if (typeof hostText === 'function') {
    try {
      await hostText(title, message);
      return;
    } catch (err) {
      console.warn('[ST-pack-transfer] 宿主原生信息弹窗不可用，降级为原生 alert：', err);
    }
  }
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  }
  // 无任何提示手段（纯 Node 环境）：静默返回，不阻断调用方
}

/**
 * 宿主存储面板模块的加载地址（**宿主根绝对路径**）。
 *
 * 为何不走 `getContext()`：Luker 的 `public/scripts/storage-inspector.js` 虽导出
 * `openStorageInspector` / `mountStorageInspector` / `createStorageInspector`，
 * 但**没有 `window` 挂载、也没有放进 `getContext()`**（2026-09-25 由 GitHub 源码 +
 * 8003 实机双向核实），全仓唯一调用方是宿主自己的 `public/scripts/user.js:17`。
 *
 * 为何用根绝对路径而非相对路径：宿主把 `public/` 挂在站点根，故该路径与插件自身
 * 安装位置无关（ST 在 `public/scripts/extensions/third-party/**`、
 * Luker 在 `data/<user>/extensions/**` 平铺），跨宿主可用。
 * 实测 `GET https://127.0.0.1:8003/scripts/storage-inspector.js` → **HTTP 200 / 16.4KB**。
 */
const STORAGE_INSPECTOR_MODULE_URL = '/scripts/storage-inspector.js';

/** 模块加载的单次尝试缓存（成功或失败都只试一次；浏览器 module map 本身也会缓存失败） */
let storageInspectorModulePromise = null;

/**
 * 加载宿主 Storage Inspector 模块。任何失败都返回 `null`，**绝不抛出**。
 * @returns {Promise<object|null>} 模块命名空间，或 null
 */
function loadStorageInspectorModule() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null); // 独立态 / Node：无宿主模块可加载
  }
  if (!storageInspectorModulePromise) {
    // @vite-ignore：该路径由宿主在运行期提供，不得被 Vite 打包期解析
    storageInspectorModulePromise = import(/* @vite-ignore */ STORAGE_INSPECTOR_MODULE_URL)
      .catch((err) => {
        console.warn('[ST-pack-transfer] 宿主存储面板模块不可用，降级隐藏入口：', err);
        return null;
      });
  }
  return storageInspectorModulePromise;
}

/**
 * 判定宿主 Storage Inspector 模块命名空间是否可用（纯函数，便于单测）。
 *
 * 判据是「导出确实是函数」而非「模块能加载」——宿主版本升级后导出名可能变化，
 * 只判断加载成功会让 `btn.hidden = false` 暴露一个点了没反应的死按钮。
 *
 * @param {object|null|undefined} mod 动态 import 得到的模块命名空间
 * @returns {boolean}
 */
export function hasStorageInspector(mod) {
  return typeof mod?.openStorageInspector === 'function';
}

/**
 * 探测宿主原生存储面板是否可用（决定 `#btn-storage-inspector` 是否解除 hidden）。
 * @returns {Promise<boolean>}
 */
export async function isStorageInspectorAvailable() {
  return hasStorageInspector(await loadStorageInspectorModule());
}

/**
 * 唤起宿主原生存储面板（Luker Storage Inspector）。
 *
 * `dataSource` 形状取自宿主源码契约（`storage-inspector.js`）：
 *   `@param {{kind:'self'} | {kind:'any', target:string}} dataSource`
 * 官方调用点即 `openStorageInspector({ kind: 'self' })`（`user.js:2361`）——
 * **不需要**构造 `RestProvider` 实例，函数内部自行 `new RestProvider(dataSource)`。
 * 该面板的 mutator 是 `ThrowingMutator`，即**只读**，不会写宿主数据。
 *
 * @returns {Promise<boolean>} 是否成功唤起（false 时调用方保持静默——按钮本就不该可见）
 */
export async function openStorageInspector() {
  const mod = await loadStorageInspectorModule();
  if (!hasStorageInspector(mod)) return false;
  try {
    await mod.openStorageInspector({ kind: 'self' });
    return true;
  } catch (err) {
    console.warn('[ST-pack-transfer] 唤起宿主存储面板失败：', err);
    return false;
  }
}

/**
 * 通过服务端 /version 端点二次校验宿主类型（第 2 级复核，R-A4）
 *
 * 实测响应形状（research/host-probe-results.md + 2026-10-14 四宿主取证）：
 * - Luker: { agent: "Luker:2.7.0:...", stCompatVersion, pkgVersion, ... }
 * - TT/PT: { agent: "…:TauriTavern" / "…:PureTavern", ... }
 * - ST:    { version: "1.18.0" }（老形状，无 agent 字段）
 *
 * @param {'st'|'luker'|'tt'|'pt'|'unknown'|'standalone'} frontendPlatform detectHost() 的前端判定结果
 * @returns {Promise<{ platform: 'st'|'luker'|'tt'|'pt'|'standalone', verified: boolean, version?: string }>}
 */
export async function verifyHostPlatform(frontendPlatform) {
  let data = null;
  try {
    const response = await fetch('/version', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    logger.info(`服务端 /version 校验不可达 (${err.message})，保留前端判定: ${frontendPlatform}`);
    return { platform: frontendPlatform, verified: false };
  }

  let endpointPlatform = 'standalone';
  if (data && typeof data === 'object') {
    const agent = typeof data.agent === 'string' ? data.agent : '';
    // TT/PT 先判：两者的 agent 串可能同时含 ST 兼容字样，特征子串更具辨别力
    const ttHit = HOST_REGISTRY.find((e) => e.code === 'tt' && e.agentIncl && agent.includes(e.agentIncl));
    const ptHit = HOST_REGISTRY.find((e) => e.code === 'pt' && e.agentIncl && agent.includes(e.agentIncl));
    if (ttHit) {
      endpointPlatform = 'tt';
    } else if (ptHit) {
      endpointPlatform = 'pt';
    } else if (agent.startsWith('Luker') || 'stCompatVersion' in data) {
      endpointPlatform = 'luker';
    } else if (agent.startsWith('SillyTavern') || ('version' in data && !('stCompatVersion' in data))) {
      endpointPlatform = 'st';
    } else if (typeof data.pkgVersion === 'string') {
      // 有 pkgVersion 但 agent 不可识别：按版本主号兜底
      endpointPlatform = data.pkgVersion.startsWith('1.') ? 'st' : 'luker';
    } else {
      // 响应形如宿主（/version OK 且为对象）但映射不上任何注册项 → 未登记宿主兜底 unknown
      // （能力表按 unknown 处理：known=false 保守路径，置灰而非隐藏）
      endpointPlatform = 'unknown';
    }
  }

  // 徽标展示用短版本号：Luker agent 形如 "Luker:2.7.0:Cohee#1207" → 取 "2.7.0"
  let version = data?.agent ?? data?.version ?? data?.pkgVersion ?? null;
  if (typeof version === 'string' && version.includes(':')) {
    const seg = version.split(':')[1];
    if (seg) version = seg;
  }
  if (endpointPlatform !== frontendPlatform) {
    logger.warn(`宿主类型前端判定 (${frontendPlatform}) 与服务端校验 (${endpointPlatform}) 不一致，以服务端为准。版本: ${version ?? '未知'}`);
  } else {
    logger.info(`宿主类型服务端校验一致: ${endpointPlatform} (版本: ${version ?? '未知'})`);
  }
  return { platform: endpointPlatform, verified: true, version: version || undefined };
}

/**
 * 导出后软校验：按宿主类型检查数据包形状是否与预期一致
 * - Luker 导出包含 manifest.json (schemaVersion+selection)
 * - ST 导出为全量摊平包，不含 manifest.json
 * 校验失败仅告警，不阻断流程。
 * @param {Blob} blob 宿主导出的 Zip 数据包
 * @param {'st'|'luker'} platform 宿主类型
 */
export async function validateBackupShape(blob, platform) {
  try {
    const reader = await zipIo.openReader(blob);
    let hasManifest = false;
    for await (const entry of reader.entries()) {
      if (entry.fileName === 'manifest.json') {
        hasManifest = true;
        break;
      }
      // 只扫前几十个条目名即可判定，避免大包全量遍历
      if (entry.fileName.startsWith('characters/') || entry.fileName.startsWith('settings')) break;
    }
    await reader.close();

    if (platform === 'luker' && !hasManifest) {
      logger.warn('宿主类型为 Luker，但导出数据包缺少 manifest.json —— 宿主识别可能有误，请检查宿主徽标');
    } else if (platform === 'st' && hasManifest) {
      logger.warn('宿主类型为 ST，但导出数据包含 manifest.json —— 宿主识别可能有误，请检查宿主徽标');
    }
  } catch (err) {
    logger.info(`导出包形状软校验跳过: ${err.message}`);
  }
}

/**
 * 从宿主官方前端 API 读 CSRF Token（**纯增强**，读不到返回 `null` 即回退 `/csrf-token`）。
 *
 * `getContext().getRequestHeaders()` 是宿主官方公开路径（本仓 `host-capabilities.md`
 * 已确立「取能力的唯一合法路径是 getContext()」）；2026-09-25 实测两宿主均存在且含该头。
 * 防御式访问：宿主脚本未就绪 / 非浏览器环境（Node/Vitest）一律 `null`，绝不抛出。
 * @returns {string|null}
 */
function readContextCsrfToken() {
  try {
    const ctx = globalThis.SillyTavern?.getContext?.();
    const token = ctx?.getRequestHeaders?.()?.['X-CSRF-Token'];
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

/**
 * 获取宿主 CSRF Token（短超时兜底，避免宿主挂起时永久 pending）
 */
export async function getCsrfToken({ signal } = {}) {
  const fromContext = readContextCsrfToken();
  if (fromContext) return fromContext;
  const response = await fetchWithTimeout('/csrf-token', { credentials: 'same-origin' }, {
    timeoutMs: SHORT_FETCH_TIMEOUT_MS,
    signal,
    label: '获取 CSRF token',
  });
  if (!response.ok) throw new Error(`获取 CSRF token 失败: ${response.status}`);
  const data = await response.json();
  return data.token;
}

/**
 * 获取当前登录用户句柄（短超时兜底）
 *
 * ⚠ **该端点是句柄的唯一权威来源**（2026-09-25 认证态实测：Luker 与 ST 均 200，
 * 返回 `{handle:'default-user',…}`）。**不要**改用 `getContext().name1`——那是
 * **用户人设名**（本机实测为中文名），当成句柄会把数据包写进错误目录。
 * 取证见任务 `09-25-batch-restore-luker-endpoint/research/host-endpoint-facts.md`。
 */
export async function getHandle({ signal } = {}) {
  const response = await fetchWithTimeout('/api/users/me', { credentials: 'same-origin' }, {
    timeoutMs: SHORT_FETCH_TIMEOUT_MS,
    signal,
    label: '获取当前用户',
  });
  if (!response.ok) throw new Error(`获取当前用户失败: ${response.status}`);
  const data = await response.json();
  return data.handle;
}

/**
 * OPFS 可用性特性检测（仅浏览器；Node/Vitest 环境直接 false）
 * @returns {boolean}
 */
export function supportsOpfs() {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.storage?.getDirectory === 'function';
  } catch {
    return false;
  }
}

/**
 * 打开 OPFS 临时目录（fetch-tmp）中的文件句柄
 * @param {string} name
 * @param {boolean} [create=true]
 * @returns {Promise<FileSystemFileHandle|null>} OPFS 不可用时返回 null
 */
export async function opfsTmpHandle(name, create = true) {
  if (!supportsOpfs()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('fetch-tmp', { create: true });
    return await dir.getFileHandle(name, { create });
  } catch (err) {
    logger.warn(`OPFS 临时文件句柄获取失败 (${err.message})，回退内存模式`);
    return null;
  }
}

/**
 * 清理 OPFS fetch-tmp 目录下的临时文件（不存在时静默）
 * @param {string} name
 */
export async function opfsTmpCleanup(name) {
  if (!supportsOpfs()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('fetch-tmp', { create: false });
    await dir.removeEntry(name);
    logger.info(`OPFS 临时包已清理: ${name}`);
  } catch {
    // 文件不存在或目录不可达：无需清理
  }
}

/**
 * OPFS 句柄 → File（供 convert/zip.js 直接消费）
 * @param {FileSystemFileHandle} handle
 * @returns {Promise<File>}
 */
export async function opfsHandleToFile(handle) {
  return handle.getFile();
}

/**
 * 从当前酒馆端点拉取细粒度或全量备份 Zip（三段式进度版）
 *
 * 阶段1 宿主生成：TTFB 前等待（宿主打包数据）
 * 阶段2 传输：response.body 流式读取，按 Content-Length 估算百分比
 * 阶段3 插件处理：由调用方 transform 阶段接管（onProgress 回调透传）
 *
 * 浏览器且有 OPFS 时直写临时文件（GB 级包零内存缓冲），返回句柄描述
 * { kind:'opfs', name, size, handle }；否则维持内存 Blob 路径。
 *
 * 暂停/中止：signal.aborted 时 — OPFS 路径先 close 保住半成品（暂停语义：
 * 半成品保留给续传），随后抛 AbortError；调用方 pause 前用 onCheckpoint 落清单。
 * 续传：resumeCheckpoint.receivedBytes > 0 时先尝试 Range 请求从断点接（追加写
 * OPFS）；响应非 206 或端点不支持 → 整包重拉（半成品作废，logger.warn 提示）。
 *
 * @param {'st'|'luker'} platform
 * @param {Record<string, boolean>} [selection] 细粒度类目选择
 * @param {object} [options]
 * @param {function(string, number, number, string=, number=): void} [options.onPhase] 阶段回调 (phase, received, total, opfsName?, currentBps?)
 * @param {string} [options.taskId] 任务标识（OPFS 临时文件名，默认按时间戳）
 * @param {AbortSignal} [options.signal] 中止信号（透传 fetch 与 reader 循环）
 * @param {{receivedBytes?: number, totalBytes?: number, opfsName?: string|null}} [options.resumeCheckpoint] 断点清单
 * @param {{begin: Function, end: Function}} [options.timings] 分段计时记录器（`createStageRecorder()`）；
 *   不传即零行为变化。标记 `credentials` / `host-generate` / `transfer` 三段。
 * @param {number} [options.stallTimeoutMs] 传输**停滞**上限（两次字节之间的最大间隔）；
 *   默认 `DOWNLOAD_STALL_TIMEOUT_MS`，传 `0` 关闭守卫。
 * @returns {Promise<Blob|{kind:'opfs', name:string, size:number, handle:FileSystemFileHandle}>}
 */
/**
 * Authority ST 选择性备份增强——特性检测（L0-11 唯一探测点）。
 *
 * ST 原生 `/api/users/backup` 忽略 selection（必全量）；Authority 装了
 * `st-backup` 端点时（probe 响应带 `stBackup: true` 标记）提供类目级选择。
 * **未装（404）/ 无标记 / 探测失败 ⇒ 一律 `{supported:false}`**，调用方回退
 * 原生路径，纯前端主路径零依赖后端（探测有短超时兜底，不阻塞）。
 */
export async function probeAuthorityStBackup({ signal } = {}) {
  try {
    const response = await fetchWithTimeout('/api/plugins/authority/probe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }, {
      timeoutMs: SHORT_FETCH_TIMEOUT_MS,
      signal,
      label: '探测 Authority 增强通道',
    });
    if (!response.ok) return { supported: false, reason: `probe ${response.status}` };
    const data = await response.json();
    const supported = data?.stBackup === true;
    return { supported, reason: supported ? 'Authority 选择性备份' : '无 stBackup 标记' };
  } catch {
    return { supported: false, reason: 'Authority 不可达' };
  }
}

export async function fetchHostBackup(platform, selection = null, {
  onPhase, taskId, signal, resumeCheckpoint,
  timings = null, stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
} = {}) {
  logger.info(`正在连接宿主 [${platform.toUpperCase()}] 获取授权凭证...`);
  timings?.begin(STAGE_LABELS.CREDENTIALS);
  const [token, handle] = await Promise.all([getCsrfToken(), getHandle()]);
  timings?.end(STAGE_LABELS.CREDENTIALS);

  const sel = selection ? { ...selection } : { ...FULL_SELECTION };
  const body = platform === 'luker'
    ? { handle, selection: sel }
    : { handle, selection: sel };

  logger.info(`向宿主发起数据包导出请求 (用户: ${handle})...`);
  onPhase?.('host-generating', 0, 0);

  // 宿主打包阶段（TTFB 之前）**刻意不设停滞上限**：GB 级备份的生成耗时本就可能很长，
  // 对它设固定阈值只会误杀正常导出。这一段只受用户取消影响（见 async-bounds.md）。
  timings?.begin(STAGE_LABELS.HOST_GENERATE);

  // 续传：优先 Range 从断点接（追加写 OPFS 半成品）
  const resumeBytes = Math.max(0, resumeCheckpoint?.receivedBytes || 0);
  const resumeOpfsName = resumeCheckpoint?.opfsName || null;
  const useRangeResume = resumeBytes > 0 && supportsOpfs() && Boolean(resumeOpfsName);

  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
  };
  if (useRangeResume) headers.Range = `bytes=${resumeBytes}-`;

  // Authority ST 增强通道（L0-11 适配器：装了增强、未装/失败回退原生全量）。
  // 增强端点给类目级选择（ST 原生端点忽略 selection 必全量）；会话用户由
  // Authority 侧 session 提供，body 只需 selection。
  let requestUrl = '/api/users/backup';
  let requestBody = JSON.stringify(body);
  let viaAuthority = false;
  if (platform === 'st') {
    const enhanced = await probeAuthorityStBackup({ signal });
    if (enhanced.supported) {
      requestUrl = '/api/plugins/authority/host/st-backup';
      requestBody = JSON.stringify({ selection: sel });
      viaAuthority = true;
    }
  }

  let response = await fetch(requestUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: requestBody,
    signal,
  });

  // 增强通道任何失败（探测过但请求失败/中途撤载）⇒ 静默回退原生全量路径再试一次
  // （L0-11：增强不可用绝不让纯前端主路径失败；原生是 ST 的既定语义——全量+插件内过滤）。
  if (!response.ok && viaAuthority) {
    logger.warn(`Authority 增强通道不可用 (${response.status})，回退宿主原生全量拉取`);
    viaAuthority = false;
    response = await fetch('/api/users/backup', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errJson = await response.json();
      detail = errJson.error ?? '';
    } catch {
      // 忽略非 JSON 响应
    }
    const err = new Error(`备份请求失败 (${response.status})${detail ? `: ${detail}` : ''}`);
    logger.error('宿主数据包导出失败', err);
    throw err;
  }

  let appendFromByte = 0;
  let opfsName = '';
  if (useRangeResume) {
    if (response.status === 206) {
      // Range 续传成立：追加到既有半成品
      opfsName = resumeOpfsName;
      appendFromByte = resumeBytes;
      logger.info(`宿主支持 Range 续传，从断点 ${formatBytes(resumeBytes)} 处继续接收`);
    } else {
      // 非 206：端点不支持（Luker archiver 动态流大概率不支持）→ 整包重拉
      logger.warn('宿主端点不支持 Range 续传（响应非 206），半成品作废，整包重拉');
      await opfsTmpCleanup(resumeOpfsName);
    }
  }

  // 流式读取：宿主生成耗时体现在 TTFB，传输耗时体现为 body 逐块到达
  const contentLength = Number(response.headers.get('Content-Length')) || 0;
  // 206 响应的 Content-Length 是剩余长度
  const transferTotal = response.status === 206 && contentLength > 0
    ? contentLength + appendFromByte
    : contentLength;

  // OPFS 直写路径：GB 级包零内存缓冲；句柄描述返回给下游按需 getFile()
  let opfsHandle = null;
  if (supportsOpfs()) {
    opfsName = opfsName || `${taskId || `backup_${Date.now()}`}.zip`;
    opfsHandle = await opfsTmpHandle(opfsName, true);
    if (opfsHandle) {
      logger.info(`OPFS 可用，数据包流式直写临时文件: fetch-tmp/${opfsName}`);
    }
  }

  let blob = null;
  const writable = opfsHandle ? await opfsHandle.createWritable() : null;
  if (writable && appendFromByte === 0) {
    // 全新拉取：清空既有同名半成品（Range 追加路径保留内容）
    await writable.truncate(0);
  }

  try {
    if (response.body && typeof response.body.getReader === 'function') {
      onPhase?.('transferring', appendFromByte, transferTotal, opfsHandle ? opfsName : undefined);
      timings?.end(STAGE_LABELS.HOST_GENERATE); // 首字节已到 ⇒ 打包阶段结束
      timings?.begin(STAGE_LABELS.TRANSFER);
      const reader = response.body.getReader();
      const chunks = writable ? null : [];
      let received = appendFromByte;
      let lastLoggedPct = -1;
      // 实测速度采样（滑动窗口 2s）：onPhase 直传，非估算
      let speedWindowBytes = 0;
      let speedWindowStart = performance.now();
      for (;;) {
        // 停滞守卫：只守「两次字节之间的间隔」，不守总时长（见 async-bounds.md）
        const { done, value } = await readStreamChunkBounded(reader, {
          timeoutMs: stallTimeoutMs,
          label: '接收宿主数据包',
        });
        if (done) break;
        if (writable) {
          await writable.write(value);
        } else {
          chunks.push(value);
        }
        received += value.length;
        speedWindowBytes += value.length;
        const now = performance.now();
        const windowMs = now - speedWindowStart;
        let currentBps = null;
        if (windowMs >= 500) {
          currentBps = (speedWindowBytes * 1000) / windowMs; // bytes per second
          speedWindowBytes = 0;
          speedWindowStart = now;
        }
        if (transferTotal > 0) {
          const pct = Math.round((received / transferTotal) * 100);
          if (pct >= lastLoggedPct + 10) {
            lastLoggedPct = pct;
            logger.info(`数据包传输中: ${pct}% (${(received / 1048576).toFixed(1)} / ${(transferTotal / 1048576).toFixed(1)} MB)`);
          }
        } else if (received >= lastLoggedPct + 4194304) {
          // chunked 响应无 Content-Length：按 4MB 步进汇报
          lastLoggedPct = received - (received % 4194304);
          logger.info(`数据包传输中: 已接收 ${(received / 1048576).toFixed(1)} MB`);
        }
        onPhase?.('transferring', received, transferTotal, opfsHandle ? opfsName : undefined, currentBps);
      }
      timings?.end(STAGE_LABELS.TRANSFER); // 读完即闭合（两个 return 分支之前）
      if (writable) {
        await writable.close();
        const file = await opfsHandle.getFile();
        logger.success(`成功从宿主拉取数据包 (OPFS 直写)，大小: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        await validateBackupShape(file, platform);
        return { kind: 'opfs', name: opfsName, size: file.size, handle: opfsHandle };
      }
      blob = new Blob(chunks, { type: 'application/zip' });
    } else {
      // 响应体不可流式：整体读取（无法逐块检测停滞，故只记一段「传输」）
      timings?.end(STAGE_LABELS.HOST_GENERATE);
      timings?.begin(STAGE_LABELS.TRANSFER);
      blob = await response.blob();
      timings?.end(STAGE_LABELS.TRANSFER);
      if (writable) {
        // 罕见：response.body 不可流式但 OPFS 可用——落盘后统一走句柄路径
        await writable.write(blob);
        await writable.close();
        const file = await opfsHandle.getFile();
        await validateBackupShape(file, platform);
        return { kind: 'opfs', name: opfsName, size: file.size, handle: opfsHandle };
      }
    }
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      // 暂停/中止语义：OPFS 半成品 close 保留（续传判断由调用方决定），不删清单
      if (writable) {
        try { await writable.close(); } catch { /* 已关闭 */ }
      }
      logger.info(`传输被暂停/中止，OPFS 半成品已保留: fetch-tmp/${opfsName}`);
      throw err;
    }
    // 真实错误：半成品清理（内存路径无状态；OPFS 路径删临时文件）
    if (writable) {
      try { await writable.abort(err); } catch { /* 已关闭/中止 */ }
    }
    if (opfsHandle) await opfsTmpCleanup(opfsName);
    throw err;
  }

  logger.success(`成功从宿主拉取数据包，大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  await validateBackupShape(blob, platform);
  return blob;
}

/**
 * 读取**当前宿主**的用户清单（目标预检用），并把该次导出作为**保底备份**交回调用方。
 *
 * 这是 `src/core/target-inventory.js` 的宿主执行层：判定与呈现全在纯模块里，本函数只负责
 * 「取一份真清单」这一件事。做法是复用**既有**的全量导出通道：
 *
 *   `fetchHostBackup(platform, null, …)`（`selection=null` ⇒ `FULL_SELECTION`）
 *     → 归一为 `File`（OPFS 路径经 `opfsHandleToFile`）
 *     → `readZipEntryManifest`（**只读中央目录**，不解压、不读数据流）
 *     → `buildTargetManifest`
 *
 * `selection` 必须走全量：`alignInventories` 的判据要求清单里至少有标准根标记（`characters` /
 * `chats` / `settings.json` / `secrets.json`），带过滤的导出会让清单**看似完整实则缺项**
 * （判为 `PARTIAL` ⇒ 降级 `unknown`，`target-inventory.js`）。
 *
 * **静默降级（`L0-11`）**：宿主不支持、请求失败、用户取消、包不可读 —— 一律返回
 * `{ manifest: null, file: null, reason }`，**不抛**，调用方无需分支即可退回既有 `unknown` 行为。
 *
 * @param {object} [options]
 * @param {'st'|'luker'} options.platform 宿主平台码（非插件态传空串亦可，将直接降级）
 * @param {AbortSignal} [options.signal] 取消信号（归一为 `reason:'cancelled'`，同样不抛）
 * @param {function(string, number, number, string=, number=): void} [options.onPhase] 导出阶段回调
 * @param {string} [options.taskId] OPFS 临时文件标识
 * @returns {Promise<{manifest: {paths: string[], count: number, truncated: boolean}|null,
 *                    file: File|Blob|null, reason: string}>}
 */
export async function fetchHostInventory({ platform, signal = null, onPhase = null, taskId = null } = {}) {
  if (!platform) {
    return { manifest: null, file: null, reason: '当前宿主不支持读取用户清单' };
  }
  try {
    const raw = await fetchHostBackup(platform, null, { onPhase, taskId, signal });
    const file = raw && raw.kind === 'opfs' ? await opfsHandleToFile(raw.handle) : raw;
    if (!file) {
      return { manifest: null, file: null, reason: '宿主未返回可读数据包' };
    }
    const entries = await readZipEntryManifest(file);
    const manifest = buildTargetManifest(entries);
    logger.info(`目标预检：读取到宿主清单 ${manifest.count} 条`);
    return { manifest, file, reason: '' };
  } catch (err) {
    const cancelled = err?.name === 'AbortError';
    const reason = cancelled ? 'cancelled' : (err?.message || String(err));
    logger.warn(`目标预检未能读取宿主清单（${reason}），本次按「冲突状态未知」处理`);
    return { manifest: null, file: null, reason };
  }
}

/**
 * 直接调用恢复 API 将目标包恢复/写入到当前酒馆宿主
 * 支持合并写入 (mode: 'merge') 与覆盖写入 (mode: 'overwrite')
 *
 * 有界等待（L1-MR-7）：凭证请求走短超时；响应体读取走 `readJsonBounded`；
 * 上传超时由 `UPLOAD_TIMEOUT_MS` 配置（默认 `0` = 不设硬超时，见 design.md §2.2）。
 * 并发互斥：在途时拒绝第二次调用，避免两个 restore 事务并发写同一用户目录。
 * 取消：内部控制器 + `cancelRestoreInFlight()`；外部 `signal` 亦被合流转发。
 *
 * @param {Blob} zipBlob
 * @param {object} [options]
 * @param {'merge'|'overwrite'} [options.mode='merge'] 恢复模式
 * @param {string} [options.platform='st'] 宿主类型
 * @param {AbortSignal} [options.signal] 外部取消信号（与 `cancelRestoreInFlight()` 等效合流）
 * @param {number} [options.timeoutMs=UPLOAD_TIMEOUT_MS] 上传超时毫秒；`0` 表示不设硬超时
 * @returns {Promise<object>} 宿主持久化的响应体；响应体不可解析时为
 *   `{ success: false, unconfirmed: true, reason }`
 */
export async function restoreToHost(zipBlob, { mode = 'merge', platform = 'st', signal, timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  if (restoreInFlight) {
    throw new Error('已有恢复任务正在进行，请等待其完成后再试');
  }
  restoreInFlight = true;
  const controller = new AbortController();
  restoreAbort = controller;
  // 外部 signal 与内部取消控制器合流（手动转发，与 fetch-bounds 同一取舍：环境行为一致优先）
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    return await restoreToHostInner(zipBlob, {
      mode, platform, signal: controller.signal, timeoutMs,
    });
  } finally {
    if (signal) signal.removeEventListener('abort', onExternalAbort);
    restoreAbort = null;
    restoreInFlight = false;
  }
}

/** `restoreToHost` 的实现体（互斥标志由外层 `try/finally` 保证复位）。 */
async function restoreToHostInner(zipBlob, { mode, platform, signal, timeoutMs }) {
  // 已判定本宿主无整包恢复能力（全部候选 404/405）：直接拒绝，不再重复探测，
  // 也不让调用方把「宿主没这个能力」误读成「恢复失败」（R1.6 死按钮规则）。
  if (restoreCapability === 'unsupported') {
    throw restoreUnsupportedError();
  }
  // 中文名刻意避开「增量合并」——该词曾是 J 区一个从不生效的开关名，
  // 与这里的宿主端 merge 语义完全无关。此处语义是「把包并入现有数据」vs「整体覆盖」。
  logger.info(`准备向宿主 [${platform.toUpperCase()}] 恢复写入数据包 (模式: ${mode === 'merge' ? '合并写入' : '覆盖写入'})...`);
  const [token, handle] = await Promise.all([getCsrfToken({ signal }), getHandle({ signal })]);

  const formData = new FormData();
  formData.append('avatar', zipBlob, 'backup.zip');
  formData.append('handle', handle);
  formData.append('mode', mode);
  formData.append('incremental', mode === 'merge' ? 'true' : 'false');
  // **显式传类目选择**：2026-09-25 Dev Luker 对照实验（`research/pw-restore-variants.cjs`）表明
  // 宿主对**缺省** `selection` 也按全量处理（带/不带 selection 均 `restoredCount: 1`），
  // 故这不是「修 bug」而是**把语义显式化**：与宿主自身 UI（Luker `public/scripts/user.js`）
  // 及同类扩展 Atria 的 payload 一致，避免依赖未文档化的缺省行为。
  // 注：包内 `manifest.json` 的 selection **不被宿主解析**（09-01 取证），类目选择只能来自请求。
  formData.append('selection', JSON.stringify(FULL_SELECTION));

  // 端点按平台候选序解析，仅 404/405 回退（见 postRestoreWithFallback 的硬约束）
  const response = await postRestoreWithFallback(formData, {
    platform, token, signal, timeoutMs,
  });

  if (!response.ok) {
    let detail = '';
    try {
      // 体读取同样要兜底：错误响应体也可能挂起（L1-MR-7）
      const errJson = await readJsonBounded(response, {
        timeoutMs: SHORT_FETCH_TIMEOUT_MS, signal, label: '读取恢复错误响应',
      });
      detail = errJson.error ?? '';
    } catch {
      // 忽略非 JSON / 体读取超时
    }
    const err = new Error(`恢复失败 (${response.status})${detail ? `: ${detail}` : ''}`);
    logger.error('恢复数据包至宿主酒馆失败', err);
    throw err;
  }

  // 响应体解析失败**不得**当作成功（审计 R-15：伪成功会让用户误以为数据已恢复）
  let result;
  try {
    result = await readJsonBounded(response, {
      timeoutMs: SHORT_FETCH_TIMEOUT_MS, signal, label: '读取恢复结果',
    });
  } catch (err) {
    // 解析失败与体读取超时/取消都归「未确认」：请求已发出，但结果无从得知
    logger.warn('宿主恢复响应体读取失败，无法确认结果（请求已发出）:', err);
    return { success: false, unconfirmed: true, reason: '响应体不可解析' };
  }
  // 200 不等于「有写入」：宿主可能把全部条目跳过。如实上报条目计数，
  // 避免「点了恢复 → 显示成功 → 其实一个条目都没写」的假成功（与审计 R-15 同源）。
  if (typeof result.restoredCount === 'number') {
    if (result.restoredCount === 0 && (result.skippedCount || 0) > 0) {
      result.nothingRestored = true;
      logger.warn(`宿主未写入任何条目：restored ${result.restoredCount} / skipped ${result.skippedCount}`
        + '（请核对包的类目是否被宿主接受）');
    } else {
      logger.info(`宿主恢复条目计数：restored ${result.restoredCount}`
        + `${typeof result.skippedCount === 'number' ? ` / skipped ${result.skippedCount}` : ''}`);
    }
  }
  logger.success(`数据包恢复至当前用户 (${handle}) 成功！模式: ${mode === 'merge' ? '合并写入' : '覆盖写入'}`);

  // 检查包内扩展清单 _convert/extensions-manifest.json，据归一后的状态决定是否自动呼出安装器
  try {
    const reader = await zipIo.openReader(zipBlob);
    try {
      for await (const entry of reader.entries()) {
        if (entry.fileName === '_convert/extensions-manifest.json') {
          const text = new TextDecoder().decode(await entry.read());
          const manifest = JSON.parse(text);
          const entries = normalizeManifestEntries(manifest);
          if (entries.length > 0) {
            const embeddedCount = entries.filter((e) => e.availability === AVAILABILITY.EMBEDDED).length;
            const installableCount = entries.filter((e) => e.availability === AVAILABILITY.INSTALLABLE).length;
            const unavailableCount = entries.filter((e) => e.availability === AVAILABILITY.UNAVAILABLE).length;
            if (shouldAutoOpenInstaller(entries)) {
              logger.info(
                `检测到包内 ${entries.length} 个扩展清单（可在线安装 ${installableCount} 个），正在呼出扩展安装面板...`,
              );
              renderExtensionInstallerModal(entries, undefined, { embeddedCount, unavailableCount });
            } else {
              // 无可在线安装项：不打扰用户，仅提示并提供手动入口（决策 D-4）
              logger.info(
                `本包含 ${entries.length} 个扩展，其中 0 个可在线安装`
                + `${embeddedCount > 0 ? `（${embeddedCount} 个实体已随恢复写入）` : ''}`
                + `${unavailableCount > 0 ? `，${unavailableCount} 个缺少可用 Git URL` : ''}。`
                + '如需重装，请从扩展设置抽屉手动开始。',
              );
            }
          }
          break;
        }
      }
    } finally {
      await reader.close();
    }
  } catch (err) {
    logger.warn('检查扩展清单失败 (非阻塞):', err);
  }

  return result;
}

/**
 * 获取目标酒馆宿主当前已安装的扩展列表
 * @returns {Promise<string[]>} 已安装扩展的文件夹名列表
 */
export async function discoverHostExtensions() {
  try {
    const response = await fetch('/api/extensions/discover', { credentials: 'same-origin' });
    if (!response.ok) return [];
    const list = await response.json();
    if (!Array.isArray(list)) return [];
    return list.map((item) => {
      const raw = item?.name || '';
      return raw.startsWith('third-party/') ? raw.slice('third-party/'.length) : raw;
    }).filter(Boolean);
  } catch (err) {
    logger.warn('获取宿主扩展列表失败 (可能在独立环境运行):', err);
    return [];
  }
}

/**
 * 调用宿主 /api/extensions/install 安装单个扩展 (原生自带 depth: 1 浅克隆)
 * @param {object} params
 * @param {string} params.url 扩展 Git 仓库 URL
 * @param {string} [params.branch] 对应分支
 * @param {boolean} [params.replace=false] 是否强制覆盖已有目录
 * @returns {Promise<any>}
 */
export async function installExtensionViaHost({ url, branch, replace = false }) {
  const token = await getCsrfToken();
  const body = { url, branch, replace };
  const response = await fetch('/api/extensions/install', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch { /* 忽略 */ }
    throw new Error(`安装失败 (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  return await response.json().catch(() => ({ success: true }));
}

/**
 * 针对目标平台自适应检查宿主是否存在错误的 third-party 嵌套目录
 * 规则：
 * - 若目标/宿主为 PT 或 TT：原生支持 third-party，绝不报错或提示异常
 * - 若目标/宿主为 ST 或 Luker：检查是否存在 local 级 'third-party/third-party' 文件夹
 * @param {string} [targetPlatform='l'] 目标平台类型 ('st' | 'l' | 'tt' | 'pt')
 * @returns {Promise<{ hasAnomaly: boolean, message?: string }>}
 */
export async function checkHostThirdPartyAnomaly(targetPlatform = 'l') {
  if (targetPlatform === 'tt' || targetPlatform === 'pt') {
    return { hasAnomaly: false };
  }
  try {
    const response = await fetch('/api/extensions/discover', { credentials: 'same-origin' });
    if (!response.ok) return { hasAnomaly: false };
    const list = await response.json();
    if (!Array.isArray(list)) return { hasAnomaly: false };
    const foundRogue = list.some(
      (item) => item?.type === 'local' && (item?.name === 'third-party/third-party' || item?.name === 'third-party/'),
    );
    if (foundRogue) {
      return {
        hasAnomaly: true,
        extensionName: 'third-party',
        message: '检测到宿主本地用户目录下存在错误的 third-party 嵌套文件夹 (data/<user>/extensions/third-party/)，会导致其下插件无法被酒馆正常识别。',
      };
    }
  } catch {
    // 独立环境忽略
  }
  return { hasAnomaly: false };
}

/**
 * 调用宿主接口删除指定扩展 (可用于清理错误残留的 third-party 目录)
 * @param {string} extensionName 扩展或目录名
 * @param {boolean} [isGlobal=false] 是否为全局扩展
 * @returns {Promise<boolean>}
 */
export async function deleteExtensionViaHost(extensionName, isGlobal = false) {
  const token = await getCsrfToken();
  const response = await fetch('/api/extensions/delete', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify({ extensionName, global: isGlobal }),
  });
  return response.ok;
}

/**
 * 宿主主题色读取（JS 侧 `style.color = '…'` **不接受 `var()`**，必须取真实值）。
 * 读不到（独立态 / Node / 宿主脚本未就绪）时返回回退值。
 *
 * 说明（2026-09-25 用户要求「插件必须按酒馆颜色」）：安装器模态的**表面/文字/强调色**
 * 一律改为 `var(--SmartTheme*, 回退)`（HTML 内联样式与 cssText 均可）；
 * 成功/告警/危险三个**语义色**在宿主未见官方变量记载（L1-MR-5：不凭源码猜 API），
 * 故仍保留字面量并集中在本文件便于将来一处替换。
 * @param {string} name CSS 变量名（如 `--SmartThemeQuoteColor`）
 * @param {string} fallback 回退颜色
 * @returns {string}
 */
function themeVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/** 宿主强调色（JS 侧赋值用；与 CSS 的 `var(--SmartThemeQuoteColor, …)` 保持一致） */
function themeAccent() {
  return themeVar('--SmartThemeQuoteColor', '#f59e0b');
}

/**
 * 弹出扩展清单安装器现代化面板
 *
 * 只对**可在线安装**条目提供勾选；「包内已含实体」与「无法在线安装」两类仅作只读展示
 * （决策 D-4/D-6，见 `.trellis/tasks/09-23-extension-manifest-git/design.md` §5.3）。
 * @param {Array<any>} extensions 清单条目数组（建议先经 `normalizeManifestEntries` 归一）
 * @param {() => void} [onFinish] 全部安装完毕或用户关闭后的回调
 * @param {object} [options={}] 扩展选项（`targetPlatform` / `embeddedCount` / `unavailableCount`）
 */
export async function renderExtensionInstallerModal(extensions, onFinish, options = {}) {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('ext-installer-modal');
  if (existing) existing.remove();

  // 1. 获取本地已安装扩展与宿主异常检查
  const targetPlatform = options.targetPlatform || 'l';
  const [installedList, anomaly] = await Promise.all([
    discoverHostExtensions(),
    checkHostThirdPartyAnomaly(targetPlatform),
  ]);
  const installedNames = new Set(installedList);

  // 2. 构造模态弹窗容器
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'ext-installer-modal';
  modalOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
    z-index: 99999; display: flex; align-items: center; justify-content: center;
    padding: 20px; font-family: system-ui, -apple-system, sans-serif;
  `;

  // 底色取宿主的面板底色令牌（BlurTint），文字取宿主的文字令牌（BodyColor）。
  // ⚠ 不要用 `--SmartThemeBodyColorInverted`：ST / Luker 里**没有这个变量**
  // （2026-10-15 在 Dev Luker 8003 与 Dev ST 8001 实测均为空值），
  // 旧写法靠回退值在深色主题下侥幸可用，浅色主题下会变成不可见文字。
  const modalBox = document.createElement('div');
  modalBox.style.cssText = `
    background: var(--SmartThemeBlurTintColor, #1e1e2e); color: var(--SmartThemeBodyColor, #f2f4f8); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px; width: 100%; max-width: 680px; max-height: 85vh;
    display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    overflow: hidden;
  `;

  modalBox.innerHTML = `
    <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h3 style="margin: 0; font-size: 1.15rem; color: var(--SmartThemeQuoteColor, #f59e0b); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-puzzle-piece"></i> 扩展安装器
        </h3>
        <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 78%, transparent);">
          数据包已恢复。以下扩展将由酒馆以 <strong>depth: 1</strong> 浅克隆在线拉取，保留一键更新能力。
        </p>
        <p style="margin: 2px 0 0 0; font-size: 0.78rem; color: #f9e2af;">
          <i class="fa-solid fa-circle-info"></i> 在线安装需要<b>网络连通</b>、宿主<b>扩展安装端点可用</b>（部分部署或权限配置会禁用它），
          且<b>扩展仓库可访问</b>（私有仓需手动处理）。
        </p>
      </div>
      <button id="ext-modal-close" style="background: transparent; border: none; color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 78%, transparent); font-size: 1.5rem; cursor: pointer; padding: 4px 8px;">&times;</button>
    </div>

    <div style="padding: 10px 20px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; gap: 12px; align-items: center; font-size: 0.85rem;">
      <button id="ext-select-missing" class="menu_button" style="padding: 4px 10px; font-size: 0.8rem; cursor: pointer;">仅选未安装</button>
      <button id="ext-select-all" class="menu_button" style="padding: 4px 10px; font-size: 0.8rem; cursor: pointer;">全选</button>
      <button id="ext-deselect-all" class="menu_button" style="padding: 4px 10px; font-size: 0.8rem; cursor: pointer;">全不选</button>
      <div style="flex: 1;"></div>
      <label class="checkbox_label flex-container" style="cursor: pointer; color: #f38ba8;">
        <input type="checkbox" id="ext-force-replace" />
        <span>强制覆盖已有扩展</span>
      </label>
    </div>

    ${trustedStaticMarkup(anomaly.hasAnomaly ? `
    <div id="ext-anomaly-banner" style="margin: 12px 20px 0 20px; padding: 10px 14px; background: rgba(243, 139, 168, 0.15); border: 1px solid #f38ba8; border-radius: 6px; font-size: 0.82rem; color: #f38ba8; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
      <div>
        <strong><i class="fa-solid fa-triangle-exclamation"></i> 检测到错误目录残留：</strong> 本地存在旧版/错误的 <code>data/&lt;user&gt;/extensions/third-party/</code> 文件夹，会导致插件识别失效。
      </div>
      <button id="ext-btn-clean-anomaly" class="menu_button" style="padding: 4px 10px; font-size: 0.78rem; background: #f38ba8; color: var(--SmartThemeBodyColor, #14161c); font-weight: bold; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">一键清理残留 third-party</button>
    </div>` : '')}

    <div id="ext-list-container" style="padding: 12px 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px;">
    </div>

    <div id="ext-progress-bar-container" style="display: none; padding: 12px 20px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05);">
      <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 6px;">
        <span id="ext-progress-status" style="color: var(--SmartThemeQuoteColor, #f59e0b);">准备安装...</span>
        <span id="ext-progress-num" style="color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 78%, transparent);">0 / 0</span>
      </div>
      <div style="width: 100%; height: 8px; background: var(--SmartThemeBorderColor, rgba(255,255,255,0.14)); border-radius: 4px; overflow: hidden;">
        <div id="ext-progress-fill" style="width: 0%; height: 100%; background: #a6e3a1; transition: width 0.3s ease;"></div>
      </div>
    </div>

    <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end; gap: 10px; align-items: center;">
      <button id="ext-btn-cancel" class="menu_button" style="padding: 8px 16px; cursor: pointer;">暂不安装</button>
      <button id="ext-btn-start" class="menu_button menu_button_icon" style="padding: 8px 20px; background: var(--SmartThemeQuoteColor, #f59e0b); border: none; color: var(--SmartThemeBodyColor, #14161c); font-weight: bold; cursor: pointer;">
        <i class="fa-solid fa-play"></i> <span>开始安装勾选项</span>
      </button>
      <button id="ext-btn-reload" class="menu_button menu_button_icon" style="display: none; padding: 8px 20px; background: #a6e3a1; border: none; color: var(--SmartThemeBodyColor, #14161c); font-weight: bold; cursor: pointer;">
        <i class="fa-solid fa-rotate"></i> <span>刷新酒馆生效</span>
      </button>
    </div>
  `;

  modalOverlay.appendChild(modalBox);
  document.body.appendChild(modalOverlay); // dom-scope:allow 自绘模态覆盖层必须挂 body 才能全页覆盖（放进扩展抽屉会被其 overflow/transform 裁剪）

  const listEl = modalBox.querySelector('#ext-list-container');
  const itemsState = [];

  extensions.forEach((ext, idx) => {
    const folder = ext.id || ext.name;
    const isInstalled = installedNames.has(folder);

    // 三类状态（design.md §5.3）：只有 available 的条目可勾选。
    // availability 缺失（旧清单未归一路径）时按「有可用 URL 即可安装」兜底。
    const availability = ext.availability
      || (isInstallableUrl(ext.url) ? AVAILABILITY.INSTALLABLE : AVAILABILITY.UNAVAILABLE);
    const isEmbedded = availability === AVAILABILITY.EMBEDDED;
    const isUnavailable = availability === AVAILABILITY.UNAVAILABLE;
    const selectable = !isEmbedded && !isUnavailable;

    const itemEl = document.createElement('div');
    itemEl.style.cssText = `
      display: flex; align-items: center; gap: 12px; padding: 8px 12px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
      border-radius: 6px; font-size: 0.88rem;
    `;

    // 安全：本面板的 ext.* 全部来自**数据包内的 JSON 清单**（攻击者可分发），
    // 因此一律走 createElement + textContent，禁止任何 innerHTML 插值。
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = `ext-chk-${idx}`;
    chk.checked = selectable && !isInstalled;
    chk.disabled = !selectable;
    chk.style.cursor = selectable ? 'pointer' : 'not-allowed';
    if (!selectable) chk.style.opacity = '0.35';

    const mainCol = document.createElement('div');
    mainCol.style.cssText = 'flex: 1; min-width: 0;';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const nameEl = document.createElement('strong');
    nameEl.style.cssText = 'color: var(--SmartThemeBodyColor, #f2f4f8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    nameEl.textContent = ext.displayName || ext.name || folder || '未命名扩展';
    titleRow.appendChild(nameEl);

    const folderEl = document.createElement('span');
    folderEl.style.cssText = 'font-size: 0.75rem; color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 58%, transparent);';
    folderEl.textContent = `(${folder || '未知目录'})`;
    titleRow.appendChild(folderEl);

    const stateEl = document.createElement('span');
    let stateText;
    let stateStyle;
    if (isEmbedded) {
      stateText = '包内已含';
      stateStyle = 'font-size: 0.72rem; padding: 1px 6px; background: rgba(166,227,161,0.2); color: #a6e3a1; border-radius: 4px;';
    } else if (isUnavailable) {
      stateText = '无法在线安装';
      stateStyle = 'font-size: 0.72rem; padding: 1px 6px; background: rgba(243,139,168,0.2); color: #f38ba8; border-radius: 4px;';
    } else if (isInstalled) {
      stateText = '本地已安装';
      stateStyle = 'font-size: 0.72rem; padding: 1px 6px; background: var(--SmartThemeBorderColor, rgba(255,255,255,0.14)); color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 78%, transparent); border-radius: 4px;';
    } else {
      stateText = '待安装';
      stateStyle = 'font-size: 0.72rem; padding: 1px 6px; background: rgba(137,180,250,0.2); color: var(--SmartThemeQuoteColor, #f59e0b); border-radius: 4px;';
    }
    stateEl.style.cssText = stateStyle;
    stateEl.textContent = stateText;
    titleRow.appendChild(stateEl);

    mainCol.appendChild(titleRow);

    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'font-size: 0.78rem; color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 58%, transparent); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

    // 渲染期校验：非 http(s) 协议（javascript: / data: / vbscript: 等）不输出原值
    const urlEl = document.createElement('span');
    urlEl.textContent = isSafeHttpUrl(ext.url) ? ext.url : '无远程 URL';
    metaRow.appendChild(urlEl);

    if (ext.branch) {
      const branchEl = document.createElement('span');
      branchEl.style.cssText = 'margin-left: 8px; color: #f9e2af;';
      branchEl.textContent = `分支: ${ext.branch}`;
      metaRow.appendChild(branchEl);
    }

    mainCol.appendChild(metaRow);

    // 派生提示（如「清单未记录可用的 Git URL」）：来自包内 JSON，一律 textContent
    if (ext.notes) {
      const noteEl = document.createElement('div');
      noteEl.style.cssText = 'font-size: 0.75rem; color: #f9e2af; margin-top: 2px;';
      noteEl.textContent = ext.notes;
      mainCol.appendChild(noteEl);
    }

    const itemStatusEl = document.createElement('span');
    itemStatusEl.id = `ext-item-status-${idx}`;
    itemStatusEl.style.cssText = 'font-size: 0.8rem; color: color-mix(in srgb, var(--SmartThemeBodyColor, #f2f4f8) 58%, transparent);';

    itemEl.appendChild(chk);
    itemEl.appendChild(mainCol);
    itemEl.appendChild(itemStatusEl);

    listEl.appendChild(itemEl);
    itemsState.push({
      ext,
      checkbox: itemEl.querySelector(`#ext-chk-${idx}`),
      statusEl: itemEl.querySelector(`#ext-item-status-${idx}`),
      isInstalled,
      selectable,
    });
  });

  // 按钮事件绑定
  const closeBtn = modalBox.querySelector('#ext-modal-close');
  const cancelBtn = modalBox.querySelector('#ext-btn-cancel');
  const startBtn = modalBox.querySelector('#ext-btn-start');
  const reloadBtn = modalBox.querySelector('#ext-btn-reload');
  const forceReplaceChk = modalBox.querySelector('#ext-force-replace');

  const closeModal = () => {
    modalOverlay.remove();
    if (onFinish) onFinish();
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  reloadBtn.addEventListener('click', () => window.location.reload());

  const cleanAnomalyBtn = modalBox.querySelector('#ext-btn-clean-anomaly');
  if (cleanAnomalyBtn) {
    cleanAnomalyBtn.addEventListener('click', async () => {
      cleanAnomalyBtn.disabled = true;
      cleanAnomalyBtn.textContent = '清理中...';
      const ok = await deleteExtensionViaHost('third-party', false);
      const banner = modalBox.querySelector('#ext-anomaly-banner');
      if (banner) {
        if (ok) {
          banner.style.background = 'rgba(166, 227, 161, 0.15)';
          banner.style.borderColor = '#a6e3a1';
          banner.style.color = '#a6e3a1';
          banner.innerHTML = '<i class="fa-solid fa-circle-check"></i> <strong>已成功清理残留 third-party 目录！</strong>';
        } else {
          cleanAnomalyBtn.disabled = false;
          cleanAnomalyBtn.textContent = '重试清理';
        }
      }
    });
  }

  modalBox.querySelector('#ext-select-missing').addEventListener('click', () => {
    itemsState.forEach((item) => {
      if (item.selectable) item.checkbox.checked = !item.isInstalled;
    });
  });

  modalBox.querySelector('#ext-select-all').addEventListener('click', () => {
    itemsState.forEach((item) => {
      if (item.selectable) item.checkbox.checked = true;
    });
  });

  modalBox.querySelector('#ext-deselect-all').addEventListener('click', () => {
    itemsState.forEach((item) => {
      item.checkbox.checked = false;
    });
  });

  startBtn.addEventListener('click', async () => {
    const selected = itemsState.filter((item) => item.checkbox.checked && item.selectable);
    if (selected.length === 0) {
      await alertDialog('请至少勾选一个待安装的扩展');
      return;
    }

    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    cancelBtn.disabled = true;
    forceReplaceChk.disabled = true;
    itemsState.forEach((item) => { item.checkbox.disabled = true; });
    const progressContainer = modalBox.querySelector('#ext-progress-bar-container');
    const progressStatus = modalBox.querySelector('#ext-progress-status');
    const progressNum = modalBox.querySelector('#ext-progress-num');
    const progressFill = modalBox.querySelector('#ext-progress-fill');

    progressContainer.style.display = 'block';

    let successCount = 0;
    const failedItems = [];

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const { ext, statusEl } = item;
      const progressText = `${i + 1} / ${selected.length}`;
      progressNum.textContent = progressText;
      progressFill.style.width = `${Math.round(((i + 1) / selected.length) * 100)}%`;
      progressStatus.textContent = `正在浅克隆: ${ext.displayName || ext.name} (${ext.url})...`;
      setStatusContent(statusEl, 'fa-solid fa-spinner fa-spin', '克隆中...', themeAccent());

      try {
        // 与核心层 extension-manifest.js 的 isInstallableUrl 同一规则，避免两套判定分叉
        if (!isInstallableUrl(ext.url)) {
          throw new Error('缺少有效的 Git HTTP(S) URL');
        }
        await installExtensionViaHost({
          url: ext.url,
          branch: ext.branch || 'main',
          replace: forceReplaceChk.checked,
        });
        statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #a6e3a1;"></i> 已安装';
        statusEl.style.color = '#a6e3a1';
        successCount++;
      } catch (err) {
        setStatusContent(statusEl, 'fa-solid fa-circle-xmark', err.message || '安装失败', '#f38ba8', '#f38ba8');
        failedItems.push(item);
        logger.error(`扩展 ${ext.name} 安装失败:`, err);
      }
    }

    if (failedItems.length > 0) {
      progressStatus.textContent = `安装完成：${successCount} 成功，${failedItems.length} 失败`;
      progressStatus.style.color = '#f9e2af';
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.textContent = `重试失败项 (${failedItems.length})`;
      cancelBtn.disabled = false;
      // 仅保留失败项勾选
      itemsState.forEach((item) => {
        item.checkbox.disabled = false;
        item.checkbox.checked = failedItems.includes(item);
      });
      reloadBtn.style.display = 'inline-block';
    } else {
      setStatusContent(progressStatus, 'fa-solid fa-circle-check', `全部 ${successCount} 个扩展安装成功！`, '#a6e3a1', '#a6e3a1');
      startBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      reloadBtn.style.display = 'inline-block';
    }
  });
}

/**
 * 兼容旧版命名
 */
export async function restoreToLuker(zipBlob, options = {}) {
  return restoreToHost(zipBlob, { ...options, platform: 'luker' });
}

/**
 * ⚠ **未接线**：当前**无任何调用方**。
 *
 * 本函数是 J 区曾有过的「增量合并」复选框本该接的实现。该复选框经 2026-09-25 全仓取证
 * 确认**从不生效**（其 `.checked` 无任何读取点；全仓亦无泛读复选框的代码与状态持久化），
 * 已于任务 `09-25-transfer-pack-optimize` 移除，消除「勾了却没反应」的误导，
 * 同时避免它与「差量补丁」及恢复写入的 `mode: 'merge'` 三者撞名。
 *
 * **若要上线「把入包合并进基准包」的能力**：从这里接线，但需先与用户确定语义
 * （合并哪些类目、同名条目如何取舍、与「差量补丁」的关系），**不要直接复活那个开关**。
 *
 * 对两个 Zip 数据包执行增量合并 (Incremental Archive Merge)
 * 尤其适合 TauriTavern / SillyTavern 数据包的差量累加与历史补丁融合
 * @param {Blob|File|string} baseArchive 基准包 (原有包)
 * @param {Blob|File|string} incomingArchive 增量包 (新数据包)
 * @param {object} [options]
 * @param {(current: number, total: number, filename: string) => void} [options.onProgress]
 * @returns {Promise<{ resultBlob: Blob, updatedCount: number, preservedCount: number, totalCount: number }>}
 */
export async function incrementalMergeArchives(baseArchive, incomingArchive, { onProgress } = {}) {
  logger.info('启动数据包增量合并 (Incremental Archive Merge)...');

  const incomingReader = await zipIo.openReader(incomingArchive);
  const baseReader = await zipIo.openReader(baseArchive);

  // 1. 扫描增量包中所有的文件清单
  const incomingMap = new Map();
  for await (const entry of incomingReader.entries()) {
    incomingMap.set(entry.fileName, entry);
  }

  const writerTarget = new zip.BlobWriter('application/zip');
  const writer = await zipIo.createWriter(writerTarget, { level: 5 });

  let updatedCount = 0;
  let preservedCount = 0;
  const processedIncoming = new Set();

  // 2. 遍历基准包中的每个文件
  for await (const baseEntry of baseReader.entries()) {
    const filename = baseEntry.fileName;
    if (incomingMap.has(filename)) {
      // 冲突项：采用增量包更新版本
      const incEntry = incomingMap.get(filename);
      const incData = await incEntry.read();
      await writer.add(filename, incData);
      processedIncoming.add(filename);
      updatedCount++;
      if (onProgress) onProgress(updatedCount, incomingMap.size, filename);
    } else {
      // 基准包独有项：完整保留
      const baseData = await baseEntry.read();
      await writer.add(filename, baseData);
      preservedCount++;
    }
  }

  // 3. 将增量包中独有的新增文件全部写入
  for (const [filename, incEntry] of incomingMap.entries()) {
    if (!processedIncoming.has(filename)) {
      const incData = await incEntry.read();
      await writer.add(filename, incData);
      updatedCount++;
      if (onProgress) onProgress(updatedCount, incomingMap.size, filename);
    }
  }

  await baseReader.close();
  await incomingReader.close();
  await writer.close();

  const resultBlob = await writerTarget.getData();
  const totalCount = updatedCount + preservedCount;
  logger.success(`数据包增量合并完成: 共计 ${totalCount} 个文件 (保留原有 ${preservedCount} 项，新增/更新 ${updatedCount} 项)`);

  return {
    resultBlob,
    updatedCount,
    preservedCount,
    totalCount,
  };
}

/**
 * 递归为容器内的所有 .inline-drawer 绑定展开与折叠交互
 * @param {HTMLElement} root
 */
export function setupDrawerToggles(root) {
  if (!root) return;
  const drawers = root.querySelectorAll('.inline-drawer');
  drawers.forEach((drawer) => {
    const toggle = drawer.querySelector(':scope > .inline-drawer-toggle');
    const content = drawer.querySelector(':scope > .inline-drawer-content');
    const icon = toggle ? toggle.querySelector('.inline-drawer-icon') : null;
    if (toggle && content && !toggle.dataset.toggleBound) {
      toggle.dataset.toggleBound = 'true';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = content.style.display === 'none' || getComputedStyle(content).display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        if (icon) {
          icon.classList.toggle('down', !isHidden);
          icon.classList.toggle('up', isHidden);
        }
      });
    }
  });
}

// ===== 宿主 DOM 注入基础设施 =====

/**
 * 共享 MutationObserver：替代每函数独立 setInterval 轮询。
 * 所有注入回调幂等（先查自身产物是否存在），宿主动态渲染/重渲染面板时
 * 由 DOM 变更触发重试（同时覆盖 TT 管理面板重渲染等自愈场景）。
 */
const injectionWatchers = new Set();
let injectionObserver = null;
const INJECT_DEBOUNCE_MS = 200;

function runInjectionWatchers() {
  injectionWatchers.forEach((fn) => {
    try {
      fn();
    } catch { /* 单个注入失败不阻断其余注入 */ }
  });
}

/**
 * 注册一个幂等注入回调：立即尝试一次，之后宿主 DOM 任何变更时去抖重试
 * @param {() => void} injectFn 幂等注入函数（内部自行判断锚点/产物是否存在）
 */
function watchHostDom(injectFn) {
  if (typeof document === 'undefined') return;
  injectionWatchers.add(injectFn);
  if (document.readyState === 'loading' || !document.body) {
    document.addEventListener('DOMContentLoaded', () => injectFn(), { once: true });
  } else {
    injectFn();
  }
  if (injectionObserver || !document.body) return;
  let scheduled = false;
  injectionObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      runInjectionWatchers();
    }, INJECT_DEBOUNCE_MS);
  });
  injectionObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * 宿主扩展列表「打开面板」入口注入。
 *
 * 形态（2026-10-27 R1.3）：宿主**自己**那一行 `.extension_block` 内追加一条与其它扩展
 * 一致的内联下拉，内容只有「打开面板」；点开后是全屏工作台（`openConverterModal()`）。
 * 扩展行仍只有宿主那一条，不在 `#extensions_settings2` 里另起第二个块。
 *
 * 落点要兼容两类命名：Luker 的用户私有扩展是 `data-name="/ST-pack-transfer"`，
 * 全局扩展是 `data-name="ST-pack-transfer"`（宿主侧 `externalId = name.replace('third-party','')`），
 * 故用 `*=` 子串匹配。
 *
 * **该列表是宿主按需渲染的弹层**（点 `#extensions_details` 才出现，初始 DOM 里一个
 * `.extension_block` 都没有——2026-10-15 在 Dev Luker 8003 实测），
 * 所以必须挂 `watchHostDom`，不能在 boot 时只查一次。
 *
 * @param {() => void} [onOpen] 打开全屏工作台（应为 `openConverterModal`）
 */
/**
 * 收起宿主的扩展设置浮层（工作台是全屏模态，宿主弹层层级比它高，会盖住工作台）。
 *
 * 2026-10-27 实测（TT 827×691）：点扩展行「打开」后，宿主的扩展设置抽屉/弹层仍在最上层，
 * 工作台看得见但点不到；必须关掉它。只关**包含本插件入口**的那一层，不动其它弹窗。
 */
export function closeHostExtensionSurface() {
  if (typeof document === 'undefined') return;
  const anchor = document.getElementById('st-pack-transfer-open-btn');

  // 1) 内联抽屉（ST/Luker/TT 的 #extensions-settings-button）：只在确实展开时点一下切换
  const hostDrawer = document.getElementById('extensions-settings-button');
  if (hostDrawer) {
    const content = hostDrawer.querySelector('.drawer-content');
    const visible = content
      && getComputedStyle(content).display !== 'none'
      && content.getBoundingClientRect().height > 0;
    if (visible) {
      const toggle = hostDrawer.querySelector('.drawer-toggle')
        || hostDrawer.querySelector(':scope > .inline-drawer-header');
      try { toggle?.click(); } catch { /* 宿主结构差异 */ }
    }
  }

  // 2) 所有打开的宿主弹层：点「打开面板」时它们都是扩展设置/更新提示，必须让位给全屏工作台。
  //    实测 TT 会额外弹一个「扩展更新」popup，不认 #extensions_settings，光按内容判断关不掉。
  for (const surface of document.querySelectorAll('dialog[open], .popup[open]')) {
    try { surface.close?.(); } catch { /* 非 dialog */ }
    surface.removeAttribute('open');
    surface.style.display = 'none';
  }

  // 3) 宿主遮罩
  document.querySelectorAll('.popup_background').forEach((bg) => { bg.style.display = 'none'; });
}

export function mountExtensionRowButton(onOpen) {
  if (typeof document === 'undefined') return;

  const addBtn = () => {
    document.querySelectorAll('.extension_block[data-name*="ST-pack-transfer"]').forEach((block) => {
      // 幂等：宿主重渲染会让标记随节点消失，observer 自动重注
      if (block.querySelector('[data-st-pack-transfer-injected="1"]')) return;

      const drawer = document.createElement('div');
      drawer.className = 'inline-drawer';
      drawer.dataset.stPackTransferInjected = '1';

      const toggle = document.createElement('div');
      toggle.className = 'inline-drawer-toggle inline-drawer-header';
      const title = document.createElement('b');
      title.textContent = '数据包转运';
      const icon = document.createElement('div');
      icon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
      toggle.appendChild(title);
      toggle.appendChild(icon);

      const content = document.createElement('div');
      content.className = 'inline-drawer-content';
      const openBtn = makeHostButton({
        id: 'st-pack-transfer-open-btn',
        icon: 'fa-up-right-and-down-left-from-center',
        label: '打开面板',
        title: '打开数据包转运面板',
        onClick: () => {
          if (typeof onOpen === 'function') onOpen();
        },
      });
      content.appendChild(openBtn);

      drawer.appendChild(toggle);
      drawer.appendChild(content);
      block.appendChild(drawer);
      setupDrawerToggles(block);
    });
  };

  watchHostDom(addBtn);
}

/**
 * 宿主注入按钮工厂（R7.3 按钮复用）。
 *
 * 收敛两处 `menu_button menu_button_icon` 形态的注入按钮构造：
 * 宿主原生类、`dataset.stZipInjected` 幂等标记、`<i>` 图标 + `<span>` 文案结构，
 * 以及 `preventDefault/stopPropagation` 包裹（避免触达宿主原生锚点的默认行为）。
 *
 * 工作台的固定动作按钮是**声明式模板标记**（单一模板源 R8），
 * 改由 JS 生成会与 R8 冲突，故不经本工厂。
 *
 * @param {{ id: string, icon: string, label?: string, title?: string, onClick?: () => void }} spec
 * @returns {HTMLElement} 已挂好点击处理的按钮节点
 */
function makeHostButton({ id, icon, label, title, onClick }) {
  const btn = document.createElement('div');
  btn.id = id;
  btn.dataset.stZipInjected = '1';
  // 复用宿主原生 menu_button 样式，与原生按钮并排
  btn.className = 'menu_button menu_button_icon';
  if (title) btn.title = title;
  const iconEl = document.createElement('i');
  iconEl.className = `fa-fw fa-solid ${icon}`;
  btn.appendChild(iconEl);
  if (label) {
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    btn.appendChild(labelEl);
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onClick === 'function') onClick();
  });
  return btn;
}

/**
 * 原生"用户数据备份/导出"UI 多锚点注入：在所有 .userBackupButton 旁追加
 * 转换器入口按钮。四个宿主（ST/Luker/TauriTavern/PureTavern）的
 * templates/userProfile.html（账号弹层）与 templates/admin.html（管理面板，
 * 每用户行一个）均渲染该锚点，与扩展设置抽屉共存。
 *
 * **锚点是「按需渲染」的，初始 DOM 里根本不存在**（2026-09-25 真机取证，Dev Luker 8003）：
 *   · 初始页面查询 `.userBackupButton` → **0 个**，本函数自然什么都不做；
 *   · 用户点开账号弹层后才出现 1 个 → `watchHostDom` 捕获该变更并注入。
 *   · Luker 的入口 id 是 **`#account_button`**（`user.js:3469` → `openUserProfile()`）；
 *     ST 侧用另一套 id。**排查「注入没生效」时不要只查初始 DOM，必须先把宿主面板打开**——
 *     本仓 2026-09-25 曾因只点错入口 id（`#user-settings-button` 等）而误判为回归。
 *
 * @param {() => void} [onOpen] 打开抽屉后的回调
 */
export function mountNativeBackupButton(onOpen) {
  if (typeof document === 'undefined') return;
  const BTN_ID = 'st-pack-transfer-native-btn';

  const addBtn = () => {
    // 多锚点：账号弹层（userProfile）与管理面板（admin，每用户行一个）都有 .userBackupButton
    document.querySelectorAll('.userBackupButton').forEach((anchor) => {
      if (!anchor.parentElement) return;
      // 幂等：兄弟位已注入则跳过（弹层重渲染后标记随节点消失，observer 自动重注）
      if (anchor.nextElementSibling?.dataset?.stZipInjected === '1') return;

      const openBtn = makeHostButton({
        id: BTN_ID,
        icon: 'fa-right-left',
        label: '数据包转运',
        title: '打开数据包转运面板',
        onClick: () => {
          if (typeof onOpen === 'function') onOpen();
        },
      });
      anchor.parentElement.insertBefore(openBtn, anchor.nextSibling);
    });
  };

  watchHostDom(addBtn);
}

/**
 * Luker "Backup & Restore" 管理器弹层注入：templates/userBackupManager.html
 * 由 openBackupManager 动态渲染（callGenericPopup），在动作按钮行
 * (.backupActionRow，含原生 ZIP 下载按钮) 前插入转换器入口。
 * 仅 Luker 存在该锚点，其余宿主自然无操作。
 *
 * **渲染链路与落点（2026-09-25 真机取证，Dev Luker 8003）**：
 *   账号弹层里的**原生** `.userBackupButton` 被点击 → `user.js:1136 openBackupManager()`
 *   渲染本弹层。故本锚点**必须先把账号弹层打开再点原生备份按钮**才会出现。
 *   `.backupActionRow` 实测有 **5 行**，但只有 **index 0** 含原生 ZIP 下载按钮
 *   （其余为「选择 ZIP 恢复」「局域网同步」「创建迁移链接」「从链接迁移」），
 *   因此 `querySelector('.userBackupManager .backupActionRow')`（取首个）**正是预期落点**，
 *   真机确认注入按钮即 row 0 的第一个子节点。
 *
 * @param {() => void} [onOpen]
 */
export function mountLukerBackupManagerButton(onOpen) {
  if (typeof document === 'undefined') return;
  const BTN_ID = 'st-pack-transfer-luker-manager-btn';

  const addBtn = () => {
    if (document.getElementById(BTN_ID)) return;
    const row = document.querySelector('.userBackupManager .backupActionRow');
    if (!row) return;

    const btn = makeHostButton({
      id: BTN_ID,
      icon: 'fa-right-left',
      label: '数据包转运',
      title: '打开数据包转运面板',
      onClick: () => {
        if (typeof onOpen === 'function') {
          onOpen();
        }
      },
    });
    row.insertBefore(btn, row.firstChild);
  };

  watchHostDom(addBtn);
}
