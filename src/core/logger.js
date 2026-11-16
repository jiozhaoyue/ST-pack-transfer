/**
 * 实时日志与审计系统 (Logger)
 * 支持结构化记录、级别过滤、环形内存缓冲、事件订阅与一键文本导出。
 */

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
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${h}:${m}:${s}.${ms}`;
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
   * 导出全部日志为可读文本
   * @returns {string}
   */
  exportText() {
    return logBuffer
      .map((e) => {
        let line = `[${e.timestamp}] [${e.level.padEnd(7)}] ${e.message}`;
        if (e.detail) {
          if (typeof e.detail === 'object') {
            try {
              line += `\n  Detail: ${JSON.stringify(e.detail, null, 2).replace(/\n/g, '\n  ')}`;
            } catch {
              line += `\n  Detail: [Unserializable Object]`;
            }
          } else {
            line += ` (${e.detail})`;
          }
        }
        return line;
      })
      .join('\n');
  },
};
