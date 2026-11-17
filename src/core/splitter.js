/**
 * 智能增量独立分包引擎 (Smart Incremental Split Bin-Packing Engine)
 * 专为规避云酒馆单包上传限制（如 100MB）设计。
 * 核心特性：
 * 1. 绝非 .z01 裸分片！每个分包均是 100% 独立的合法标准 Zip 文件，自带完整的 Central Directory。
 * 2. 保持相对目录完整性（目标云酒馆按 Part 1、Part 2、Part 3 依次导入即可原地增量融合）。
 * 3. 优先级流式装箱：核心小文件 -> 离线扩展代码 -> 大媒体资产，充分支持庞大扩展直接打包。
 * 4. 超大单文件安全隔离：单文件超阈值时独占成包并高亮告警，绝不损毁数据。
 */

import { zipIo } from './zip-io.js';
import * as zip from '../vendor/zip.js';
import { resolveFilename } from './naming.js';

/**
 * `splitArchiveEntries()` 的 **API 默认参数**——仅当调用方不传 `thresholdMB` 时生效。
 *
 * ⚠ 它**不是 UI 默认值**：`index.js` 恒显式传入由 `#split-input` 求出的 `splitMb`，
 * 而该输入框**默认为空 = 不分卷**。故从 UI 路径出发本常量**不可达**，
 * 不要把它读成「界面默认 100MB」（2026-09-25 取证澄清）。
 */
export const DEFAULT_THRESHOLD_MB = 100;
export const SAFETY_MARGIN = 0.95; // 预留 5% 缓冲杜绝因压缩表头/元数据导致超限

/** 智能分包数值输入的最小阈值 (MB)。低于此值一律视为不分卷。 */
export const MIN_SPLIT_MB = 1;

/**
 * 归一化「智能分包」数值输入的原始值（纯函数，DOM 无关以便单测）。
 *
 * 设计约束（用户裁决 5）：分包改为只填数值、**必须整数**、有**最小限制**。
 * 浮点向下归一（1.5 → 1）；空值 / 0 / 负数 / 非数字 / 小于最小值一律视为不分卷。
 * 归一后的结果保证是 ≥ `MIN_SPLIT_MB` 的整数，或 0（不分卷）——绝不把浮点传进分卷逻辑。
 *
 * @param {string|number|null|undefined} raw 输入控件的原始值
 * @returns {number} 整数 MB；0 表示不分卷
 */
export function normalizeSplitMb(raw) {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  const asInt = Math.floor(num);
  return asInt >= MIN_SPLIT_MB ? asInt : 0;
}

/**
 * 资产条目优先级评估
 * 优先级 1: 核心小文件与文本数据 (settings, secrets, characters, chats, worlds, presets)
 * 优先级 2: 扩展代码与资源 (extensions/*)
 * 优先级 3: 媒体大资产 (backgrounds/*, User Avatars/*, speech/*, assets/*)
 * @param {string} path 相对路径
 * @returns {number} 优先级权重 (数字越小越先打包)
 */
export function getEntryPriority(path) {
  const norm = path.replace(/\\/g, '/');
  if (
    norm === 'settings.json'
    || norm === 'secrets.json'
    || norm === 'manifest.json'
    || norm.startsWith('characters/')
    || norm.startsWith('chats/')
    || norm.startsWith('worlds/')
    || norm.startsWith('presets/')
    || norm.startsWith('data/default-user/characters/')
    || norm.startsWith('data/default-user/chats/')
    || norm.startsWith('data/default-user/worlds/')
    || norm.startsWith('data/default-user/settings.json')
  ) {
    return 1;
  }
  if (norm.startsWith('extensions/') || norm.startsWith('data/extensions/')) {
    return 2;
  }
  return 3;
}

/**
 * 将一组文件条目按单包阈值智能切分为多个独立的完整 Zip 压缩包
 * @param {Array<{ path: string, blob?: Blob, data?: Uint8Array, read?: () => Promise<Blob|Uint8Array>, size?: number }>} entries 待打包文件列表
 *   键名兼容三种形态：`{path, blob}`（index.js 现行）/ `{path, data}`（旧单测）/
 *   `{path, size, read}`（**懒描述符**——2026-11-18 新增：决策后才 read，配合调用方
 *   保持 reader 打开，免去「整包解压驻留内存」）
 * @param {object} options
 * @param {number} [options.thresholdMB=100] 单包最大体积 (MB)
 * @param {string} [options.filenameTemplate] 文件名模板
 * @param {string} [options.target='st'] 目标平台代码
 * @param {string} [options.handle='default-user'] 用户标识
 * @param {number} [options.compressionLevel=5] Zip 压缩级别 (0-9)
 * @param {(entriesDone: number, totalEntries: number, currentFile: string) => void} [options.onProgress] 进度通知
 *   （2026-11-18 修复 F-02：分母从「恒等于当前卷号」改为**真实条目总数**）
 * @returns {Promise<{
 *   splitId: string,
 *   totalParts: number,
 *   totalFiles: number,
 *   totalBytes: number,
 *   parts: Array<{
 *     partIndex: number,
 *     partName: string,
 *     blob: Blob,
 *     fileCount: number,
 *     sizeBytes: number,
 *     isOversized: boolean,
 *     files: string[],
 *   }>
 * }>}
 */
