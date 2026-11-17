/**
 * 体积测量 / 预测模型（纯逻辑，无 DOM、无 IO）。
 *
 * 用户 2026-11-17 硬要求：所有体积测量与预测必须覆盖全部类目、分卷、扩展模式、
 * 引擎载体与未知项，并且**不得假精确**——读不到体积时输出 `?` / 区间 + `unknowns[]`。
 *
 * 本模块只做数学：调用方把计划条目（`entries`）与导出选项传进来，
 * 返回可解释的 `breakdown`、`predictedBytes`、`range`、`confidence` 与 `unknowns`。
 * UI 只负责展示，不再散落压缩比常量。
 */

export const BYTES_PER_MB = 1024 * 1024;

/** 全部体积类目（与图表一级分组一致，另含 unknown 兜底）。 */
export const SIZE_CATEGORIES = Object.freeze([
  'chats',
  'characters',
  'lorebooks',
  'images',
  'presets',
  'extensions',
  'vectors',
  'private',
  'backups',
  'cache',
  'native',
  'unknown',
]);

/** ZIP 结构开销（字节）。中央目录按卷重复，见 estimateSize()。 */
export const ZIP_OVERHEAD = Object.freeze({
  localHeader: 30,
  centralHeader: 46,
  eocd: 22,
  /** 流式写入时每个条目可能带数据描述符；宁高勿低。 */
  dataDescriptor: 12,
  /** 条目名平均字节数（`data/...` 路径通常 20–40 字节）。 */
  nameAvg: 28,
});

/**
 * 各内容类目的基础压缩比（zip level 5 的经验值，0–1）。
 * 图片 / 原生资产 / 备份快照本身已压缩，比例接近 1；聊天与文本配置压缩率高。
 */
const BASE_RATIOS = Object.freeze({
  chats: 0.38,
  characters: 0.45,
  lorebooks: 0.40,
  images: 0.95,
  presets: 0.50,
  extensions: 0.55,
  vectors: 0.78,
  private: 0.40,
  backups: 0.90,
  cache: 0.65,
  native: 0.94,
  unknown: 0.60,
});

/** zip 压缩级别（0/1/5/9）→ 相对压缩强度。level 0 = store。 */
const LEVEL_STRENGTH = Object.freeze({ 0: 0, 1: 0.75, 5: 1, 9: 1.12 });

/** 兼容旧 UI 的档位名。 */
const LEVEL_ALIASES = Object.freeze({ store: 0, fast: 1, balanced: 5, maximum: 9 });

export function normalizeCompressionLevel(raw) {
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(LEVEL_ALIASES, raw)) {
    return LEVEL_ALIASES[raw];
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(9, Math.max(0, Math.round(n)));
}

/** 某类目在指定压缩级别下的预计压缩比（0–1）。 */
export function compressionRatio(category, level) {
  const key = SIZE_CATEGORIES.includes(category) ? category : 'unknown';
  const l = normalizeCompressionLevel(level);
  const strength = l === 0 ? 0 : (l <= 1 ? LEVEL_STRENGTH[1] : (l <= 5 ? LEVEL_STRENGTH[5] : LEVEL_STRENGTH[9]));
  const base = BASE_RATIOS[key];
  return Math.max(0.02, Math.min(1, 1 - (1 - base) * strength));
}

export function mbToBytes(mb) {
  const n = Number(mb);
  return Number.isFinite(n) && n > 0 ? n * BYTES_PER_MB : 0;
}

export function bytesToMb(bytes) {
  const n = Number(bytes);
  return Number.isFinite(n) && n > 0 ? n / BYTES_PER_MB : 0;
}

