/**
 * 问题报告（Issue Report）
 *
 * 设计边界：
 * - collectReportEnv() 全部本地读取，零网络；读不到的字段显式 'unavailable'，禁止编造。
 * - 默认不采集聊天内容 / 角色卡 / 世界书 / 宿主用户名 / 绝对路径。
 * - 所有对外文本统一经过 core/logger.js 的 redact()，绝不输出未脱敏原文。
 * - submitToGitHub() 使用用户自备 fine-grained PAT，直连 GitHub Issues API。
 */

import { APP_VERSION } from '../core/app-version.js';
import { logger, redact } from '../core/logger.js';
import { HOST_CAPABILITIES, capabilityState } from '../core/host-capabilities.js';
import { detectHost, getHostContext } from './host-bridge.js';
import { getStorageUsage, isStorageSupported } from '../storage/db.js';
import { resolveUpstreamChannels, parseGitHubUrl } from '../core/upstream-resolver.js';

/**
 * 同步初始化：仅用本地 yml（import.meta.glob）与 window.location 推导本仓坐标，
 * 零网络、零异步，保证设置面板首帧即可渲染真实模板与本仓跳转按钮。
 * 上游坐标与 raw 刷新由异步 initIssueReportContext 补齐。
 */
export function initIssueReportSync() {
  let current = null;
  try {
    if (typeof window !== 'undefined' && window.location?.href) {
      current = parseGitHubUrl(window.location.href);
    }
  } catch { /* 保持 null */ }
  cachedIssueCoords = {
    current,
    upstream: null,
    provenance: current ? 'local-window' : 'local-default',
    isFork: false,
  };
  const sources = bundledTemplateSources();
  if (sources) {
    const parsed = parseIssueTemplates(sources);
    return { coords: cachedIssueCoords, templates: parsed.templates, config: parsed.config, source: 'local' };
  }
  return { coords: cachedIssueCoords, templates: [], config: null, source: 'none' };
}

/** 当前坐标快照（同步，供 UI 读取；无坐标返回空值与可用性布尔）。 */
export function issueCoordsSnapshotSync() {
  return {
    current: cachedIssueCoords?.current ? { ...cachedIssueCoords.current } : null,
    upstream: cachedIssueCoords?.upstream ? { ...cachedIssueCoords.upstream } : null,
    provenance: cachedIssueCoords?.provenance || '',
    currentAvailable: issueChannelAvailable(cachedIssueCoords, 'current'),
    upstreamAvailable: issueChannelAvailable(cachedIssueCoords, 'upstream'),
  };
}

/** 轻量 HTML 转义（表单渲染用），避免把 yml 文案里的尖括号注入 DOM。 */
function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const UNAVAILABLE = 'unavailable';
const DB_NAME = 'st_zip_converter_db';

/** 把任意值规范成非空字符串；空值统一降级为 unavailable。 */
function present(value, fallback = UNAVAILABLE) {
  if (value === null || value === undefined) return fallback;
  const s = String(value);
  return s.trim() ? s : fallback;
}

/** 统一脱敏出口；任何要写进报告的文本都过这里。 */
function safeRedact(value) {
  return redact(value === null || value === undefined ? '' : String(value));
}

/** Markdown 表格单元格：换行压成空格，竖线转义，避免撑破表格。 */
function mdCell(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** 读取宿主版本（本地、同步），没有可靠来源就返回 unavailable。 */
function readHostVersion() {
  try {
    const ctx = getHostContext();
    if (!ctx) return UNAVAILABLE;
    return present(ctx.version ?? ctx.pkgVersion, UNAVAILABLE);
  } catch {
    return UNAVAILABLE;
  }
}

/** 读取本插件 IndexedDB 版本（本地、零网络），读不到就 unavailable。 */
async function readDbVersion() {
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      const hit = Array.isArray(dbs) && dbs.find((d) => d && d.name === DB_NAME);
      if (hit && typeof hit.version === 'number') return String(hit.version);
    }
  } catch {
    /* 老浏览器无 databases()，如实降级 */
  }
  return UNAVAILABLE;
}

/** host-capabilities 声明表 → 逐项摘要（supported / known），不猜测。 */
function buildCapabilitySnapshot(platform) {
  const snapshot = {};
  for (const kind of Object.keys(HOST_CAPABILITIES)) {
    try {
      const state = capabilityState(kind, platform);
      snapshot[kind] = { supported: !!state.supported, known: !!state.known };
    } catch {
      snapshot[kind] = { supported: false, known: false };
    }
  }
  return snapshot;
}

