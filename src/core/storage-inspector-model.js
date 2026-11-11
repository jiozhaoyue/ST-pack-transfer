/**
 * 存储审查面板的纯逻辑（无 DOM、无浏览器 API）。
 *
 * 呈现规则照 Luker `storage-inspector.js`：类目配色、8 点点阵条、尺寸格式、
 * 面包屑路径；数据来源由 provider 决定（浏览器 / 宿主），本模块只做归一与派生，
 * 因此可在 Node 里直接单测。
 */

/** 固定类目顺序 —— 配色按此顺序轮转，跨会话稳定，不随 entries 排列变化。 */
export const SI_CATEGORY_ORDER = Object.freeze([
  'chats', 'characters', 'worlds', 'images', 'attachments', 'presets',
  'extensions', 'vectors', 'backups', 'other',
  'localStorage', 'sessionStorage', 'indexeddb', 'cachestorage', 'quota',
]);

const PALETTE_SIZE = 12;

/**
 * 类目 → 图表同一套 12 色（`style.css` 的 `.vc-c1..c12`）。
 * 未知类目固定最后一色，不新增颜色字面量。
 */
export function categoryColorClass(key) {
  const idx = SI_CATEGORY_ORDER.indexOf(String(key ?? ''));
  const slot = idx >= 0 ? idx + 1 : PALETTE_SIZE;
  return `vc-c${((slot - 1) % PALETTE_SIZE) + 1}`;
}

/** provider 发来的图标名（Luker 用 FA 名）→ 本插件既有线性图标名。 */
const ICON_ALIAS = Object.freeze({
  'hard-drive': 'db',
  database: 'db',
  'chart-pie': 'unknown',
  key: 'lock',
  'key-skeleton': 'lock',
  table: 'folder',
  'file-lines': 'file',
  comment: 'chat',
  'clock-rotate-left': 'archive',
  'layer-group': 'archive',
  box: 'folder',
  clock: 'clock',
  file: 'file',
  user: 'user',
  book: 'book',
  image: 'image',
  paperclip: 'clip',
  sliders: 'sliders',
  'puzzle-piece': 'puzzle',
  brain: 'brain',
  shield: 'shield',
  folder: 'folder',
  // 类目名（宿主条目可能只给 key，不给 icon）
  chats: 'chat',
  characters: 'user',
  worlds: 'book',
  images: 'image',
  attachments: 'clip',
  presets: 'sliders',
  extensions: 'puzzle',
  vectors: 'brain',
  backups: 'archive',
  other: 'folder',
  localStorage: 'db',
  sessionStorage: 'clock',
  indexeddb: 'db',
  cachestorage: 'archive',
  quota: 'unknown',
});

export function iconKey(raw) {
  return ICON_ALIAS[String(raw ?? '')] || 'file';
}

/** 字节数 → 人类可读。非有限值返回占位横线，由调用方决定是否显示 `?`。 */
export function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.max(0, Math.round(n))} B`;
}

/** 单条大小：`null` 表示浏览器无法计算 ⇒ 显示 `?`，绝不显示假 0。 */
export function formatSizeOrUnknown(bytes) {
  if (bytes === null || bytes === undefined) return '?';
  const n = Number(bytes);
  return Number.isFinite(n) ? formatSize(n) : '?';
}

export function entriesTotal(entries) {
  let total = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const n = Number(e?.sizeBytes);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

export function maxEntrySize(entries) {
  let max = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const n = Number(e?.sizeBytes);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * 堆叠条分段：宽度 = 该条占本层已测总量比例（照 Luker，不按配额）。
 * 无法测大小的条目（`null`）不占色块，但仍在列表里显示 `?`。
 */
export function stackSegments(entries) {
  const total = entriesTotal(entries);
  if (total <= 0) return [];
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => Number.isFinite(Number(e?.sizeBytes)) && Number(e.sizeBytes) > 0)
    .map((e) => ({
      key: String(e.key ?? ''),
      label: e.label,
      labelKey: e.labelKey,
      colorClass: categoryColorClass(e.categoryKey || e.key),
      sizeBytes: Number(e.sizeBytes),
      pct: (Number(e.sizeBytes) / total) * 100,
    }));
}

/** 点阵填充数（照 Luker：按本层最大条目比例）。 */
export function dotFill(sizeBytes, maxSize, dots = 8) {
  const size = Number(sizeBytes);
  const max = Number(maxSize);
  if (!Number.isFinite(size) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(dots, Math.round((size / max) * dots)));
}

export function joinPath(path, key) {
  return [...(Array.isArray(path) ? path : []), String(key)];
}

function normalizeQuota(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const used = Number(raw.usedBytes);
  const quota = Number(raw.quotaBytes);
  const usedBytes = Number.isFinite(used) && used >= 0 ? used : null;
  const quotaBytes = Number.isFinite(quota) && quota > 0 ? quota : null;
  return {
    usedBytes,
    quotaBytes,
    over: !!raw.over || (quotaBytes !== null && usedBytes !== null && usedBytes > quotaBytes),
  };
}

/**
 * provider 响应归一（两侧 provider 共用同一契约，见交接文档 §四）。
 * 缺字段一律给安全默认值，UI 不需要再做判空分支。
 */
export function normalizeResponse(raw, source = 'browser') {
  const resp = raw && typeof raw === 'object' ? raw : {};
  const entries = Array.isArray(resp.entries)
    ? resp.entries.filter((e) => e && typeof e === 'object')
    : [];
  return {
    source,
    unavailable: !!resp.unavailable,
    path: Array.isArray(resp.path) ? resp.path.map(String) : [],
    breadcrumbs: Array.isArray(resp.breadcrumbs) ? resp.breadcrumbs : [],
    quota: normalizeQuota(resp.quota),
    entries,
    isLeaf: !!resp.isLeaf,
  };
}