export async function splitArchiveEntries(entries, {
  thresholdMB = DEFAULT_THRESHOLD_MB,
  filenameTemplate,
  target = 'st',
  handle = 'default-user',
  compressionLevel = 5,
  onProgress,
} = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('splitArchiveEntries: 待切分条目列表不能为空');
  }
  /* 2026-11-18（F-01 配套加固）：直调 API 的非法阈值不再静默产出病态分卷
     （NaN 阈值 → 两个比较恒 false → 全部塞一卷；负/0 → 逐文件成卷）。
     UI 路径早有 normalizeSplitMb 双层防护，这里收口 API 本体。 */
  const thresholdNum = Number(thresholdMB);
  if (!Number.isFinite(thresholdNum) || thresholdNum <= 0) {
    throw new TypeError(`splitArchiveEntries: thresholdMB 必须是正数，收到 ${thresholdMB}`);
  }

  const thresholdBytes = Math.floor(thresholdNum * 1024 * 1024 * SAFETY_MARGIN);
  const splitId = `split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. 按优先级与文件名稳定排序
  const sortedEntries = [...entries].sort((a, b) => {
    const prioA = getEntryPriority(a.path);
    const prioB = getEntryPriority(b.path);
    if (prioA !== prioB) return prioA - prioB;
    return a.path.localeCompare(b.path);
  });

  const parts = [];
  let currentPartIndex = 1;
  let currentWriterTarget = new zip.BlobWriter('application/zip');
  let currentWriter = await zipIo.createWriter(currentWriterTarget, { level: compressionLevel });
  let currentPartFiles = [];
  let isCurrentPartOversized = false;
  /* ── F-01 同源判定（2026-11-18）──
     旧实现按**未压缩源字节**累计判卷（splitter.js:184/191/214），与产物真实体积不同源：
     可压缩内容被过度切卷（分卷数成倍多），小阈值+海量条目时单卷可被条目开销吃穿上限。
     新实现：`zipIo.createWriter().getWritten()` 返回**实测已写目的地字节**（与 blob.size
     锁步，zip-io 计数包装），预算制判定 = 实测已写 + 下一条目贡献估计 + 中央目录预留；
     getWritten 不可用（文件路径等形态返回 -1）时回退旧的未压缩估算（judgedBy 如实标注）。
     封卷后另有**事后守卫**：blob.size 超过阈值且卷内 >1 条目 ⇒ isOversized=true 如实标注。 */
  let judgedBy = 'written-bytes';
  /* 观测窗口内的最大压缩膨胀系数（delta/uncompressed）：0 = 尚无观测；有观测后取
     「观测最大值」，estRatio 夹取窗口 [0.05, 1.05]（下限防高可压内容低估、上限
     容纳不可压数据 deflate 的轻微膨胀）。**不能**用 Math.max(1, x) 起步：那会让
     系数永不下降，高可压内容的贡献估计恒为未压缩体积，预算制形同虚设
     （2026-11-18 首轮实现实测踩中）。 */
  let observedMaxRatio = 0;
  let currentPartEstimatedBytes = 0; // 回退路径（getWritten 不可用）的未压缩累计——旧判定语义
  /* 中央目录预留：**增量维护**（push 条目时累加）——首轮实现是「每条目全量重算
     ΣcdBytesOf(files)」，O(n²) 次 TextEncoder 编码，3003 条小条目实测拖到 30s+（R11 窗口
     超时假红）。单例编码器 + 累加器 ⇒ O(n)。 */
  const cdTextEncoder = new TextEncoder();
  const cdBytesOf = (name) => 46 + cdTextEncoder.encode(name).length + 9;
  let cdReserveBytes = 22;
  const cdReserve = () => cdReserveBytes;
  const MANIFEST_NAME = '_convert/split-manifest.json';

  const preSizeOf = (entry) => {
    const inline = entry.data ?? entry.blob;
    return Number(inline?.byteLength || inline?.length || inline?.size)
      || Number(entry.size)
      || 0;
  };

  const openNextPart = async () => {
    currentPartIndex++;
    currentWriterTarget = new zip.BlobWriter('application/zip');
    currentWriter = await zipIo.createWriter(currentWriterTarget, { level: compressionLevel });
    currentPartFiles = [];
    isCurrentPartOversized = false;
    currentPartEstimatedBytes = 0;
    cdReserveBytes = 22;
  };

  const closeCurrentPart = async () => {
    // 写入本分卷专属的 split-manifest.json
    const manifest = {
      splitId,
      partIndex: currentPartIndex,
      partLabel: `Part ${currentPartIndex}`,
      thresholdMB: thresholdNum,
      thresholdBytes,
      judgedBy,
      fileCount: currentPartFiles.length,
      isOversized: isCurrentPartOversized,
      files: currentPartFiles,
      generatedAt: new Date().toISOString(),
    };

    const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await currentWriter.add('_convert/split-manifest.json', manifestData);

    await currentWriter.close();
    const blob = await currentWriterTarget.getData();

    const partSemantic = currentPartIndex === 1 ? 'part1' : `part${currentPartIndex}`;
    const partFilename = resolveFilename(filenameTemplate, {
      target,
      handle,
      part: partSemantic,
      mode: 'split',
      date: new Date(),
    });

    const overLimit = blob.size > thresholdBytes && currentPartFiles.length > 1;
    parts.push({
      partIndex: currentPartIndex,
      partName: partFilename,
      blob,
      fileCount: currentPartFiles.length,
      sizeBytes: blob.size,
      isOversized: isCurrentPartOversized || overLimit,
      files: [...currentPartFiles],
    });
  };

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    // 2026-11-14 修 bug：条目键名兼容——index.js 两个调用方（单包 / 合并分卷）都传
    // `{path, blob}`（zipIo entry.read() 产物是 Blob），而本函数此前只读 `entry.data`
    // ⇒ 浏览器里单包 / 合并分卷**一进 splitArchiveEntries 就崩**
    // （「Cannot read properties of undefined (reading 'byteLength')」，E2E 实测复现）；
    // 单测用 `{path, data}` 所以一直是绿的——键名双读 + Blob 体积走 `.size`。
    // 2026-11-18：判卷**先于读取**（懒描述符路径），超限即封卷、不读下一条目的数据。
    if (onProgress) {
      onProgress(i + 1, sortedEntries.length, entry.path);
    }

    const preSize = preSizeOf(entry);
    const written = currentWriter.getWritten();
    /* 回退分支（written<0）当前不可达：splitter 恒自建 BlobWriter（必被包装）；
       保留是为防御 zip-io 形态变化（如未来传入文件路径形态的调用方）——勿删。 */
    if (written < 0 && judgedBy === 'written-bytes') judgedBy = 'uncompressed-estimate';
    /* 上限 1.05：不可压数据 deflate 有轻微膨胀（实测 ~1.003），夹在 1.0 会低估贡献。 */
    const estRatio = Math.min(1.05, Math.max(0.05, observedMaxRatio));
    // 下一条目贡献估计：同源 = 未压缩 × 观测膨胀系数 + LFH/extra/数据描述符余量；
    // 回退 = 未压缩原值（旧行为）
    const estContribution = written >= 0 ? preSize * estRatio + 120 : preSize;
    // 预算 = 实测已写 + 贡献估计 + 中央目录预留（含本条目与 manifest）；回退 = 未压缩累计
    const wouldExceed = written >= 0
      ? (written + estContribution + cdReserve() + cdBytesOf(MANIFEST_NAME)) > thresholdBytes
      : (currentPartEstimatedBytes + preSize) > thresholdBytes;

    if (wouldExceed && currentPartFiles.length > 0) {
      // 封包当前分卷（懒路径：此时还没读本条目数据）
      await closeCurrentPart();
      await openNextPart();
    }

    const data = typeof entry.read === 'function'
      ? await entry.read()
      : (entry.data ?? entry.blob);
    const entrySize = data?.byteLength || data?.length || data?.size || preSize || 0;

    // 写入当前文件
    const beforeWrite = currentWriter.getWritten();
    await currentWriter.add(entry.path, data);
    const afterWrite = currentWriter.getWritten();
    if (beforeWrite >= 0 && afterWrite > beforeWrite && entrySize > 0) {
      observedMaxRatio = Math.min(1.05, Math.max(observedMaxRatio, (afterWrite - beforeWrite) / entrySize));
    }
    currentPartFiles.push(entry.path);
    currentPartEstimatedBytes += entrySize;
    cdReserveBytes += cdBytesOf(entry.path);
    /* 单文件独占成卷判定（2026-11-18 F-01 同源化）：改为**实测写入后**判定——
       旧实现按未压缩大小预判（entrySize > threshold），高可压内容（如 10MB 重复文本
       压到 ~12KB）会被误隔离独占成卷；不可压缩真超限文件则在实测字节上同样命中。
       回退形态（written<0，无法实测）保留旧的未压缩预判。 */
    if (afterWrite >= 0) {
      if (afterWrite + cdReserve() > thresholdBytes) {
        isCurrentPartOversized = true;
      }
    } else if (entrySize > thresholdBytes) {
      isCurrentPartOversized = true;
    }

    // 若该超大文件单独占用当前包，且还有后续文件，则立即封口本卷
    if (isCurrentPartOversized && i < sortedEntries.length - 1) {
      await closeCurrentPart();
      await openNextPart();
    }
  }

  // 封包最后一个分卷
  if (currentPartFiles.length > 0) {
    await closeCurrentPart();
  }

  const totalFiles = parts.reduce((acc, p) => acc + p.fileCount, 0);
  const totalBytes = parts.reduce((acc, p) => acc + p.sizeBytes, 0);

  // 回填 totalParts
  parts.forEach((p) => {
    p.totalParts = parts.length;
  });

  return {
    splitId,
    totalParts: parts.length,
    totalFiles,
    totalBytes,
    parts,
  };
}