/**
 * 采集环境信息（全部本地，零网络）。
 * 读不到的字段显式标 'unavailable'；hostIsPlugin / dbAvailable 是布尔，始终有确定值。
 */
export async function collectReportEnv() {
  let host = { platform: UNAVAILABLE, isPlugin: false };
  try {
    const detected = detectHost();
    host = {
      platform: present(detected?.platform, UNAVAILABLE),
      isPlugin: detected?.isPlugin === true,
    };
  } catch {
    /* 宿主探测失败仍给出确定布尔值，platform 落 unavailable */
  }

  let ua = UNAVAILABLE;
  try {
    if (typeof navigator !== 'undefined') ua = present(navigator.userAgent, UNAVAILABLE);
  } catch { /* 保持 unavailable */ }

  let pageUrl = UNAVAILABLE;
  try {
    if (typeof location !== 'undefined') {
      const href = location.href || '';
      // 去掉 query / hash，避免把 token、userinfo、跟踪参数带进报告。
      pageUrl = present(href.split('?')[0].split('#')[0], UNAVAILABLE);
    }
  } catch { /* 保持 unavailable */ }

  let dbAvailable = false;
  try { dbAvailable = isStorageSupported() === true; } catch { dbAvailable = false; }

  let packageCount = UNAVAILABLE;
  let storageBytes = UNAVAILABLE;
  if (dbAvailable) {
    try {
      const usage = await getStorageUsage();
      if (usage && typeof usage === 'object') {
        packageCount = present(usage.count, UNAVAILABLE);
        storageBytes = present(usage.totalBytes, UNAVAILABLE);
      }
    } catch {
      /* 读取失败如实降级 */
    }
  }

  let channels = null;
  try {
    channels = await resolveUpstreamChannels();
  } catch {
    channels = null;
  }

  return {
    pluginVersion: present(APP_VERSION, UNAVAILABLE),
    currentRepo: present(channels?.current?.url, UNAVAILABLE),
    upstreamRepo: present(channels?.upstream?.url, UNAVAILABLE),
    isFork: channels?.isFork ?? false,
    hostPlatform: host.platform,
    hostIsPlugin: host.isPlugin,
    hostVersion: readHostVersion(),
    ua,
    pageUrl,
    dbAvailable,
    dbVersion: await readDbVersion(),
    packageCount,
    storageBytes,
    capabilitySnapshot: buildCapabilitySnapshot(host.platform),
    collectedAt: new Date().toISOString(),
  };
}

/** 规范化用户输入：支持字符串（视为问题描述）或 { description, steps, title }。 */
function normalizeUserInput(userInput) {
  if (typeof userInput === 'string') {
    return { description: present(userInput), steps: UNAVAILABLE, title: UNAVAILABLE };
  }
  if (userInput && typeof userInput === 'object') {
    return {
      description: present(userInput.description),
      steps: present(userInput.steps),
      title: present(userInput.title),
    };
  }
  return { description: UNAVAILABLE, steps: UNAVAILABLE, title: UNAVAILABLE };
}

/** 组装环境信息表格行（覆盖 collectReportEnv 的全部 12 个字段）。 */
function envRows(env) {
  const rows = [
    ['插件版本', env.pluginVersion],
    ['当前仓库', env.currentRepo || UNAVAILABLE],
    ['官方上游', env.upstreamRepo || UNAVAILABLE],
    ['派生形态', env.isFork ? 'Fork 衍生版' : '官方根仓库'],
    ['宿主平台', env.hostPlatform],
    ['宿主形态', env.hostIsPlugin === true ? '插件' : (env.hostIsPlugin === false ? '独立运行' : UNAVAILABLE)],
    ['宿主版本', env.hostVersion],
    ['User Agent', env.ua],
    ['页面地址', env.pageUrl],
    ['存储可用', env.dbAvailable === true ? 'yes' : (env.dbAvailable === false ? 'no' : UNAVAILABLE)],
    ['数据库版本', env.dbVersion],
    ['包数量', env.packageCount],
    ['占用字节', env.storageBytes],
    ['采集时间', env.collectedAt],
  ];
  const snapshot = env.capabilitySnapshot;
  if (snapshot && typeof snapshot === 'object') {
    for (const [kind, state] of Object.entries(snapshot)) {
      const summary = state && typeof state === 'object'
        ? `supported=${present(state.supported, UNAVAILABLE)}, known=${present(state.known, UNAVAILABLE)}`
        : present(state);
      rows.push([`能力 ${kind}`, summary]);
    }
  }
  return rows;
}

