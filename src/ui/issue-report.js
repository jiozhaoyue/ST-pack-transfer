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
import { detectHost } from './host-bridge.js';
import { getStorageUsage, isStorageSupported } from '../storage/db.js';

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
    const st = typeof globalThis !== 'undefined' ? globalThis.SillyTavern : null;
    const ctx = st && typeof st.getContext === 'function' ? st.getContext() : null;
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

  return {
    pluginVersion: present(APP_VERSION, UNAVAILABLE),
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

/** 从内存日志缓冲取最近 N 条并格式化；全部经过 safeRedact 由调用方兜底。 */
function collectLogText(logLevel, logCount) {
  try {
    const level = !logLevel || logLevel === 'ALL' ? 'ALL' : String(logLevel).toUpperCase();
    const entries = logger.getEntries(level);
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
