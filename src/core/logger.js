/**
 * 实时日志与审计系统 (Logger)
 * 支持结构化记录、级别过滤、环形内存缓冲、事件订阅与一键文本导出。
 */

import { APP_VERSION, APP_COMMIT } from './app-version.js';

const MAX_LOG_ENTRIES = 1000;

export const LOG_LEVELS = Object.freeze({
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
});

/**
 * 级别顺序：只决定**控制台镜像**的阈值，不决定是否入账。
 * 用户 2026-11-17 裁定：所有东西都要进日志（含 debug），默认只开到 warn。
 */
const LEVEL_ORDER = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  SUCCESS: 20,
  WARN: 30,
  ERROR: 40,
});

/** 默认只显示/镜像 WARN 及以上；UI 可切到 debug 查看全部。 */
let currentLevel = 'WARN';

let logCounter = 0;
const logBuffer = [];
const subscribers = new Set();

function formatTime(date = new Date()) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${y}-${mo}-${d} ${h}:${m}:${s}.${ms}`;
}

/**
 * 统一脱敏层：日志导出与未来问题报告共用。
 * 只打码真正的秘密载体（URL 凭据、各类 token、Authorization、查询参数令牌、用户目录），
 * 保留包体积数字、条目数量、错误类型名、HTTP 状态码、宿主平台名、插件版本——这些是定位问题必需的。
 * @param {any} text
 * @returns {string}
 */
export function redact(text) {
  let out = text === null || text === undefined ? '' : String(text);
  // 1. URL userinfo：保留协议，替换 user:pass
  out = out.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+@/g, '$1[REDACTED]@');
  // 2. GitHub PAT（含 github_pat_ 细粒度令牌）
  out = out.replace(/\b(?:ghp|github_pat|gho|ghu|ghs)_[A-Za-z0-9_]+/g, '[REDACTED]');
  // 3. GitLab PAT
  out = out.replace(/\bglpat-[A-Za-z0-9_-]+/g, '[REDACTED]');
  // 4. 通用长 token：sk-* / xox[baprs]-* / AKIA<16位>
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]');
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]+/g, '[REDACTED]');
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]');
  // 5. Authorization / Bearer / Basic
  out = out.replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [REDACTED]');
  // 6. 查询参数令牌：保留 ? / & 分隔符与参数名
  out = out.replace(/([?&])(access_token|token|api_key|apikey|password|secret)=[^&\s]+/gi, '$1$2=[REDACTED]');
  // 7. Windows 用户目录：保留盘符，替换用户名
  out = out.replace(/\b([A-Za-z]:\\Users\\)[^\\\s]+/g, '$1[USER]');
  // 8. POSIX 用户目录
  out = out.replace(/\/(?:home|Users)\/[^/\s]+/g, '/[USER]');
  return out;
}

/**
 * 把任意 detail 规范成可安全 JSON 序列化的结构。
 * - Error 必须带 stack（可选 cause）
 * - Blob/File / ArrayBuffer/TypedArray 提取元信息，避免输出 {}
 * - 循环引用替换为 '[Circular]'
 * - 序列化失败替换为 { unserializable }
 */
function safeDetail(detail, seen = new WeakSet()) {
  if (detail === undefined || detail === null) return null;

  if (detail instanceof Error) {
    const out = { name: detail.name, message: detail.message, stack: detail.stack };
    if ('cause' in detail && detail.cause !== undefined) {
      out.cause = safeDetail(detail.cause, seen);
    }
    return out;
  }

  if (typeof Blob !== 'undefined' && detail instanceof Blob) {
    const out = { kind: 'blob', size: detail.size, type: detail.type };
    if (typeof File !== 'undefined' && detail instanceof File && detail.name) out.name = detail.name;
    return out;
  }

  if (typeof ArrayBuffer !== 'undefined'
    && (detail instanceof ArrayBuffer || ArrayBuffer.isView(detail))) {
    return { kind: 'bytes', byteLength: detail.byteLength };
  }

  const t = typeof detail;
  if (t === 'string' || t === 'number' || t === 'boolean') return detail;
  if (t === 'bigint') return String(detail) + 'n';
  if (t === 'symbol') return String(detail);
  if (t === 'function') return `[Function ${detail.name || 'anonymous'}]`;

  if (seen.has(detail)) return '[Circular]';
  seen.add(detail);
  try {
    if (Array.isArray(detail)) {
      return detail.map((item) => safeDetail(item, seen));
    }
    const out = {};
    for (const key of Object.keys(detail)) {
      out[key] = safeDetail(detail[key], seen);
    }
    return out;
  } catch (err) {
    return { unserializable: String(err) };
  } finally {
    seen.delete(detail);
  }
}

/** 导出文本顶部环境头；所有外部读取都做防御，便于在 Node 测试环境运行。 */
function environmentHeader() {
  let href = '';
  try { href = typeof location !== 'undefined' ? (location.href || '') : ''; } catch { href = ''; }
  const cleanUrl = href.split('?')[0].split('#')[0] || '(unknown)';

  let ua = '';
  try { ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''; } catch { ua = ''; }

  let host = '';
  try {
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
      host = document.documentElement.dataset.host || '';
    }
  } catch { host = ''; }
  if (!host && typeof globalThis !== 'undefined') {
    host = globalThis.__STPT_HOST__ || '';
  }

  let db = 'unavailable';
  try { db = (typeof indexedDB !== 'undefined' && indexedDB) ? 'available' : 'unavailable'; } catch { db = 'unavailable'; }

  return [
    '=== ST-pack-transfer log export ===',
    `AppVersion: ${APP_VERSION} (${APP_COMMIT})`,
    `ExportedAt: ${formatTime()}`,
    `Host: ${host || '(unknown)'}`,
    `PageUrl: ${cleanUrl}`,
    `UA: ${ua || '(unknown)'}`,
    `IndexedDB: ${db}`,
    `LogCount: ${logBuffer.length}`,
    '---',
  ].join('\n');
}

/** 构建导出文本；applyRedact=true 时走统一脱敏层。 */
function buildExportText(applyRedact) {
  const lines = [environmentHeader()];
  for (const e of logBuffer) {
    let line = `[${e.timestamp}] [${String(e.level).padEnd(7)}] #${e.id} ${e.message} (t=${e.timeMs})`;
    if (e.detail !== null && e.detail !== undefined) {
      const normalized = safeDetail(e.detail);
      let detailStr;
      try {
        detailStr = JSON.stringify(normalized, null, 2);
      } catch (err) {
        detailStr = JSON.stringify({ unserializable: String(err) });
      }
      if (detailStr === undefined) detailStr = 'null';
      line += `\n  Detail: ${detailStr.replace(/\n/g, '\n  ')}`;
    }
    lines.push(line);
  }
  const text = lines.join('\n');
  return applyRedact ? redact(text) : text;
}