/**
 * 级别优先级：与 logger.js 的 LEVEL_ORDER 对齐（SUCCESS 与 INFO 同级）。
 * 仅用于插件侧的「≥ 某级别」聚合过滤；logger.getEntries 只支持精确等值。
 */
const ISSUE_LEVEL_ORDER = Object.freeze({ DEBUG: 10, INFO: 20, SUCCESS: 20, WARN: 30, ERROR: 40 });
/** 语义级别 → 最低阈值；all/debug 为 0/10（等价于全量），非法值视为全量。 */
const ISSUE_MIN_LEVEL_THRESHOLD = Object.freeze({ all: 0, debug: 10, info: 20, warn: 30, error: 40 });

/**
 * 纯函数：按「≥ 最低级别」聚合过滤日志条目。
 * logger.getEntries 是精确等值过滤，无法表达「警告以上」，故在插件侧按其级别序重过滤。
 * SUCCESS 与 INFO 同级（20），因此 info/warn 聚合都会纳入 SUCCESS。
 * @param {Array<object>} entries logger.getEntries('ALL') 的原始条目
 * @param {string} minLevel all|debug|info|warn|error（大小写不敏感）
 * @returns {Array<object>} 过滤后的新数组（不改入参）
 */
export function filterEntriesByMinLevel(entries, minLevel) {
  const list = Array.isArray(entries) ? entries : [];
  const threshold = ISSUE_MIN_LEVEL_THRESHOLD[String(minLevel ?? '').toLowerCase()];
  if (!Number.isFinite(threshold) || threshold <= 0) return [...list];
  return list.filter((e) => (ISSUE_LEVEL_ORDER[String(e?.level ?? '').toUpperCase()] || 0) >= threshold);
}