function readEntryBytes(entry) {
  if (!entry) return null;
  if (entry.bytes !== null && entry.bytes !== undefined) {
    const n = Number(entry.bytes);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  if (entry.mb !== null && entry.mb !== undefined) {
    const n = Number(entry.mb);
    return Number.isFinite(n) ? Math.max(0, mbToBytes(n)) : null;
  }
  return null;
}

function readEstimateRange(entry) {
  const pair = Array.isArray(entry?.estimateBytes) ? entry.estimateBytes : [];
  const low = Number(pair[0]);
  const high = Number(pair[1]);
  return {
    low: Number.isFinite(low) ? Math.max(0, low) : null,
    high: Number.isFinite(high) ? Math.max(0, high) : null,
  };
}

/**
 * 估算一次导出。
 *
 * @param {{
 *   entries?: Array<{path?:string, bytes?:number|null, mb?:number|null, category?:string,
 *     dropped?:boolean, reason?:string, estimateBytes?:[number,number]}>,
 *   options?: {
 *     compression?: string|number,
 *     splitMb?: number,
 *     extensionMode?: 'full'|'manifest'|'dual',
 *     manifestEntryBytes?: number,
 *     extraEntries?: Array<object>,
 *     avgNameBytes?: number,
 *   },
 * }} input
 * @returns {{
 *   predictedBytes:number, uncompressedBytes:number, droppedBytes:number, entryCount:number,
 *   volumeCount:number, zipOverheadBytes:number,
 *   breakdown:Array<{category:string, bytes:number, compressedBytes:number, count:number,
 *     ratio:number, unknownCount:number, droppedBytes:number}>,
 *   confidence:'high'|'medium'|'low',
 *   unknowns:Array<{path:string, category:string, reason:string,
 *     estimateLowBytes:number|null, estimateHighBytes:number|null}>,
 *   range:{low:number, high:number},
 * }}
 */
export function estimateSize({ entries = [], options = {} } = {}) {
  const level = normalizeCompressionLevel(options.compression);
  const splitMb = Math.max(0, Number(options.splitMb) || 0);
  const limitBytes = splitMb * BYTES_PER_MB;
  const extensionMode = options.extensionMode === 'manifest' ? 'manifest' : 'full';
  const avgNameBytes = Math.max(1, Number(options.avgNameBytes) || ZIP_OVERHEAD.nameAvg);
  const groups = new Map();
  const unknowns = [];
  let uncompressedBytes = 0;
  let droppedBytes = 0;
  let entryCount = 0;

  const groupOf = (category) => {
    const key = SIZE_CATEGORIES.includes(category) ? category : 'unknown';
    if (!groups.has(key)) groups.set(key, { bytes: 0, count: 0, unknownCount: 0, droppedBytes: 0 });
    return groups.get(key);
  };

  const addEntry = (entry) => {
    if (!entry) return;
    const group = groupOf(entry.category);
    const bytes = readEntryBytes(entry);
    if (entry.dropped) {
      if (bytes !== null) {
        group.droppedBytes += bytes;
        droppedBytes += bytes;
      }
      return;
    }
    if (bytes === null) {
      const range = readEstimateRange(entry);
      group.unknownCount += 1;
      unknowns.push({
        path: String(entry.path || ''),
        category: SIZE_CATEGORIES.includes(entry.category) ? entry.category : 'unknown',
        reason: String(entry.reason || 'unknown-size'),
        estimateLowBytes: range.low,
        estimateHighBytes: range.high,
      });
      return;
    }
    group.bytes += bytes;
    group.count += 1;
    uncompressedBytes += bytes;
    entryCount += 1;
  };

  for (const entry of entries || []) addEntry(entry);
  for (const entry of options.extraEntries || []) addEntry(entry);

  /* 仅清单模式：扩展实体不随包导出，只留每个扩展的 manifest 摘要。
     dual（完整+清单）仍保留完整实体，不缩减。 */
  let manifestAdjustedBytes = 0;
  if (extensionMode === 'manifest') {
    const group = groups.get('extensions');
    if (group && group.bytes > 0) {
      const manifestBytes = Math.max(group.count, 1) * Math.max(512, Number(options.manifestEntryBytes) || 4096);
      manifestAdjustedBytes = group.bytes - manifestBytes;
      group.bytes = manifestBytes;
    }
  }

  let compressedBytes = 0;
  const breakdown = [];
  for (const category of SIZE_CATEGORIES) {
    const group = groups.get(category);
    if (!group || (group.bytes <= 0 && group.count <= 0 && group.unknownCount <= 0 && group.droppedBytes <= 0)) continue;
    const ratio = compressionRatio(category, level);
    const compressed = Math.round(group.bytes * ratio);
    compressedBytes += compressed;
    breakdown.push({
      category,
      bytes: group.bytes,
      compressedBytes: compressed,
      count: group.count,
      ratio,
      unknownCount: group.unknownCount,
      droppedBytes: group.droppedBytes,
    });
  }

  /* 分卷：按未压缩体积决定卷数；每卷都重复中央目录与 EOCD。 */
  const volumeCount = limitBytes > 0 && uncompressedBytes > limitBytes
    ? Math.max(1, Math.ceil(uncompressedBytes / limitBytes))
    : 1;
  const perEntryOverhead = ZIP_OVERHEAD.localHeader
    + ZIP_OVERHEAD.centralHeader
    + ZIP_OVERHEAD.dataDescriptor
    + avgNameBytes * 2;
  const additionalCentral = (volumeCount - 1) * entryCount * (ZIP_OVERHEAD.centralHeader + avgNameBytes);
  const zipOverheadBytes = entryCount > 0
    ? entryCount * perEntryOverhead + volumeCount * ZIP_OVERHEAD.eocd + additionalCentral
    : 0;

  const predictedBytes = entryCount > 0 ? Math.round(compressedBytes + zipOverheadBytes) : 0;

  let rangeLow = predictedBytes;
  let rangeHigh = predictedBytes;
  if (unknowns.length) {
    const lowExtra = unknowns.reduce((sum, item) => sum + (item.estimateLowBytes || 0), 0);
    const highExtra = unknowns.reduce((sum, item) => sum + (item.estimateHighBytes || 0), 0);
    rangeLow = Math.round(predictedBytes + lowExtra * 0.5);
    rangeHigh = Math.round(predictedBytes + highExtra * 0.6);
  } else {
    const margin = Math.round(predictedBytes * 0.08);
    rangeLow = Math.max(0, predictedBytes - margin);
    rangeHigh = predictedBytes + margin;
  }

  const unknownBytes = groups.get('unknown')?.bytes || 0;
  let confidence = 'high';
  if (unknowns.length || (uncompressedBytes > 0 && unknownBytes > uncompressedBytes * 0.3)) {
    confidence = 'low';
  } else if (manifestAdjustedBytes !== 0 || volumeCount > 1) {
    confidence = 'medium';
  }

  return {
    predictedBytes,
    uncompressedBytes,
    droppedBytes,
    entryCount,
    volumeCount,
    zipOverheadBytes,
    breakdown,
    confidence,
    unknowns,
    range: { low: rangeLow, high: rangeHigh },
    manifestAdjustedBytes,
  };
}