/**
 * 核心日志单例
 */
function normalizeLevel(value) {
  const upper = String(value || '').toUpperCase();
  return Object.values(LOG_LEVELS).includes(upper) ? upper : 'WARN';
}

function shouldMirror(level) {
  return (LEVEL_ORDER[level] || 0) >= (LEVEL_ORDER[currentLevel] || LEVEL_ORDER.WARN);
}

export const logger = {
  /** 统一脱敏层（与具名导出 redact 同一实现）。 */
  redact,

  /** 设置控制台镜像阈值（DEBUG / INFO / WARN / ERROR）；不影响入账。 */
  setLevel(level) {
    currentLevel = normalizeLevel(level);
    return currentLevel;
  },

  getLevel() {
    return currentLevel;
  },

  /**
   * 记录一条日志
   * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'|'SUCCESS'} level
   * @param {string} message
   * @param {any} [detail]
   * @returns {object}
   */
  log(level, message, detail = null) {
    const normalizedLevel = normalizeLevel(level);
    const entry = {
      id: ++logCounter,
      level: normalizedLevel,
      message: String(message),
      detail: detail ?? null,
      timestamp: formatTime(),
      timeMs: Date.now(),
    };

    // **全部入账**：内存环形缓冲不做级别过滤，切到 debug 后能回看历史。
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) {
      logBuffer.shift();
    }

    // 控制台镜像只按阈值输出（默认 WARN；设置可切 DEBUG 看全部）。
    const prefix = `[ST-pack-transfer][${entry.timestamp}][${normalizedLevel}]`;
    if (shouldMirror(normalizedLevel)) {
      if (normalizedLevel === LOG_LEVELS.ERROR) {
        console.error(prefix, message, detail ?? '');
      } else if (normalizedLevel === LOG_LEVELS.WARN) {
        console.warn(prefix, message, detail ?? '');
      } else if (normalizedLevel === LOG_LEVELS.DEBUG) {
        console.debug(prefix, message, detail ?? '');
      } else {
        console.log(prefix, message, detail ?? '');
      }
    }

    // 广播给所有订阅者
    for (const sub of subscribers) {
      try {
        sub(entry);
      } catch (err) {
        console.error('Logger subscriber error:', err);
      }
    }

    return entry;
  },

  debug(message, detail) {
    return this.log(LOG_LEVELS.DEBUG, message, detail);
  },

  info(message, detail) {
    return this.log(LOG_LEVELS.INFO, message, detail);
  },

  warn(message, detail) {
    return this.log(LOG_LEVELS.WARN, message, detail);
  },

  error(message, detail) {
    return this.log(LOG_LEVELS.ERROR, message, detail);
  },

  success(message, detail) {
    return this.log(LOG_LEVELS.SUCCESS, message, detail);
  },

  /**
   * 订阅日志流
   * @param {(entry: object) => void} fn
   * @returns {() => void} 退订函数
   */
  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },

  /**
   * 获取所有日志列表（可选级别过滤）
   * @param {string} [filterLevel] 'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
   * @returns {Array<object>}
   */
  getEntries(filterLevel = 'ALL') {
    if (!filterLevel || filterLevel === 'ALL') {
      return [...logBuffer];
    }
    return logBuffer.filter((e) => e.level === filterLevel);
  },

  /**
   * 获取日志级别统计
   */
  getStats() {
    let debug = 0;
    let info = 0;
    let warn = 0;
    let error = 0;
    let success = 0;
    for (const e of logBuffer) {
      if (e.level === LOG_LEVELS.DEBUG) debug++;
      else if (e.level === LOG_LEVELS.INFO) info++;
      else if (e.level === LOG_LEVELS.WARN) warn++;
      else if (e.level === LOG_LEVELS.ERROR) error++;
      else if (e.level === LOG_LEVELS.SUCCESS) success++;
    }
    return {
      total: logBuffer.length,
      debug,
      info,
      warn,
      error,
      success,
    };
  },

  /**
   * 清空日志
   */
  clear() {
    logBuffer.length = 0;
    for (const sub of subscribers) {
      try {
        sub({ type: 'CLEAR' });
      } catch {}
    }
  },

  /**
   * 导出全部日志为可读文本（默认脱敏）。
   * 每条保留完整字段：日期时间戳、级别、message、id、timeMs、detail（安全序列化后）。
   * @returns {string}
   */
  exportText() {
    return buildExportText(true);
  },

  /** 同 exportText，显式命名为脱敏导出。 */
  exportRedacted() {
    return buildExportText(true);
  },

  /** 导出未脱敏原文，供开发者本地自查（默认导出仍走 exportText 脱敏）。 */
  exportRaw() {
    return buildExportText(false);
  },
};
