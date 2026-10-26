/**
 * 导出文件名命名引擎
 *
 * 纯逻辑，禁止 DOM 依赖。占位符语义**彼此独立**：`{date}` / `{time}` / `{datetime}`
 * 各自只代表自己，任何一个都不得顶替另一个（R6.5）。
 */

/** 四宿主英文全称。平台码与布局码都收，未知码原样返回。 */
export const HOST_DISPLAY_NAMES = Object.freeze({
  st: 'SillyTavern',
  luker: 'Luker',
  l: 'Luker',
  tt: 'TauriTavern',
  pt: 'PureTavern',
});

/** 目标平台选择器固定四项，顺序即展示顺序。 */
export const TARGET_PLATFORMS = Object.freeze([
  { code: 'st', name: 'SillyTavern' },
  { code: 'l', name: 'Luker' },
  { code: 'tt', name: 'TauriTavern' },
  { code: 'pt', name: 'PureTavern' },
]);

/** 规范占位符集合（AC-4 要求逐个有单测）。 */
export const PLACEHOLDERS = Object.freeze([
  'host',
  'target',
  'user',
  'part',
  'date',
  'time',
  'datetime',
  'mode',
  'category',
  'source',
  'count',
]);

export const DEFAULT_FILENAME_TEMPLATE = '{target}_{user}_{part}_{datetime}.zip';

export const FILENAME_PRESETS = Object.freeze({
  SPLIT: '{target}_{user}_{part}_{datetime}.zip',
  CORE: '{target}_core_{user}_{datetime}.zip',
  FULL: '{target}_full_{user}_{datetime}.zip',
});

/**
 * 平台码 / 布局码 → 英文全称。
 * @param {string} code
 * @returns {string}
 */
export function hostDisplayName(code) {
  const key = String(code || '').toLowerCase();
  return HOST_DISPLAY_NAMES[key] || (code ? String(code) : '');
}

/** 长度受限的非法字符清理（Windows / Unix 跨系统安全）。 */
export function sanitizeFilename(str) {
  return (str || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
}

function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'number') return new Date(d);
  return new Date();
}

/** YYYY-MM-DD */
export function formatDate(d = new Date()) {
  const dateObj = toDate(d);
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** HH-mm-ss（文件名安全，不用冒号） */
export function formatTime(d = new Date()) {
  const dateObj = toDate(d);
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  const ss = String(dateObj.getSeconds()).padStart(2, '0');
  return `${hh}-${mm}-${ss}`;
}

/** YYYY-MM-DD_HH-mm-ss（精确到秒） */
export function formatDateTime(d = new Date()) {
  const dateObj = toDate(d);
  return `${formatDate(dateObj)}_${formatTime(dateObj)}`;
}

// 历史别名 → 规范占位符。别名只为兼容旧模板，不改变规范占位符的独立语义。
const PLACEHOLDER_ALIASES = Object.freeze({
  username: 'user',
  handle: 'user',
  platform: 'target',
  layout: 'target',
  sourcename: 'source',
  name: 'source',
  filename: 'source',
  cat: 'category',
  content: 'category',
  partindex: 'part',
  volume: 'part',
  // 历史别名：`{timestamp}` 过去等同日期，保持旧行为，避免老模板输出突变。
  timestamp: 'date',
});

/**
 * 按模板与上下文生成合法安全的 zip 文件名。
 *
 * @param {string} template 用户输入或默认模板
 * @param {object} [context]
 * @param {string} [context.host] 当前宿主（平台码或布局码）
 * @param {string} [context.target] 目标平台（布局码）
 * @param {string} [context.handle] 用户标识
 * @param {string} [context.part] 分卷标识（part1 / part2 …）
 * @param {string} [context.mode] 打包模式
 * @param {string} [context.category] 类目标识
 * @param {string} [context.sourceName] 源数据包文件名
 * @param {number|string} [context.count] 条目数
 * @param {Date|string} [context.date] 日期；缺省取当前时间
 * @param {Date|string} [context.time] 时间；缺省取当前时间
 * @param {Date|string} [context.datetime] 日期时间；缺省由当前时间派生
 * @returns {string}
 */
export function resolveFilename(template, {
  host,
  target,
  handle,
  user,
  part,
  mode,
  category,
  sourceName,
  source,
  count,
  date,
  time,
  datetime,
} = {}) {
  const tpl = (typeof template === 'string' && template.trim())
    ? template.trim()
    : DEFAULT_FILENAME_TEMPLATE;

  const now = new Date();
  const dateText = date instanceof Date || typeof date === 'number'
    ? formatDate(date)
    : (typeof date === 'string' && date.trim() ? date.trim() : formatDate(now));
  const timeText = time instanceof Date || typeof time === 'number'
    ? formatTime(time)
    : (typeof time === 'string' && time.trim() ? time.trim() : formatTime(now));
  const datetimeText = datetime instanceof Date || typeof datetime === 'number'
    ? formatDateTime(datetime)
    : (typeof datetime === 'string' && datetime.trim() ? datetime.trim() : formatDateTime(now));

  const rawSource = sourceName || source || 'archive';
  const cleanSource = String(rawSource).replace(/\.zip$/i, '').trim() || 'archive';

  const values = {
    host: hostDisplayName(host || target) || 'unknown',
    target: hostDisplayName(target) || 'unknown',
    user: String(user || handle || '').trim() || 'default-user',
    part: String(part || '').trim() || 'part1',
    date: dateText,
    time: timeText,
    datetime: datetimeText,
    mode: String(mode || '').trim() || 'full',
    category: String(category || '').trim() || 'all',
    source: cleanSource,
    count: count === undefined || count === null ? '' : String(count),
  };

  // 单次扫描：避免某个占位符的**取值**里再出现占位符时被二次替换。
  let resolved = tpl.replace(/\{([a-zA-Z_]+)\}/g, (match, key) => {
    const lower = key.toLowerCase();
    const canonical = PLACEHOLDER_ALIASES[lower] || lower;
    return Object.prototype.hasOwnProperty.call(values, canonical) ? values[canonical] : match;
  });

  // 未知占位符原样保留（显式暴露拼写错误），随后统一清理非法字符。
  resolved = sanitizeFilename(resolved);

  // 空占位符可能留下连续下划线，收拢成一个，避免 `SillyTavern__part1_.zip` 这类噪声。
  resolved = resolved.replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  // 占位符落在扩展名前且为空时（`archive_.zip`），去掉这截孤立下划线。
  resolved = resolved.replace(/_+(\.zip)$/i, '$1');

  if (!resolved.toLowerCase().endsWith('.zip')) {
    resolved += '.zip';
  }

  return resolved;
}

/** 实时预览文件名（与 resolveFilename 同源）。 */
export function previewFilename(template, context = {}) {
  return resolveFilename(template, context);
}

/**
 * 给 blob 一个**可读的名字**，且**不改动原对象**。
 *
 * ⚠️ 不能写 `blob.name = name`：`File.prototype.name` 只有 getter，
 * 而 ES 模块恒为严格模式 ⇒ 直接抛 `TypeError`（2026-09-27 实测事故）。
 *
 * @param {Blob|File|null} blob
 * @param {string} [name]
 * @returns {Blob|File|null}
 */
export function namedBlob(blob, name) {
  if (!blob) return blob;
  const want = name || blob.name || 'datapack.zip';
  if (typeof blob.name === 'string' && blob.name === want) return blob;
  try {
    return new File([blob], want, { type: blob.type });
  } catch {
    return blob;
  }
}