/** 从内存日志缓冲取最近 N 条并格式化；全部经过 safeRedact 由调用方兜底。 */
function collectLogText(logLevel, logCount) {
  try {
    /* 取全量后按「≥ 级别」聚合过滤（logger 只支持精确等值）；统计与报告共用本函数。 */
    const entries = filterEntriesByMinLevel(logger.getEntries('ALL'), logLevel);
    let chosen = entries;
    const n = Number(logCount);
    if (logCount !== 'all' && logCount !== 'ALL' && Number.isFinite(n)) {
      chosen = entries.slice(Math.max(0, entries.length - Math.max(0, n)));
    }
    return chosen.map((entry) => {
      let line = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
      if (entry.detail !== null && entry.detail !== undefined) {
        let detail = '';
        try { detail = JSON.stringify(entry.detail); } catch { detail = '[unserializable]'; }
        line += ` detail=${detail || 'null'}`;
      }
      return line;
    }).join('\n');
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * 生成报告正文（Markdown）。
 * 结构对齐 GitHub issue 模板：问题描述 / 复现步骤 / 环境信息 / 日志。
 * 所有文本（用户输入、环境值、日志）均经 redact()，绝不输出未脱敏原文。
 */
export function buildReportMarkdown({ env, userInput, includeLogs = true, logLevel = 'ALL', logCount = 100 } = {}) {
  const envObj = env && typeof env === 'object' ? env : {};
  const input = normalizeUserInput(userInput);
  const lines = [];

  lines.push('## 问题描述', safeRedact(input.description), '');
  lines.push('## 复现步骤', safeRedact(input.steps), '');

  lines.push('## 环境信息', '| 项 | 值 |', '| --- | --- |');
  for (const [label, value] of envRows(envObj)) {
    // 任何读不到的字段一律降级为 unavailable，绝不输出空单元格。
    lines.push(`| ${mdCell(label)} | ${mdCell(safeRedact(present(value, UNAVAILABLE)))} |`);
  }
  lines.push('');

  if (includeLogs) {
    lines.push('## 日志', '```text', safeRedact(collectLogText(logLevel, logCount)) || UNAVAILABLE, '```', '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** 脱敏预览（调 logger.redact）。 */
export function previewRedacted(text) {
  return safeRedact(text);
}

/**
 * 提交到 GitHub（需 PAT）。
 * 用户自备 fine-grained PAT，权限 Issues: Read and write，仅勾选目标仓库。
 * 无 token / 缺 owner / 缺 repo 时抛明确错误；title/body 再次经 redact() 兜底。
 */
export async function submitToGitHub({ owner, repo, title, body, token, labels } = {}) {
  if (!token || !String(token).trim()) {
    throw new Error('提交 issue 失败：缺少 GitHub token（PAT），请先在设置中填写。');
  }
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  if (!o || !r) {
    throw new Error('提交 issue 失败：缺少 owner 或 repo。');
  }

  const safeTitle = safeRedact(title || '');
  const safeBody = safeRedact(body || '');
  const labelList = Array.isArray(labels)
    ? labels.filter((l) => typeof l === 'string' && l.trim())
    : [];

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title: safeTitle, body: safeBody, labels: labelList }),
    },
  );

  let payload = null;
  try { payload = await response.json(); } catch { /* 非 JSON 响应 */ }
  if (!response.ok) {
    const msg = payload && typeof payload.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new Error(`提交 issue 失败：${msg} (HTTP ${response.status})`);
  }
  return payload;
}

/**
 * 动态坐标缓存：由 resolveIssueCoords()（异步）填充。
 * 同步的 buildGitHubNewIssueUrl 从这里取缺省 owner/repo，彻底去掉模块内硬编码。
 * provenance === 'local-default' 表示 resolver 只拿到离线托底默认值，
 * 按 G-34 视为「未提供」，UI 据此把跳转按钮置灰，绝不拿假坐标冒充真实仓库。
 */
let cachedIssueCoords = null;

/**
 * 双通道动态解析 issue 坐标（本仓 / 上游）。
 * 复用 core/upstream-resolver.js，不在本模块重写溯源逻辑，也不硬编码任何 owner/repo。
 * @param {object} [options] 透传给 resolveUpstreamChannels（可注入 fetchFn / remoteUrl，便于测试）
 * @returns {Promise<object|null>} 解析结果；异常时返回 null（静默降级）
 */
export async function resolveIssueCoords(options = {}) {
  try {
    const r = await resolveUpstreamChannels(options);
    cachedIssueCoords = {
      current: r?.current ? { ...r.current } : null,
      upstream: r?.upstream ? { ...r.upstream } : null,
      provenance: r?.provenance || '',
      isFork: !!r?.isFork,
    };
    return cachedIssueCoords;
  } catch {
    cachedIssueCoords = null;
    return null;
  }
}

/** 单条通道坐标是否可用（非离线托底默认值且 owner/repo 齐全）。 */
export function issueChannelAvailable(coords, key = 'current') {
  const channel = coords?.[key];
  const provenance = coords?.provenance;
  return !!(channel && channel.owner && channel.repo
    && provenance && provenance !== 'local-default');
}

/**
 * 组装在浏览器中打开预填 issue 的 URL（零网络、零凭据风险）
 * owner/repo 缺省时从 resolver 缓存动态取；取不到返回空串，绝不拼造假 URL。
 * @param {{ owner?: string, repo?: string, title?: string, body?: string }} options
 * @returns {string} URL，或 ''（坐标未提供）
 */
export function buildGitHubNewIssueUrl({ owner, repo, title = '', body = '' } = {}) {
  const o = String(owner || cachedIssueCoords?.current?.owner || '').trim();
  const r = String(repo || cachedIssueCoords?.current?.repo || '').trim();
  if (!o || !r) return '';
  const t = encodeURIComponent(safeRedact(title || ''));
  const b = encodeURIComponent(safeRedact(body || ''));
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues/new?title=${t}&body=${b}`;
}

/**
 * GitHub 新建 issue URL 长度护栏阈值。
 * GitHub 对 issues/new 的完整 URL 实测约 8KB 上限，超限大概率打开空白页或 414，
 * 取 8000 留出约 192B 余量（G-20：失败不得静默）。
 */
export const MAX_ISSUE_URL_LENGTH = 8000;

/**
 * 带长度护栏的 URL 构造（方案 A：不改动 buildGitHubNewIssueUrl 的签名与返回值）。
 * 未超限返回 { ok: true, url }；超限返回 { ok: false, reason: 'too-long', length, suggestion }；
 * 坐标未提供（原函数返回空串）返回 { ok: false, reason: 'no-coords', length: 0 }。
 * suggestion 为内部降级标识，调用方据此引导「复制 Markdown」或改走 submitToGitHub(POST)。
 * @param {{ owner?: string, repo?: string, title?: string, body?: string }} options
 * @returns {{ ok: boolean, url?: string, reason?: string, length: number, suggestion?: string }}
 */
export function buildGitHubNewIssueUrlSafe(options = {}) {
  const url = buildGitHubNewIssueUrl(options);
  if (!url) return { ok: false, reason: 'no-coords', length: 0 };
  if (url.length > MAX_ISSUE_URL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      length: url.length,
      suggestion: 'copy-markdown',
    };
  }
  return { ok: true, url };
}

/* ============================================================================
 * Issue 模板同步与解析（GitHub Issue Forms YAML 的最小子集，零新增依赖）
 * 覆盖字段：name/description/title/labels/blank_issues_enabled/contact_links
 *   body[]: type/id/attributes.{label,description,placeholder,value,options}/
 *           validations.required、checkboxes.options[].{label,required}
 * 解析不了的结构一律跳过，绝不臆测内容。
 * ========================================================================== */

/** 把标量 token 转成 JS 值：去成对引号 + true/false/null 字面量。 */
function parseIssueScalar(raw) {
  let v = String(raw).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  return v;
}

/**
 * 词法化 GitHub Issue Forms YAML：产出带缩进的 token。
 * 块标量（value: | / placeholder: |）整体吞并为一个 isBlock token，
 * 其内部的 markdown 正文不参与结构解析，避免误当成字段。
 */
function tokenizeIssueYaml(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const tokens = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^\s*/)[0].length;
    const content = line.slice(indent);

    if (/[:\-]\s*[|>][-+]?\s*$/.test(content)) {
      const key = content.replace(/\s*[|>][-+]?\s*$/, '').replace(/:$/, '').trim();
      const parts = [];
      let j = i + 1;
      while (j < raw.length) {
        const next = raw[j];
        if (!next.trim()) { parts.push(''); j += 1; continue; }
        const nextIndent = next.match(/^\s*/)[0].length;
        if (nextIndent <= indent) break;
        parts.push(next.slice(Math.min(nextIndent, indent + 2)));
        j += 1;
      }
      tokens.push({ indent, key, block: parts.join('\n').replace(/\n+$/, ''), isBlock: true });
      i = j - 1;
      continue;
    }
    tokens.push({ indent, content, isBlock: false });
  }
  return tokens;
}

/** 解析「key: value」为一对象条目；首行由 list item 去 '- ' 后提供。 */
function parseIssueMapWithFirst(tokens, state, indent, firstContent) {
  const obj = {};
  const applyContent = (content) => {
    const m = /^([^:]+):\s*(.*)$/.exec(content);
    if (!m) return;
    const key = m[1].trim();
    const val = m[2].trim();
    if (val) obj[key] = parseIssueScalar(val);
    else if (state.i < tokens.length && tokens[state.i].indent > indent) {
      obj[key] = parseIssueNode(tokens, state, tokens[state.i].indent);
    } else obj[key] = null;
  };
  // 首行不含子缩进递归的推进（其字段与后续同层字段一起由 while 统一推进）。
  applyContent(firstContent);
  while (state.i < tokens.length) {
    const t = tokens[state.i];
    if (t.indent !== indent) break;
    if (t.isBlock) { obj[t.key] = t.block; state.i += 1; continue; }
    if (/^-\s/.test(t.content)) break;
    const m = /^([^:]+):\s*(.*)$/.exec(t.content);
    if (!m) { state.i += 1; continue; }
    const key = m[1].trim();
    const val = m[2].trim();
    state.i += 1;
    if (val) obj[key] = parseIssueScalar(val);
    else if (state.i < tokens.length && tokens[state.i].indent > indent) {
      obj[key] = parseIssueNode(tokens, state, tokens[state.i].indent);
    } else obj[key] = null;
  }
  return obj;
}

/** 递归下降：按缩进解析 map / list 节点。 */
function parseIssueNode(tokens, state, indent) {
  if (state.i >= tokens.length) return null;
  const first = tokens[state.i];
  if (first.indent < indent) return null;
  const isList = !first.isBlock && /^-\s|^-$/.test(first.content);

  if (isList) {
    const arr = [];
    while (state.i < tokens.length) {
      const t = tokens[state.i];
      if (t.indent !== indent || t.isBlock || !/^-\s|^-$/.test(t.content)) break;
      const item = t.content.replace(/^-\s*/, '').trim();
      state.i += 1;
      if (!item) {
        arr.push(state.i < tokens.length && tokens[state.i].indent > indent
          ? parseIssueNode(tokens, state, tokens[state.i].indent) : null);
      } else if (/^[^:]+:\s*/.test(item) && !/^https?:\/\//i.test(item)) {
        arr.push(parseIssueMapWithFirst(tokens, state, indent + 2, item));
      } else {
        arr.push(parseIssueScalar(item));
      }
    }
    return arr;
  }

  const obj = {};
  while (state.i < tokens.length) {
    const t = tokens[state.i];
    if (t.indent !== indent) break;
    if (t.isBlock) { obj[t.key] = t.block; state.i += 1; continue; }
    if (/^-\s/.test(t.content)) break;
    const m = /^([^:]+):\s*(.*)$/.exec(t.content);
    if (!m) { state.i += 1; continue; }
    const key = m[1].trim();
    const val = m[2].trim();
    state.i += 1;
    if (val) obj[key] = parseIssueScalar(val);
    else if (state.i < tokens.length && tokens[state.i].indent > indent) {
      obj[key] = parseIssueNode(tokens, state, tokens[state.i].indent);
    } else obj[key] = null;
  }
  return obj;
}

/** 解析单个 YAML 文档为普通对象；解析失败返回 null。 */
export function parseIssueTemplate(text) {
  const tokens = tokenizeIssueYaml(text);
  if (!tokens.length) return null;
  const state = { i: 0 };
  const parsed = parseIssueNode(tokens, state, tokens[0].indent);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.body)) return parsed;
  // required 恒为布尔：markdown 等类型不支持 required，统一补 false 而非 undefined。
  parsed.body = parsed.body.map((item) => (
    item && typeof item === 'object'
      ? { ...item, required: item.required === true || item.validations?.required === true }
      : item
  ));
  return parsed;
}

/** 把 body 字段内嵌的 options / required 规整为稳定结构。 */
function normalizeIssueTemplate(obj) {
  const body = (Array.isArray(obj.body) ? obj.body : []).map((f) => {
    if (!f || typeof f !== 'object') return f;
    const attrs = f.attributes && typeof f.attributes === 'object' ? f.attributes : {};
    let options = attrs.options;
    if (options && !Array.isArray(options)) options = [options];
    if (Array.isArray(options)) {
      options = options.map((o) => {
        if (typeof o === 'string' || typeof o === 'number') return { label: String(o), required: false };
        if (o && typeof o === 'object') {
          return { label: present(o.label, ''), required: o.required === true };
        }
        return { label: '', required: false };
      });
    }
    return {
      type: present(f.type, ''),
      id: present(f.id, ''),
      attributes: {
        ...attrs,
        label: present(attrs.label, ''),
        description: present(attrs.description, ''),
        placeholder: present(attrs.placeholder, ''),
        value: typeof attrs.value === 'string' ? attrs.value : '',
        options: options || [],
      },
      required: f.validations?.required === true || f.required === true,
    };
  });
  return {
    name: present(obj.name, ''),
    description: present(obj.description, ''),
    title: present(obj.title, ''),
    labels: Array.isArray(obj.labels) ? obj.labels.filter((l) => typeof l === 'string') : [],
    body,
  };
}

/** 解析 sources 映射（文件名 → yml 文本）为 { templates, config }；支持 --- 多文档。 */
export function parseIssueTemplates(sources = {}) {
  const templates = [];
  let config = null;
  for (const text of Object.values(sources || {})) {
    if (typeof text !== 'string') continue;
    const docs = text.split(/^---\s*$/m).filter((s) => s.trim());
    for (const doc of docs) {
      const obj = parseIssueTemplate(doc);
      if (!obj || typeof obj !== 'object') continue;
      if (Array.isArray(obj.body)) templates.push(normalizeIssueTemplate(obj));
      else if (Object.prototype.hasOwnProperty.call(obj, 'blank_issues_enabled')) {
        const links = Array.isArray(obj.contact_links) ? obj.contact_links : [];
        config = {
          blankIssuesEnabled: obj.blank_issues_enabled === true,
          contactLinks: links.filter((l) => l && typeof l === 'object').map((l) => ({
            name: present(l.name, ''), url: present(l.url, ''), about: present(l.about, ''),
          })),
        };
      }
    }
  }
  return { templates, config };
}

/**
 * 内置最小默认模板：仅当本地 yml 与远端 raw 都拉不到时使用。
 * 不含任何 owner/repo 坐标；章节结构与本地模板同构，保证降级后表单仍可用。
 */
const BUILTIN_TEMPLATE_SET = `
name: 问题反馈
description: 报告问题或提出建议
title: "[Issue] "
labels:
  - bug
body:
  - type: textarea
    id: summary
    attributes:
      label: 问题摘要
      description: 一句话说明问题
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: 复现步骤
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期望结果
    validations:
      required: false
`;

/** 构建期内联本地模板（Vite import.meta.glob，离线可用、G-13 零网络）；不可用返回 null。 */
function bundledTemplateSources() {
  try {
    if (typeof import.meta.glob !== 'function') return null;
    const mods = import.meta.glob('../../.github/ISSUE_TEMPLATE/*.yml', {
      query: '?raw', import: 'default', eager: true,
    });
    const out = {};
    for (const [k, v] of Object.entries(mods || {})) {
      if (typeof v === 'string') out[k.split('/').pop()] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * 模板同步：优先本地 yml → 退化本仓 raw 拉取 → 内置最小默认。
 * 每条外部路径都 try/catch 静默降级；两条线坐标均由调用方从 resolver 传入，本函数零硬编码。
 * @param {{ fetchFn?: Function, current?: object, branch?: string }} options
 * @returns {Promise<{ templates: Array, config: object|null, source: string, warning: string }>}
 */
export async function loadIssueTemplates({ fetchFn, current, branch = 'main' } = {}) {
  let sources = bundledTemplateSources();
  let source = 'local';

  if (!sources) {
    try {
      const fn = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
      if (fn && current?.owner && current?.repo) {
        const base = 'https://raw.githubusercontent.com/'
          + `${encodeURIComponent(current.owner)}/${encodeURIComponent(current.repo)}/`
          + `${encodeURIComponent(branch)}/.github/ISSUE_TEMPLATE/`;
        const names = ['bug_report.yml', 'feature_request.yml', 'config.yml'];
        const got = {};
        await Promise.all(names.map(async (name) => {
          try {
            const resp = await fn(base + name);
            if (resp && resp.ok) got[name] = await resp.text();
          } catch { /* 单文件拉失败不拖垮其它 */ }
        }));
        if (Object.keys(got).length) { sources = got; source = 'remote'; }
      }
    } catch { /* 静默降级到内置 */ }
  }

  if (!sources) {
    sources = { __builtin__: BUILTIN_TEMPLATE_SET };
    source = 'builtin';
  }

  const parsed = parseIssueTemplates(sources);
  const warning = (source === 'builtin' || parsed.templates.length === 0)
    ? 'issue.templateSyncFailed' : '';
  return { ...parsed, source, warning };
}

/**
 * 按选中模板的 body[] 结构生成 Markdown；答案来自动态表单。
 * context: { prereqs:{docs,search}, docsUrl, searchUrl, envText }
 * 所有用户可控文本经 safeRedact 后再入正文。
 */
export function buildIssueTemplateBody(template, values = {}, context = {}) {
  const body = Array.isArray(template?.body) ? template.body : [];
  const lines = [];

  for (const field of body) {
    const type = present(field?.type, '');
    const attrs = field?.attributes || {};
    const label = present(attrs.label, field?.id || type);
    if (type === 'markdown') {
      if (attrs.value) lines.push(attrs.value, '');
    } else if (type === 'checkboxes') {
      const picked = values?.[field.id];
      const chosen = Array.isArray(picked) ? picked : [];
      lines.push('### ' + label, '');
      for (const opt of (Array.isArray(attrs.options) ? attrs.options : [])) {
        const mark = chosen.includes(opt.label) ? 'x' : ' ';
        lines.push(`- [${mark}] ${present(opt.label, '')}`);
      }
      lines.push('');
    } else if (type === 'dropdown' || type === 'textarea' || type === 'input') {
      const answer = present(values?.[field.id], UNAVAILABLE);
      lines.push('### ' + label, '', safeRedact(answer), '');
    }
  }

  const prereqs = context.prereqs || {};
  lines.push('### 提交前确认', '');
  lines.push(`- [${prereqs.docs ? 'x' : ' '}] 已查阅文档：${present(context.docsUrl, UNAVAILABLE)}`);
  lines.push(`- [${prereqs.search ? 'x' : ' '}] 已搜索确认无重复议题：${present(context.searchUrl, UNAVAILABLE)}`);
  lines.push('');

  if (context.envText) {
    lines.push('### 环境信息', '', '```text', safeRedact(context.envText), '```', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** 提交前两项强制勾选的满足判定与缺失清单（供 UI 计算按钮 disabled）。 */
export function issuePrereqsMet(prereqs = {}) {
  return prereqs.docs === true && prereqs.search === true;
}

export function issuePrereqsMissing(prereqs = {}) {
  const missing = [];
  if (prereqs.docs !== true) missing.push('docs');
  if (prereqs.search !== true) missing.push('search');
  return missing;
}

/** 议题搜索页 URL：<repo>/issues?q=is%3Aissue+<关键词>；坐标来自 resolver，取不到返回 ''。 */
export function buildIssueSearchUrl(coords, keyword, key = 'current') {
  const channel = coords?.[key];
  if (!channel?.owner || !channel?.repo) return '';
  const q = encodeURIComponent(`is:issue ${present(keyword, '')}`.trim());
  return `https://github.com/${encodeURIComponent(channel.owner)}/${encodeURIComponent(channel.repo)}/issues?q=${q}`;
}

/** 文档仓库页面 URL：owner/repo 从 resolver 取，取不到返回 ''（G-34 禁假数据）。 */
export function buildDocsRepoUrl(coords, key = 'current') {
  const channel = coords?.[key];
  if (!channel?.owner || !channel?.repo) return '';
  return `https://github.com/${encodeURIComponent(channel.owner)}/${encodeURIComponent(channel.repo)}/blob/main/docs/DEVELOPER-GUIDE.md`;
}

/**
 * 渲染模板选择下拉选项（value 为模板 name，文案来自 yml）。
 * 无模板时给一个禁用占位项，避免空下拉。
 */
export function renderTemplateOptions(templates = []) {
  if (!Array.isArray(templates) || !templates.length) {
    return '<option value="" disabled selected>' + escHtml(UNAVAILABLE) + '</option>';
  }
  return templates.map((t, i) => (
    '<option value="' + escHtml(t.name) + '"' + (i === 0 ? ' selected' : '') + '>'
    + escHtml(t.name) + '</option>'
  )).join('');
}

/**
 * 按模板 body[] 渲染动态表单 HTML。
 * textarea→textarea，dropdown→select，input→input，markdown→只读提示块，checkboxes→多选。
 * 所有 yml 文案经 escHtml；字段带 data-issue-field 供 readIssueReportForm 采集。
 */
export function renderTemplateFields(template) {
  const body = Array.isArray(template?.body) ? template.body : [];
  return body.map((field) => {
    const attrs = field?.attributes || {};
    const label = present(attrs.label, field?.id || present(field?.type, ''));
    const fid = present(field?.id, '');
    const req = field?.required ? ' data-req="1"' : '';
    const desc = attrs.description ? '<div class="ext-note">' + escHtml(attrs.description) + '</div>' : '';

    if (field?.type === 'markdown') {
      if (!attrs.value) return '';
      return '<div class="ext-note issue-tpl-markdown">' + escHtml(attrs.value) + '</div>';
    }
    if (field?.type === 'checkboxes') {
      const opts = (Array.isArray(attrs.options) ? attrs.options : []).map((o) => (
        '<label class="checkbox_label" style="display:block">'
        + '<input type="checkbox" data-issue-field="' + escHtml(fid) + '" value="' + escHtml(o.label) + '"> '
        + escHtml(o.label) + (o.required ? ' *' : '') + '</label>'
      )).join('');
      return '<label class="et-git"><span>' + escHtml(label) + '</span></label>' + desc + opts;
    }
    if (field?.type === 'dropdown') {
      const opts = (Array.isArray(attrs.options) ? attrs.options : []).map((o) => (
        '<option value="' + escHtml(o.label) + '">' + escHtml(o.label) + '</option>'
      )).join('');
      return '<label class="et-git"><span>' + escHtml(label) + '</span>'
        + '<select class="text_pole" data-issue-field="' + escHtml(fid) + '"' + req + '>'
        + opts + '</select></label>' + desc;
    }
    if (field?.type === 'textarea') {
      return '<label class="et-git"><span>' + escHtml(label) + '</span>'
        + '<textarea class="text_pole" rows="3" data-issue-field="' + escHtml(fid) + '"'
        + ' placeholder="' + escHtml(attrs.placeholder) + '"' + req + '></textarea></label>' + desc;
    }
    if (field?.type === 'input') {
      return '<label class="et-git" style="margin-top:6px"><span>' + escHtml(label) + '</span>'
        + '<input class="text_pole" type="text" data-issue-field="' + escHtml(fid) + '"'
        + ' placeholder="' + escHtml(attrs.placeholder) + '"' + req + '></label>' + desc;
    }
    return '';
  }).filter(Boolean).join('');
}
