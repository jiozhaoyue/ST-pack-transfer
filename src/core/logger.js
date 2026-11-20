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
  // 6b. 查询参数令牌扩展白名单（P1 加固）：refresh_token/id_token/client_secret/sig/signature/accesskey。
  //     独立追加，规则 6 原正则与其 6 个参数名的行为完全不变（只做追加）。
  out = out.replace(/([?&])(refresh_token|id_token|client_secret|sig|signature|accesskey)=[^&\s]+/gi, '$1$2=[REDACTED]');
  // 7. Windows 用户目录：保留盘符，替换用户名
  //    VULN-01/02 加固：分隔符兼容单反斜杠 \ 与 JSON 序列化后的双反斜杠 \\（含 / 形态）；
  //    用户名字符集排除路径分隔、引号与换行，使含空格的用户名整体掩掉而非在空格处断开。
  out = out.replace(/\b([A-Za-z]:[\\/]{1,2}Users[\\/]{1,2})[^\\/"\n\r]+/g, '$1[USER]');
  // 8. POSIX 用户目录（VULN-02 加固：用户名段允许空格，止于 / 或行尾/引号）
  out = out.replace(/\/(?:home|Users)\/[^/"\n\r]+/g, '/[USER]');
  // 9. OAuth client_secret=<值>（保留参数名，替换值）
  out = out.replace(/\bclient_secret\s*=\s*[^\s&"']+/gi, 'client_secret=[REDACTED]');
  // 10. password / passwd / secret / pwd 赋值：
  //     - 空格冒号式 `password: Sup3rSecret`（含中文冒号 `password：xxx`）
  //     - JSON 形态 `"password": "Sup3rSecret"`（冒号后带引号与空白）
  //     - 等号式 `password=xxx`（非 URL 查询参数式，查询式已由规则 6 覆盖）
  out = out.replace(/\b(password|passwd|pwd|secret)"?\s*[:：]\s*"?[^\s"'},;]+"?/gi, '$1: [REDACTED]');
  out = out.replace(/\b(password|passwd|pwd)\s*=\s*[^\s&"']+/gi, '$1=[REDACTED]');
  // 10b. 单引号赋值密码（P1 加固）：规则 10 的 [^\s"'},;]+ 排除单引号，
  //      遇到 password: 'xxx' 时字符类在起始 ' 处即停止，整段不匹配而漏网。
  //      独立追加一条兼容单引号闭合的规则，不改变规则 10 原正则。
  out = out.replace(/\b(password|passwd|pwd|secret)\s*[:：]\s*'([^'\n]*)'/gi, '$1: [REDACTED]');
  out = out.replace(/\b(password|passwd|pwd)\s*=\s*'([^'\n]*)'/gi, '$1=[REDACTED]');
  // 11. POSIX /root/ 与 /var/ 下的用户路径：保留前缀，替换其后第一段用户目录名
  out = out.replace(/\/(root|var)\/(?:[^/\s]+)/g, '/$1/[USER]');
  // 12. 常见邮箱地址
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]');
  // 13. Google API Key（P1 加固）：AIza 前缀 + 35 位字母数字/下划线/连字符
  out = out.replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED]');
  // 14. HuggingFace token（P1 加固）：hf_ 前缀 + ≥30 位字母数字
  out = out.replace(/\bhf_[A-Za-z0-9]{30,}\b/g, '[REDACTED]');
  // 15. JWT 三段式（P1 加固）：eyJ 开头的 base64url 头 . 载荷 . 签名，三段各 ≥8 字符且限 base64url 字符集；
  //     要求 eyJ 前缀 + 三段结构，普通句子中的句点缩写（如 section 3.1415 ends.）不会误伤。
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  // 16. PEM 私钥（P0-1 加固）：与 sanitize-share containsCredential 的 PEM 检测同源。
  //     前缀覆盖 PKCS#8 加密私钥标准头 `-----BEGIN ENCRYPTED PRIVATE KEY-----` 及 RSA/EC/DSA/OPENSSH/PGP、PRIVATE KEY BLOCK。
  //     存在配对 END 行时用惰性量词把 BEGIN→END 整块（含 Base64 主体）一并掩蔽；
  //     无 END 的单行场景退化为只掩头行至行尾。非捕获组 + 惰性量词控制回溯。
  out = out.replace(
    /-----BEGIN (?:ENCRYPTED |RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\r\n]*|[^\n]*)/g,
    '[REDACTED]',
  );
  return out;
}

/**
 * detail 键名黑名单脱敏（P1 双保险）。
 * 递归遍历对象/数组，把命中秘密键名的值折叠为 '[REDACTED]'。
 * 与 redact() 的分工：redact() 只处理字符串（值形态匹配），本函数只处理对象键值（键名匹配），
 * 两者叠加覆盖「JSON.stringify 后原样进入报告」的 detail 对象。
 *
 * 匹配策略：先把 camelCase / snake_case 键名拆成小写词，再用**精确词集合**匹配，
 * 避免误伤 keyboard / monkey 这类仅含 `key` 子串的正常单词（`key` 必须独立成词才命中）。
 * 循环引用用 WeakSet 检测，嵌套超过 MAX_DEPTH 返回 '[DEEP]' 防爆栈。
 */
const SCRUB_CORE_WORDS = new Set([
  'token', 'secret', 'password', 'passwd', 'pwd',
  'credential', 'credentials', 'authorization', 'cookie', 'apikey',
]);

/** 明确非秘密的组合词：整体命中时不因含 key 子串而误伤。 */
const SCRUB_SAFE_KEYS = new Set(['keyboard', 'monkey', 'keycode', 'keystroke', 'keyname', 'keypath']);

const SCRUB_MAX_DEPTH = 8;

export function scrubDetailKeys(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > SCRUB_MAX_DEPTH) return '[DEEP]';

  const t = typeof value;
  // 原始值不在本函数职责内（redact() 负责字符串）；直接透传。
  if (t !== 'object') return value;

  // 循环引用检测：复用调用方传入的 seen，递归时同一对象再次出现即折叠。
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => scrubDetailKeys(item, seen, depth + 1));
    }
    const out = {};
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (isSecretKey(key)) {
        // 只对对象键值折叠：数组/子对象也折叠成标量占位符，避免秘密藏在嵌套结构里。
        out[key] = '[REDACTED]';
      } else {
        out[key] = scrubDetailKeys(child, seen, depth + 1);
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/** 键名是否为秘密载体：拆 camelCase/snake_case 后按精确核心词命中，避免模糊子串误伤。 */
function isSecretKey(key) {
  const normalized = String(key);
  if (SCRUB_SAFE_KEYS.has(normalized.toLowerCase())) return false;
  // 先在原始大小写上拆 camelCase 边界，再统一小写并按非字母数字切分（_ - 空格）。
  const words = normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((w) => SCRUB_CORE_WORDS.has(w))) return true;
  // 'key' 独立成词即命中（api_key / google_api_key / secretAccessKey 等）。
  // keyboard / monkey / keyName / keyPath 因拆不出独立 key 词或被白名单放行，天然不命中。
  return words.includes('key');
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
    // P1-1：Error 也可能被 cause 自引用（e.cause = e），递归前必须先做循环检测，
    // 否则 RangeError 爆栈后被外层 catch 降级为 [unserializable]，message/stack 全丢。
    if (seen.has(detail)) return '[Circular]';
    seen.add(detail);
    try {
      const out = { name: detail.name, message: detail.message, stack: detail.stack };
      if ('cause' in detail && detail.cause !== undefined) {
        out.cause = safeDetail(detail.cause, seen);
      }
      return out;
    } finally {
      seen.delete(detail);
    }
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
      // P1 双保险：JSON.stringify 之前按键名黑名单递归折叠秘密值，
      // 避免 detail 对象里的 token / password / api_key 等原样进入报告文本。
      const scrubbed = scrubDetailKeys(normalized);
      let detailStr;
      try {
        detailStr = JSON.stringify(scrubbed, null, 2);
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
