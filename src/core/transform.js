import { NullZipWriter } from './null-writer.js';
import { Report } from './report.js';
import { detectFromReader, LAYOUTS } from './detect.js';
import { createPtNativeHubReader } from './pt-archive.js';
import { zipIo } from './zip-io.js';
import { planEngineConversion } from './engine-bridge.js';
import { loadSqlJs } from './sqlite-init.js';
import { logger } from './logger.js';
import { CATEGORIES, categoryOfHubPath, isBackupChatOrSnapshot } from './inspect.js';
import { isTavernBuiltinAsset } from './builtin-assets.js';
import {
  buildExtensionManifest,
  buildOfficialIndex,
  deriveExtensionEntry,
  extensionFolderName,
  extensionRelativePath,
  extractGitBranch,
  extractGitRemoteUrl,
} from './extension-manifest.js';

// 扩展路径 / Git 解析 helper 已迁至 extension-manifest.js（清单契约的唯一权威实现点）。
// 此处再导出，保持既有引用路径可用。
export {
  extractGitRemoteUrl,
  extractGitBranch,
  extensionFolderName,
  extensionRelativePath,
};

/**
 * 转换管线:源布局规范化为 hub(ST 摊平)→ 逐条目按目标适配写出。
 * 映射规则的证据与依据见任务 research/platform-facts.md 与 design.md §2/§4。
 *
 * 内存模型:逐条目读入 Buffer 再写出(峰值 ≈ 最大单文件),不整包驻留。
 * 顺序:保持源条目顺序(同输入同输出),合成条目(目标 manifest、extension-sources)
 * 统一追加在尾部、按名字排序。
 *
 * IO 注入:zip 的读写经 options.io 适配器(Node 用 src/io/node-io.js,浏览器插件用
 * src/io/zipjs-io.js),本模块不感知文件系统与运行时;两个适配器产物必须同构(AC9)。
 */

export const TARGETS = Object.freeze({
  ST: 'st',
  L: 'l',
  TT: 'tt',
  PT: 'pt',
});

import { EXTENSION_MODES, GIT_MODES } from './export-modes.js';

export { EXTENSION_MODES, GIT_MODES };

/**
 * 扩展 `.git` 目录处理策略（任务 09-22-extension-git-slim）。
 *
 * 实测依据（临时目录复现，见该任务 prd.md「本轮取证」表）：
 * - git 的 `is_git_directory()` 要求 `.git/objects` 与 `.git/refs` 是**真实目录**；
 *   只留 config/HEAD/refs/heads/<branch> 会被判为「不是仓库」（`rev-parse --is-inside-work-tree` rc=128）。
 * - 本项目管线丢弃空目录条目（`zip-io.js:101/111`），故 `minimal` 必须**合成占位文件**
 *   `.git/objects/.keep`，否则 objects 目录解压后不存在，策略整体失效。
 * - 酒馆「一键更新」链路 = `checkIsRepo` → `branch()` → `pull()`（**不调用 status**）；
 *   补齐 `index` 与占位文件后三条命令全部通过，且 `pull` 会自动从 origin 补齐缺失对象，
 *   首次更新后仓库自愈为完整状态。
 * - `keep` = 100% 现状；`strip` 会让接收方彻底失去在线更新能力。
 */
/** minimal 策略合成的占位文件内容（非 0 字节：个别解压实现会跳过零长度条目）。 */
export const GIT_KEEP_PLACEHOLDER = new TextEncoder().encode(
  '# 由 ST-pack-transfer 合成：占位文件，仅用于保证 .git/objects 目录在解压后存在\n',
);

/** 归一化 gitMode：未知取值一律回落 KEEP（防御式，不抛错）。 */
export function normalizeGitMode(value) {
  return Object.values(GIT_MODES).includes(value) ? value : GIT_MODES.KEEP;
}

/** `relPath`（相对扩展根）是否属于 `.git` 目录。注意 `.gitkeep` 不算。 */
export function isGitEntry(relPath) {
  return relPath === '.git' || relPath.startsWith('.git/');
}

/**
 * `minimal` 策略下需要保留的 `.git` 条目：
 * `config`（remote URL）/ `HEAD`（分支）/ `index`（使更新后 status 干净）/ `refs/heads/**`（分支指针）。
 * 其余（含 `objects/pack/*.pack` 全部对象存储）一律剔除。
 */
export function isGitMinimalKept(relPath) {
  return relPath === '.git/config'
    || relPath === '.git/HEAD'
    || relPath === '.git/index'
    || relPath.startsWith('.git/refs/heads/');
}

/** 因 gitMode 剔除条目时的上报文案（两档各自写明代价）。 */
export function gitDropReason(gitMode) {
  return gitMode === GIT_MODES.STRIP
    ? 'gitMode=strip：剔除扩展 Git 历史（接收方需重新 git clone 才能在线更新）'
    : 'gitMode=minimal：仅保留 Git 识别与更新所需最小集，剔除对象存储';
}

const TT_USER_PREFIX = 'data/default-user/';
const TT_THIRD_PARTY_PREFIX = 'data/extensions/third-party/';
const TT_SOURCES_PREFIX = 'data/_tauritavern/extension-sources/';
const TT_PRIVATE_PREFIXES = ['data/_cache/', 'data/_css/', 'data/_errors/'];
const TT_PRIVATE_FILES = ['data/content.log', 'data/content.log.1'];
const DERIVED_DIRS = ['thumbnails/', 'vectors/'];
const ENGINE_DUMP_ENTRIES = ['_engine_dump.bin', '_engine_meta.json'];
const THIRD_PARTY_PREFIX = 'extensions/third-party/';
/**
 * ST / Luker 的**全局**第三方扩展在包内的真实路径。
 * 宿主常量：`SillyTavern/src/constants.js` 与 `Luker/src/constants.js` 的
 * `globalExtensions: 'public/scripts/extensions/third-party'`。
 */
const PUBLIC_THIRD_PARTY_PREFIX = 'public/scripts/extensions/third-party/';
/** `public/scripts/extensions/` 下**非** `third-party` 的部分 = 宿主自带插件（regex / expressions / tts …）。 */
const PUBLIC_EXTENSIONS_PREFIX = 'public/scripts/extensions/';
const DATA_PREFIX = 'data/';
const USER_EXTENSIONS_PREFIX = 'extensions/';
/** TT 写进用户目录的私有/派生内容(hub 路径视角)。 */
const TT_APP_PRIVATE_USER = ['tauritavern-settings.json', 'user/lan-sync/'];
const TT_DERIVED_USER = ['content.log', 'user/cache/'];

/**
 * 投递侧背压的批次粒度：每累积这么多**已处理**源条目，就等一次 `writer.waitForRoom()`，
 * 把「已受理但未完成」的条目压回并发窗口量级。
 *
 * 依据（2026-09-26 实测，真源包 1602.7 MB / 8683 条 → 产出 619 MB / 7748 条）：
 *
 * | 投递方式 | 「在飞」峰值 | 内存峰值 | 耗时 |
 * | --- | --- | --- | --- |
 * | 全量投递（本常量引入前的行为） | **916 条**（窗口仅 8） | **6.2 GB**（默认 4.3 GB 堆直接 OOM） | **182 s** |
 * | 分批投递 | 窗口量级 | 数百 MB | **72.5 s** |
 *
 * ⇒ 这是**内存与吞吐的双赢**，不是拿速度换内存：全量投递时 GC 剧烈抖动，
 * 落盘会成片停滞（实测同一批量下 `.partial` 每次停 5–10 s）。
 */
const WRITE_BATCH = 16;

const FIXED_TIMESTAMP = '2020-01-01T00:00:00.000Z';

/**
 * 判断条目是否属于开发垃圾、构建冗余或系统临时文件
 * @param {string} hubPath hub 路径
 * @param {object} [options]
 * @param {boolean} [options.keepDevFiles] 是否保留开发与构建文件
 * @param {boolean} [options.keepAll] 是否保留所有内容
 * @returns {boolean}
 */
export function isJunkOrDevFile(hubPath, { keepDevFiles = false, keepAll = false } = {}) {
  if (keepAll) return false;

  const fileName = hubPath.slice(hubPath.lastIndexOf('/') + 1);

  // 1. 系统级垃圾文件（任何情况均默认剔除）
  if (
    fileName === '.DS_Store'
    || fileName === 'Thumbs.db'
    || fileName === 'desktop.ini'
    || hubPath.startsWith('__MACOSX/')
    || hubPath.includes('/__MACOSX/')
    || fileName.endsWith('.tmp')
  ) {
    return true;
  }

  // 2. 开发与构建冗余（当 !keepDevFiles 时剔除）
  if (!keepDevFiles) {
    // 依赖目录与测试目录
    if (
      hubPath.includes('/node_modules/')
      || hubPath.startsWith('node_modules/')
      || hubPath.includes('/test/')
      || hubPath.includes('/tests/')
      || hubPath.includes('/__tests__/')
      || hubPath.includes('/coverage/')
    ) {
      return true;
    }

    // 构建与工程配置文件
    if (
      fileName.startsWith('webpack.config.')
      || fileName.startsWith('vite.config.')
      || fileName.startsWith('rollup.config.')
      || fileName.startsWith('tsconfig.')
      || fileName === 'tsconfig.json'
      || fileName === '.babelrc'
      || fileName.startsWith('babel.config.')
    ) {
      return true;
    }

    // 源码映射与测试脚本
    if (
      fileName.endsWith('.map')
      || fileName.endsWith('.spec.js')
      || fileName.endsWith('.test.js')
      || fileName.endsWith('.spec.ts')
      || fileName.endsWith('.test.ts')
    ) {
      return true;
    }

    // Git 运行时冗余 (logs/、hooks/、refs/original/)
    if (
      hubPath.includes('/.git/logs/')
      || hubPath.includes('/.git/hooks/')
      || hubPath.includes('/.git/refs/original/')
    ) {
      return true;
    }
  }

  return false;
}

const INSTALL_MD = `# 手动导入说明(ST 目标)

SillyTavern 没有整包导入功能。把本压缩包解压后,将其中所有文件与目录
(除 _convert/ 外)覆盖到 SillyTavern 的用户数据目录:

- 默认单用户安装:  <SillyTavern>/data/default-user/
- 多用户:           <SillyTavern>/data/<你的用户句柄>/

覆盖前请先备份原目录。secrets.json 已包含在本包内(会覆盖现有密钥)。
`;

const L_SELECTION = Object.freeze({
  settings: true,
  secrets: true,
  characters: true,
  chats: true,
  lorebooks: true,
  presets: true,
  assets: true,
  extensions: true,
  globalExtensions: true,
  vectors: true,
});

/**
 * 同源校验：半成品能否安全地当作**本次**转换的前缀。
 *
 * ⚠️ **必须在 `writer.appendFrom()` 之前调用**。理由（互锁）：`appendFrom` 会把半成品里的
 * 条目名登记进 writer 的 `written` 名单，此后对同名条目的 `add` / `addLazy` 会**静默早返**
 * （见 `zip-io.js` 的 `add` 注释）⇒ 若源已变而仍搬运，产物会**静默保留陈旧条目**且不报错。
 *
 * 判据（全部成立才可搬运；只读**中央目录**，不解压、不读数据流）：
 *   ① 半成品的每条名字都能由某个源条目路由得到（**无孤儿**）—— 这条也顺带覆盖了「目标布局不同」：
 *      布局变了名字空间就变，半成品的名字会整批成为孤儿；
 *   ② 对应源条目的 `crc32` 与半成品记录的**全等**（源未变）。
 *
 * @returns {Promise<{ok: boolean, reason?: string, mapped?: Map<string, number>}>}
 */
async function verifyPartialSameSource({ io, sourcePath, partialEntries, target, layout }) {
  if (!Array.isArray(partialEntries) || partialEntries.length === 0) {
    return { ok: false, reason: '半成品清单为空' };
  }
  const want = new Map();
  for (const e of partialEntries) {
    if (e && typeof e.name === 'string') want.set(e.name, e.crc32 ?? null);
  }
  if (want.size === 0) return { ok: false, reason: '半成品清单不含可用条目名' };

  const scanner = await io.openReader(sourcePath);
  try {
    const seen = new Map();
    for await (const entry of scanner.entries()) {
      if (entry.isDirectory || entry.crc32 == null) continue;
      const routedForOut = routeSource(entry.fileName, layout);
      const outPath = targetEntryPath(routedForOut.hubPath, target, routedForOut.extScope);
      if (want.has(outPath)) seen.set(outPath, entry.crc32);
      entry.skip();
    }
    if (seen.size !== want.size) {
      return {
        ok: false,
        reason: `半成品有 ${want.size - seen.size} 条无法对应到当前源条目（源包已更换或目标布局不同）`,
      };
    }
    for (const [name, crc] of seen) {
      if (want.get(name) !== crc) {
        return { ok: false, reason: `条目 ${name} 的内容与源不一致（源包已变更）` };
      }
    }
    return { ok: true, mapped: seen };
  } finally {
    await scanner.close();
  }
}

/**
 * 把 zip 源包转换为目标平台包。
 * @param {string} sourcePath 源 zip 路径
 * @param {string} targetPath 产物 zip 路径
 * @param {object} options
 * @param {string} options.target st|l|tt|pt
 * @param {boolean} [options.keepAll] 保留派生缓存与 TT 私有目录
 * @param {boolean} [options.dryRun] 只产出报告不写文件(数据条目跳过读取)
 * @param {AbortSignal} [options.signal] 中止信号（每条目边界检查；暂停/中止由 TaskManager 触发）
 * @param {Map<string,number>|Object<string,number>} [options.resumeCrcMap] 断点续传**台账**：
 *   源条目名 → 已写入目标时的 crc32。⚠️ **它不再是跳过的充分条件**（见下方 `appendFrom`）：
 *   台账只作冗余校验（给了且 crc 不等 ⇒ 不跳过）。命中且目标包确有该条目的才跳过
 *   （计入 `report.totals.resumed`，命中名单在 `report.resumed`。**注**：旧注释写作 `resumedCount`，
 *   该字段从不存在 —— 2026-09-27 订正）
 * @param {Blob|File|string} [options.appendFrom] **同源半成品**（真增量续传）。
 *   提供时：先做同源校验（半成品 ⊆ 源、同名 crc 全等、目标布局一致），成立则把它的条目**原样搬运**
 *   进目标包（零重压缩），随后按「目标包已有即跳过」续写。校验不成立 ⇒ `onDiscardPartial()` +
 *   作废半成品 + **完整重做**（绝不产出残缺包）。
 * @param {function(): void} [options.onDiscardPartial] 半成品被判不同源 / 不可用时的回调
 * @param {boolean} [options.finalizeOnAbort] 中止时把 writer `close()`（产出**合法半成品**供跨会话续传）
 *   而非 `abort()`。**仅对 `AbortError` 生效**——真失败仍走 `abort()`（不得把失败伪装成暂停）。
 *   该模式下**跳过 `emitSynthesized`**：合成条目由续传那一轮在末尾统一产出。
 * @param {function(string, number): void} [options.onEntryDone] 每完成一个源条目回调
 *   (源条目名, crc32)——供 TaskManager 更新断点清单
 * @returns {Promise<Report>}
 */
export async function convert(sourcePath, targetPath, {
  target,
  keepAll = false,
  dryRun = false,
  io = zipIo,
  onProgress,
  selection,
  excludedPaths,
  includeCache = false,
  includeBackups = false,
  includeAppPrivate = false,
  compressionLevel = 5,
  extensionMode = EXTENSION_MODES.FULL,
  gitMode = GIT_MODES.KEEP,
  keepDevFiles = false,
  pruneBuiltinAssets = false,
  signal,
  resumeCrcMap,
  appendFrom = null,
  onDiscardPartial,
  finalizeOnAbort = false,
  onEntryDone,
  engine = '',
  engineHandle = '',
  sqliteInit = null,
} = {}) {
  if (!target || !Object.values(TARGETS).includes(target)) {
    throw new Error(`convert: target 必须是 ${Object.values(TARGETS).join('|')} 之一`);
  }
  if (!io || typeof io.openReader !== 'function' || typeof io.createWriter !== 'function') {
    throw new Error('convert: 必须提供有效的 io 适配器 (openReader/createWriter)');
  }

  // 断点续传清单归一为 Map（worker postMessage 序列化后可能是普通对象）
  const resumedCrc = resumeCrcMap instanceof Map
    ? resumeCrcMap
    : (resumeCrcMap && typeof resumeCrcMap === 'object' ? new Map(Object.entries(resumeCrcMap)) : null);
  // gitMode 归一：未知取值回落 KEEP，保证「默认行为零变化」这一约束不被任意输入击穿。
  const resolvedGitMode = normalizeGitMode(gitMode);
  const checkAbort = () => {
    if (signal?.aborted) {
      throw new DOMException('转换任务已被中止/暂停', 'AbortError');
    }
  };

  // 检测用一次遍历,yauzl/zip.js 的游标不能倒回,主循环须重新打开。
  const detector = await io.openReader(sourcePath);
  let detection;
  try {
    detection = await detectFromReader(detector);
  } finally {
    await detector.close();
  }
  const report = new Report(detection.layout, target);
  if (detection.layout === LAYOUTS.UNKNOWN) {
    throw new Error('无法识别源包布局(无 manifest.json / data/ 根 / 摊平用户目录标记)');
  }

  // PT 原生归档（`D-23` / R-11）：条目是 PT 内部模块模型
  // （`modules/<moduleId>/{records,blobs}/<collection>/<id>.{json,bin}`），**不是**用户目录路径
  // ⇒ 先按模块语义**重建**为 hub（ST 摊平）条目，再走同一条目标适配管线。
  // 重建后条目已是 hub 视角，故路由按 ST 处理（`routingLayout`）；报告仍如实记 `pt-native`。
  const isPtNative = detection.layout === LAYOUTS.PT_NATIVE;
  const routingLayout = isPtNative ? LAYOUTS.ST : detection.layout;

  let reader;
  if (isPtNative) {
    reader = await createPtNativeHubReader({
      io,
      sourcePath,
      onWarning: (message) => report.warn(message),
      readBlobs: !dryRun,
    });
  } else {
    reader = await io.openReader(sourcePath);
  }
  // writer 可被**重建**：半成品搬运失败时可能已写入部分字节，必须换一个干净的（见下方 catch）。
  let writer = dryRun ? new NullZipWriter() : await io.createWriter(targetPath, { level: compressionLevel });
  const totalEntries = reader.totalEntries ?? 0;
  let processedEntries = 0;

  // 存储引擎互转（用户 2026-11-12）：包内引擎承载物改由 engine-bridge 重建。
  // - 目标 L：按用户选择的目标引擎产出（省略 = 跟随源包）。
  // - 目标其它宿主：宿主自身没有数据库后端，一律先还原成文件形态再走目标布局路由
  //   （用户要求：Luker 的数据库形态也必须能和别宿主的文件形态互传）。
  // 规划阶段只读条目名 + meta，不解析大转储；重活在主循环尾部 `emit()` 里做。
  let enginePlan = null;
  const enginePlanTarget = target === TARGETS.L
    ? engine
    : (isPtNative ? '' : 'fs');
  if (!dryRun && enginePlanTarget) {
    enginePlan = await planEngineConversion({
      io,
      sourcePath,
      targetEngine: enginePlanTarget,
      handle: engineHandle,
      selection,
      sqliteInit: sqliteInit || loadSqlJs,
      mapPath: (path) => targetEntryPath(path, target),
      onWarn: (message) => report.warn(message),
    });
    if (enginePlan.applicable) {
      logger.info(`[convert] 存储引擎互转：${enginePlan.sourceEngine} → ${enginePlan.targetEngine}（handle=${enginePlan.handle || '(未定)'}）`);
    }
  }

  // 降级可观测（`L0-11` / `L1-MR-1`）：有台账、没半成品 ⇒ 本次完整重做。
  // 必须留一行日志 —— 否则用户点了「继续」却整包重跑且毫无解释，就成了「静默降级」（同样是缺陷）。
  if (resumedCrc && resumedCrc.size > 0 && !appendFrom) {
    logger.warn('[convert] 收到断点台账但未提供同源半成品：本次完整重做、不跳过任何条目（避免产物缺条目）');
  }

  // 真增量续传：同源校验 → 原样搬运半成品 → 主循环按「半成品里已有即跳过」续写。
  //
  // ⚠️ 跳过门只认 **appendedNames**（来自半成品），**不得**改用「writer 是否已含该名字」：
  //    后者把「本轮已写过」也算进来，而**两个不同的源条目可能映射到同一个产物路径**
  //    （PT 目标下用户级 `extensions/<x>/**` 与第三方 `extensions/third-party/<x>/**`
  //    就是同一条产物路径）⇒ 2026-09-28 实测由此误跳过了 2 个用户级扩展条目
  //    （该场景本应落到后文「与第三方同名时保留第三方副本」的分支，却被本门提前 continue 掉）。
  const appendedNames = new Set();
  // PT 原生源不支持断点续传：重建条目没有可与半成品对齐的源 crc32，半成品无法按源条目做同源校验
  // ⇒ 显式作废半成品并完整重做（安全降级，绝不产出残缺包；见 `L0-11` 降级须留日志）。
  if (isPtNative && appendFrom && !dryRun) {
    logger.warn('[convert] PT 原生归档源不支持断点续传：作废半成品并完整重做');
    onDiscardPartial?.();
  }
  if (appendFrom && !dryRun && !isPtNative) {
    const partialEntries = [];
    let readable = true;
    try {
      // 先只读半成品的中央目录拿清单。坏包/截断包在这一步就抛错，**此时尚未创建任何产物字节**。
      const probe = await io.openReader(appendFrom);
      try {
        for await (const entry of probe.entries()) {
          partialEntries.push({ name: entry.fileName, crc32: entry.crc32 ?? null });
        }
      } finally {
        await probe.close();
      }
    } catch (err) {
      readable = false;
      logger.warn(`[convert] 半成品不可读（${err?.message ?? err}）⇒ 作废并完整重做`);
      onDiscardPartial?.();
    }

    if (readable) {
      const verdict = await verifyPartialSameSource({
        io, sourcePath, partialEntries, target, layout: detection.layout,
      });
      if (!verdict.ok) {
        logger.warn(`[convert] 半成品与当前源包不同源（${verdict.reason}）⇒ 作废并完整重做`);
        onDiscardPartial?.();
      } else {
        try {
          for (const e of await writer.appendFrom(appendFrom)) appendedNames.add(e.name);
        } catch (err) {
          // 走到这里说明中央目录能读但搬运过程失败（例如数据段被截断）：
          // 目标 writer 可能已写入部分字节 ⇒ **换一个干净 writer**，否则残缺字节会混进产物。
          logger.warn(`[convert] 半成品搬运失败（${err?.message ?? err}）⇒ 作废并完整重做`);
          onDiscardPartial?.();
          try { await writer.abort(); } catch { /* 丢弃旧 writer 失败无碍：后面不再引用它 */ }
          writer = await io.createWriter(targetPath, { level: compressionLevel });
        }
      }
    }
  }

  const context = {
    manifest: null,
    extensionSources: new Map(), // folderName -> {scope, fileName, record}
    extensionManifests: new Map(), // folderName -> parsed manifest object
    extensionGitMeta: new Map(), // folderName -> { remoteUrl, branch, commit }
    sawEngineDump: false,
    thirdPartyFlattenedCount: 0, // ST/L 目标: 消除错误的 third-party 嵌套并拉平的条目数
    userExtensionsMigrated: 0, // PT 目标: 迁移为 third-party 布局的用户级扩展条目数
    globalShadowedByUser: new Set(), // 因同名用户级存在而跳过的全局扩展名
    builtinExts: new Set(), // 被剥离的宿主自带插件名
    globalExtFolders: new Set(), // 源包里的全局扩展目录名（含被覆盖的）
    userExtFolders: new Set(), // 源包里的用户级扩展目录名
    gitMinimalRoots: new Set(), // gitMode=minimal 下见过 .git/ 的扩展根(hub 路径),供尾部合成 .keep
  };

  // 数据条目一律惰性流直通(addLazy:泵到该条目才打开源流,配合 yazl 顺序泵
  // 满足 yauzl 单读流约束);dry-run 不打开任何数据流,报告按声明大小计数。
  const lazyOpen = (entryApi) => (cb) => {
    entryApi.openStream().then((stream) => cb(null, stream), (err) => cb(err));
  };

  // 预扫中央目录(不开文件流,开销可忽略):按**作用域**收集扩展目录名。
  //
  // 为什么对**所有**目标都扫（不再只在 PT 分支）：
  // 同名去重是四目标共同的前置条件 —— 旧实现只在 PT 目标预扫，
  // 于是 TT 目标的冲突判定恒失效，同名时两处各写一条、目标路径相同 ⇒ 产物里同路径重复。
  const { global: thirdPartyFolders, user: userExtFolders } = await scanExtensionScopes({
    io, sourcePath, layout: detection.layout, reader, isPtNative,
  });
  context.globalExtFolders = thirdPartyFolders;
  context.userExtFolders = userExtFolders;

  try {
    for await (const entry of reader.entries()) {
      processedEntries++;
      // 投递侧背压（见 WRITE_BATCH 的说明）：周期性等「已受理未完成」的条目回落，
      // 避免在紧凑循环里一次性投递全部条目把内存峰值推到 GB 级。
      // dryRun 时 writer 是 NullZipWriter，其 waitForRoom() 为空实现，此处无需分支。
      if (processedEntries % WRITE_BATCH === 0) {
        await writer.waitForRoom();
      }
      if (typeof onProgress === 'function') {
        onProgress(processedEntries, totalEntries, entry.fileName, entry.crc32 ?? null);
      }
      checkAbort();
      if (entry.isDirectory) {
        entry.skip();
        continue;
      }

      // 引擎互转：承载物由 bridge 重建；目标为 FS 时引擎管理的磁盘文件也一并改为「由行生成」，
      // 否则源包里的陈旧磁盘副本会覆盖数据库里的真值。
      if (enginePlan?.applicable && enginePlan.suppress(entry.fileName)) {
        entry.skip();
        report.dropped(entry.fileName, '存储引擎互转：由目标引擎形态重建');
        continue;
      }

      // 断点续传：跳过的**充分条件**是「**半成品里**真的有这条」，台账（crc 清单）只作冗余校验。
      //
      // 为什么不能只看台账（2026-09-27/28 实测的静默数据损失）：目标包每次都是**新建空包**
      // （见上方 createWriter），而旧实现按台账跳过 ⇒ 被跳过的条目**既不在旧产物（已丢）、
      // 也不在新产物（被跳过）** ⇒ 用户拿到残缺包却看到「转换成功」（实测 1500 条聊天 → 1437 条）。
      // 根子是台账记的是「已读到」而非「已写下」。现在以**半成品的字节事实**为准：
      // 半成品里没有这条就照常写出 ⇒ 台账在而字节不在时，行为退化为「完整重做」而不是「静默残缺」。
      if (entry.crc32 != null) {
        const routedSkip = routeSource(entry.fileName, routingLayout);
        const skipHub = routedSkip.hubPath;
        const skipOut = targetEntryPath(skipHub, target, routedSkip.extScope);
        if (appendedNames.has(skipOut)) {
          const doneCrc = resumedCrc?.get(entry.fileName) ?? resumedCrc?.get(skipHub);
          // 给了台账且 crc 不等 ⇒ 保守不跳过（宁重做，不冒险留下陈旧条目）
          if (doneCrc == null || doneCrc === entry.crc32) {
            entry.skip();
            report.resumed(skipOut);
            continue;
          }
        }
      }

      let routed = routeSource(entry.fileName, routingLayout);

      // 酒馆原生固定资产智能过滤 (剔除系统自带默认背景、默认主题等重复素材)
      if (pruneBuiltinAssets && isTavernBuiltinAsset(routed.hubPath)) {
        entry.skip();
        report.dropped(routed.hubPath, '酒馆原生固定资产(默认背景/主题/预设)，已智能剔除');
        continue;
      }

      // 垃圾文件与构建冗余过滤（清理开发垃圾、构建脚本与临时缓存）
      if (isJunkOrDevFile(routed.hubPath, { keepDevFiles, keepAll })) {
        entry.skip();
        report.dropped(routed.hubPath, '开发/构建冗余或系统临时文件(安全清洗)');
        continue;
      }

      // 按单文件细粒度排除过滤 (可穿透树形勾选)
      if (excludedPaths && (excludedPaths.has(entry.fileName) || excludedPaths.has(routed.hubPath))) {
        entry.skip();
        report.filtered(routed.hubPath, 'item-excluded');
        continue;
      }

      // 按历史备份快照与备份聊天记录过滤 (默认不包含)
      if (isBackupChatOrSnapshot(routed.hubPath)) {
        if (!includeBackups && !keepAll) {
          entry.skip();
          report.dropped(routed.hubPath, '备份聊天记录与快照(默认不包含)');
          continue;
        }
      }

      // 按用户类目选择过滤（脱敏排除）
      if (selection && typeof selection === 'object') {
        // 全局扩展的 hub 路径已归一为 `extensions/<n>`（图表归并与产物平铺都依赖它），
        // 因此类目不能只看路径 —— 必须按 `extScope` 还原，否则 `selection.globalExtensions`
        // 会对全局扩展失效（用户关了「全局扩展」却仍被打包）。
        const cat = (routed.kind === 'extension-pkg' && routed.extScope === 'global')
          ? CATEGORIES.GLOBAL_EXTENSIONS
          : categoryOfHubPath(routed.hubPath);
        if (cat && (selection[cat] === false || (cat === 'extensions' && selection.extensions === false))) {
          entry.skip();
          report.filtered(routed.hubPath, cat);
          continue;
        }
      }

      // 元数据条目:体积小、内容被解析使用,走缓冲
      if (routed.kind === 'manifest') {
        context.manifest = parseJsonSafe(await entry.read());
        if (target !== TARGETS.L) {
          report.dropped(routed.hubPath, '源 manifest 为元数据,由转换器按目标重新合成');
        }
        continue;
      }
      if (routed.kind === 'extension-source') {
        const record = parseJsonSafe(await entry.read());
        context.extensionSources.set(routed.source.name, { ...routed.source, record });
        continue;
      }

      if (routed.kind === 'engine-dump') {
        context.sawEngineDump = true;
        if (target === TARGETS.L) {
          if (!dryRun) writer.addLazy(entry.fileName, lazyOpen(entry), entry.uncompressedSize);
          report.copied(routed.hubPath, entry.uncompressedSize);
        } else {
          entry.skip();
          report.dropped(routed.hubPath, 'L 引擎旁路数据,仅 L 目标有意义');
          report.warn(
            '源包含 _engine_dump.bin/_engine_meta.json(数据库引擎状态),已按设计丢弃;'
            + '跨存储模式迁移请用 L 自带的 cross-mode restore 流程。',
          );
        }
        continue;
      }
      if (routed.kind === 'tt-private') {
        if (keepAll || includeCache) {
          const outPath = (target === TARGETS.TT || target === TARGETS.PT)
            ? entry.fileName
            : routed.hubPath;
          if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
          report.copied(routed.hubPath, entry.uncompressedSize);
        } else {
          entry.skip();
          report.dropped(routed.hubPath, 'TT 私有/缓存,目标平台不消费');
        }
        continue;
      }
      if (routed.kind === 'tt-app-private') {
        // TT 应用级私有设置:TT 目标原位保留,其余目标丢弃
        if (target === TARGETS.TT || keepAll || includeAppPrivate) {
          const outPath = target === TARGETS.TT ? entry.fileName : routed.hubPath;
          if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
          report.copied(routed.hubPath, entry.uncompressedSize);
        } else {
          entry.skip();
          report.dropped(routed.hubPath, 'TT 应用私有设置,仅 TT 目标有意义');
        }
        continue;
      }
      if (routed.kind === 'user' && DERIVED_DIRS.some((dir) => routed.hubPath.startsWith(dir))) {
        routed = { kind: 'derived', hubPath: routed.hubPath };
      }
      if (routed.kind === 'derived') {
        if (keepAll || includeCache) {
          if (!dryRun) writer.addLazy(targetEntryPath(routed.hubPath, target, routed.extScope), lazyOpen(entry), entry.uncompressedSize);
          report.copied(routed.hubPath, entry.uncompressedSize);
        } else {
          entry.skip();
          report.dropped(routed.hubPath, '派生缓存,导入后会自动重新生成');
        }
        continue;
      }
      if (routed.kind === 'drop') {
        entry.skip();
        report.dropped(routed.hubPath, routed.reason);
        continue;
      }

      // 宿主自带插件：四宿主各有一套（regex / expressions / tts …），
      // 跨宿主搬运只会写出目标平台不消费的垃圾路径 ⇒ 一律剥离并在报告里点名。
      if (routed.kind === 'builtin-ext') {
        entry.skip();
        if (routed.extName) context.builtinExts.add(routed.extName);
        report.dropped(routed.hubPath, '宿主自带插件，目标宿主自有一套（不参与扩展打包）');
        continue;
      }

      // L 目标:image-metadata.json 不在 L 任何备份类目里(users.js getUserBackupTargets),
      // L 恢复时必然跳过;ST/TT/PT 目标保留(ST 背景分组索引用它)。
      if (target === TARGETS.L && routed.hubPath === 'image-metadata.json') {
        entry.skip();
        report.dropped(routed.hubPath, 'L 备份类目不含 image-metadata.json,恢复时也不会落地');
        continue;
      }

      // user / extension-pkg:流式直通，或轻量清单解析
      if (routed.kind === 'extension-pkg') {
        const restUnderExt = routed.hubPath.slice('extensions/'.length);
        const extFolder = extensionFolderName(routed.hubPath);
        const relPath = extensionRelativePath(routed.hubPath);

        // Git 目录策略闸（任务 09-22-extension-git-slim）：
        // gitKeep 决定这条 .git 条目最终是否写出；不该写出的在下方各处理器内跳过，并连同字节数上报。
        // keep 下恒为 true → 现有行为零变化。
        const gitEntry = isGitEntry(relPath);
        const gitKeep = gitEntry
          && (resolvedGitMode === GIT_MODES.KEEP
            || (resolvedGitMode === GIT_MODES.MINIMAL && isGitMinimalKept(relPath)));

        // 散文件过滤 (如 extensions/ 根目录下的 .gitkeep): TT/PT 目标只消费 目录名/文件 形态
        if ((target === TARGETS.TT || target === TARGETS.PT) && !restUnderExt.includes('/')) {
          entry.skip();
          report.dropped(routed.hubPath, 'extensions 根下的散文件,目标平台不消费');
          continue;
        }

        // 同名去重（四目标统一）：宿主加载语义是「用户级优先」——
        // ST / Luker 源码注释原文 `In case of a conflict, the extension will be loaded from the user folder`，
        // TT 亦为 local 优先。故用户级存在时，全局副本**不写**，避免同一扩展在产物里出现两份
        // （旧实现方向相反：丢弃用户级、保留第三方，且只在 PT 目标判定）。
        const extScope = routed.extScope || 'user';
        if (extScope === 'global' && userExtFolders.has(extFolder)) {
          context.globalShadowedByUser.add(extFolder);
          entry.skip();
          report.dropped(routed.hubPath, `同名扩展 "${extFolder}" 已有用户级副本，全局副本跳过（宿主同样优先用户级）`);
          continue;
        }

        // ST/L 目标: 遇到错误的 third-party 嵌套布局，自动拉平为标准平铺布局
        if ((target === TARGETS.ST || target === TARGETS.L) && extScope === 'global') {
          context.thirdPartyFlattenedCount += 1;
        }

        // PT 目标: 用户级扩展迁移为 third-party 布局（PT 没有用户级扩展目录）
        if (target === TARGETS.PT && extScope === 'user') {
          context.userExtensionsMigrated += 1;
        }

        // 1. 读取扩展清单 manifest.json
        if (relPath === 'manifest.json' || relPath.endsWith('/manifest.json')) {
          const data = await entry.read();
          noteExtensionPackage(context, routed.hubPath, data);
          if (extensionMode !== EXTENSION_MODES.MANIFEST) {
            const outPath = targetEntryPath(routed.hubPath, target, routed.extScope);
            await writer.add(outPath, data);
            report.copied(routed.hubPath, entry.uncompressedSize);
          } else {
            report.dropped(routed.hubPath, '轻量清单模式：已记录扩展清单，实体文件不打包');
          }
          continue;
        }

        // 2. 解析 Git 仓库配置与指针 (.git/config, .git/HEAD 等)
        if (relPath === '.git/config' || relPath.endsWith('/.git/config')) {
          try {
            const text = JSON_DECODER.decode(await entry.read());
            const url = extractGitRemoteUrl(text);
            if (url && extFolder) {
              const current = context.extensionGitMeta.get(extFolder) || {};
              current.remoteUrl = url;
              context.extensionGitMeta.set(extFolder, current);
            }
          } catch { /* 忽略读取错误 */ }
          // 解析在三档模式下都发生（extensionGitMeta 必须照常产出），只有写出与否受策略影响。
          if (extensionMode === EXTENSION_MODES.MANIFEST) {
            report.dropped(routed.hubPath, '轻量清单模式：已解析 Git Remote URL，实体文件不打包');
          } else if (!gitKeep) {
            report.dropped(routed.hubPath, gitDropReason(resolvedGitMode), entry.uncompressedSize);
          } else {
            // 只有真正写出的扩展才登记合成目标——被同名冲突/散文件规则跳过的扩展不得产生孤儿 .keep。
            if (resolvedGitMode === GIT_MODES.MINIMAL) context.gitMinimalRoots.add(`extensions/${extFolder}`);
            const outPath = targetEntryPath(routed.hubPath, target, routed.extScope);
            if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
            report.copied(routed.hubPath, entry.uncompressedSize);
          }
          continue;
        }

        if (relPath === '.git/HEAD' || relPath.endsWith('/.git/HEAD')) {
          try {
            const text = JSON_DECODER.decode(await entry.read());
            const branch = extractGitBranch(text);
            if (branch && extFolder) {
              const current = context.extensionGitMeta.get(extFolder) || {};
              current.branch = branch;
              context.extensionGitMeta.set(extFolder, current);
            }
          } catch { /* 忽略读取错误 */ }
          if (extensionMode === EXTENSION_MODES.MANIFEST) {
            report.dropped(routed.hubPath, '轻量清单模式：已解析 Git 分支，实体文件不打包');
          } else if (!gitKeep) {
            report.dropped(routed.hubPath, gitDropReason(resolvedGitMode), entry.uncompressedSize);
          } else {
            // 只有真正写出的扩展才登记合成目标——被同名冲突/散文件规则跳过的扩展不得产生孤儿 .keep。
            if (resolvedGitMode === GIT_MODES.MINIMAL) context.gitMinimalRoots.add(`extensions/${extFolder}`);
            const outPath = targetEntryPath(routed.hubPath, target, routed.extScope);
            if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
            report.copied(routed.hubPath, entry.uncompressedSize);
          }
          continue;
        }

        if (relPath.includes('/.git/refs/heads/') || relPath.startsWith('.git/refs/heads/')) {
          try {
            const commit = JSON_DECODER.decode(await entry.read()).trim();
            if (commit && extFolder && /^[0-9a-f]{40}$/i.test(commit)) {
              const current = context.extensionGitMeta.get(extFolder) || {};
              current.commit = commit;
              context.extensionGitMeta.set(extFolder, current);
            }
          } catch { /* 忽略读取错误 */ }
          if (extensionMode === EXTENSION_MODES.MANIFEST) {
            report.dropped(routed.hubPath, '轻量清单模式：已解析 Git Commit，实体文件不打包');
          } else if (!gitKeep) {
            report.dropped(routed.hubPath, gitDropReason(resolvedGitMode), entry.uncompressedSize);
          } else {
            // 只有真正写出的扩展才登记合成目标——被同名冲突/散文件规则跳过的扩展不得产生孤儿 .keep。
            if (resolvedGitMode === GIT_MODES.MINIMAL) context.gitMinimalRoots.add(`extensions/${extFolder}`);
            const outPath = targetEntryPath(routed.hubPath, target, routed.extScope);
            if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
            report.copied(routed.hubPath, entry.uncompressedSize);
          }
          continue;
        }

        // 2.5 Git 目录策略兜底闸：未经上述元数据处理器接管的 .git 条目。
        // strip 下全部命中；minimal 下命中的是白名单之外者（objects/pack/*.pack 等对象存储）。
        // 轻量清单模式下本闸不生效——该模式由下方第 3 步统一按「清单模式」理由丢弃，文案不得被 gitMode 抢占。
        if (gitEntry && !gitKeep && extensionMode !== EXTENSION_MODES.MANIFEST) {
          entry.skip();
          report.dropped(routed.hubPath, gitDropReason(resolvedGitMode), entry.uncompressedSize);
          continue;
        }

        // 3. 轻量清单模式下，跳过其他代码文件
        if (extensionMode === EXTENSION_MODES.MANIFEST) {
          entry.skip();
          report.dropped(routed.hubPath, '轻量清单模式：扩展代码由目标酒馆按清单下载');
          continue;
        }

        // 4. 完整模式下直通写出
        const outPath = targetEntryPath(routed.hubPath, target, routed.extScope);
        if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
        report.copied(routed.hubPath, entry.uncompressedSize);
        continue;
      }

      const outPath = targetEntryPath(routed.hubPath, target, routed.extScope);
      if (!dryRun) writer.addLazy(outPath, lazyOpen(entry), entry.uncompressedSize);
      report.copied(routed.hubPath, entry.uncompressedSize);
      if (typeof onEntryDone === 'function' && entry.crc32 != null) {
        onEntryDone(entry.fileName, entry.crc32);
      }
    }

    if (enginePlan?.applicable) {
      const summary = await enginePlan.emit(writer, { onWarn: (message) => report.warn(message) });
      report.setEngine(summary);
    }

    await emitSynthesized(writer, report, context, target, selection, { extensionMode, gitMode: resolvedGitMode, dryRun });
    // Store 直存统计汇入报告（zip-io 按扩展名分流 level 0 的条目）
    if (!dryRun && typeof writer.getStoreStats === 'function') {
      const storeStats = writer.getStoreStats();
      report.setStoreBypass(storeStats.count, storeStats.bytes);
    }
    await writer.close();
    return report;
  } catch (error) {
    // 中止（暂停）与真失败的收尾方式**必须不同**：
    //  - 中止 + `finalizeOnAbort` ⇒ `close()` 把已写部分收成一个**合法 zip**（真增量续传的半成品）；
    //    此处天然不会有合成条目：`checkAbort()` 在循环内抛出、直接跳到本 catch，
    //    尾部的 `emitSynthesized` 根本没跑 —— 这正是要的（合成条目由续传那一轮末尾统一产出，
    //    否则半成品里会留下一份「按半量数据合成」的 manifest，续传后又不重合成 ⇒ 元数据与内容不符）。
    //  - 真失败 ⇒ 仍 `abort()`，**不得**收尾：否则「失败」会被伪装成一个「看着完整」的暂停产物。
    const isAbort = error?.name === 'AbortError';
    if (isAbort && finalizeOnAbort && !dryRun) {
      try {
        await writer.close();
      } catch (closeErr) {
        // 收尾失败不得改变中止语义：只是没有半成品，续传会完整重做（正确的降级）
        logger.warn('[convert] 中止时的半成品收尾失败（续传将重做整包）:', closeErr);
      }
    } else {
      await writer.abort();
    }
    throw error;
  } finally {
    await reader.close();
  }
}

/** 源条目路由:决定 hub 路径与处理类别。hub 路径 = ST 摊平用户目录视角。 */
export function routeSource(sourcePath, layout) {
  if (layout === LAYOUTS.TT) {
    if (sourcePath.startsWith(TT_USER_PREFIX)) {
      const hubPath = sourcePath.slice(TT_USER_PREFIX.length);
      // TT 的用户级扩展（local）在 `data/default-user/extensions/<n>/`，与 ST/Luker 的用户级同义。
      if (hubPath.startsWith(USER_EXTENSIONS_PREFIX)) {
        return { kind: 'extension-pkg', hubPath, extScope: 'user' };
      }
      if (sourcePath.startsWith('data/default-user/_compat/')) {
        return { kind: 'compat', hubPath: sourcePath.slice('data/default-user/'.length) };
      }
      if (TT_APP_PRIVATE_USER.some((p) => hubPath === p || hubPath.startsWith(p))) {
        return { kind: 'tt-app-private', hubPath };
      }
      if (TT_DERIVED_USER.some((p) => hubPath === p || hubPath.startsWith(p))) {
        return { kind: 'tt-private', hubPath };
      }
      return { kind: 'user', hubPath };
    }
    if (sourcePath.startsWith(TT_THIRD_PARTY_PREFIX)) {
      const rest = sourcePath.slice(TT_THIRD_PARTY_PREFIX.length);
      return { kind: 'extension-pkg', hubPath: `extensions/${rest}`, extScope: 'global' };
    }
    if (sourcePath.startsWith(TT_SOURCES_PREFIX)) {
      const rest = sourcePath.slice(TT_SOURCES_PREFIX.length);
      const separator = rest.indexOf('/');
      const scope = separator > 0 ? rest.slice(0, separator) : 'global';
      const fileName = separator > 0 ? rest.slice(separator + 1) : rest;
      if (fileName.endsWith('.json')) {
        return {
          kind: 'extension-source',
          hubPath: `_tauritavern/extension-sources/${scope}/${fileName}`,
          source: { scope, name: fileName.slice(0, -'.json'.length), fileName },
        };
      }
      return { kind: 'drop', hubPath: `_tauritavern/extension-sources/${rest}`, reason: 'TT 来源记录:非 JSON 条目' };
    }
    if (sourcePath.startsWith('data/_tauritavern/')) {
      // extension-sources 已在上面返回;其余是 TT 应用私有数据(window-state/mcp/skills/extension-store)
      return { kind: 'tt-app-private', hubPath: sourcePath.slice(DATA_PREFIX.length) };
    }
    if (TT_PRIVATE_PREFIXES.some((prefix) => sourcePath.startsWith(prefix))
      || TT_PRIVATE_FILES.includes(sourcePath)) {
      return { kind: 'tt-private', hubPath: sourcePath.slice(DATA_PREFIX.length) };
    }
    return { kind: 'drop', hubPath: sourcePath.slice(DATA_PREFIX.length), reason: 'TT data 根下未归类内容' };
  }

  // 跨平台兼容私有沙箱条目
  if (sourcePath.startsWith('_compat/')) {
    return { kind: 'compat', hubPath: sourcePath };
  }

  // st / l:摊平布局
  if (sourcePath === 'manifest.json') {
    return { kind: 'manifest', hubPath: 'manifest.json' };
  }
  if (ENGINE_DUMP_ENTRIES.includes(sourcePath)) {
    return { kind: 'engine-dump', hubPath: sourcePath };
  }
  // ST / Luker 的**全局**三方扩展（宿主常量 `globalExtensions`）
  if (sourcePath.startsWith(PUBLIC_THIRD_PARTY_PREFIX)) {
    const rest = sourcePath.slice(PUBLIC_THIRD_PARTY_PREFIX.length);
    return { kind: 'extension-pkg', hubPath: `extensions/${rest}`, extScope: 'global' };
  }
  // 宿主**自带**插件（`public/scripts/extensions/<内置>/`）：不参与扩展打包 ——
  // 四宿主各有一套自带插件，跨宿主搬运只会写出目标平台不消费的垃圾路径。
  if (sourcePath.startsWith(PUBLIC_EXTENSIONS_PREFIX)) {
    const rest = sourcePath.slice(PUBLIC_EXTENSIONS_PREFIX.length);
    if (!rest.includes('/')) {
      // `public/scripts/extensions/shared.js` 这类前端静态文件，不是扩展包
      return { kind: 'drop', hubPath: sourcePath, reason: '宿主前端静态文件，非扩展包' };
    }
    return { kind: 'builtin-ext', hubPath: sourcePath, extScope: 'builtin', extName: rest.split('/')[0] };
  }
  if (sourcePath.startsWith('extensions/third-party/')) {
    const rest = sourcePath.slice('extensions/third-party/'.length);
    return { kind: 'extension-pkg', hubPath: `extensions/${rest}`, extScope: 'global' };
  }
  if (sourcePath.startsWith('extensions/')) {
    return { kind: 'extension-pkg', hubPath: sourcePath, extScope: 'user' };
  }
  return { kind: 'user', hubPath: sourcePath };
}

/** hub 路径 → 目标平台上的最终条目路径。包含私有配置沙箱解包与跨平台安全隔离。
 * @param {string} hubPath
 * @param {string} target 目标布局码
 * @param {'user'|'global'} [extScope] 扩展作用域；缺省按 user（hub 的 `extensions/<n>` 历史语义即用户级平铺）
 */
export function targetEntryPath(hubPath, target, extScope) {
  // 1. 跨平台私有配置沙箱解包 (Unwrap compat)
  if (hubPath.startsWith('_compat/')) {
    const parts = hubPath.slice('_compat/'.length).split('/');
    const platform = parts[0]; // 'luker', 'tt', 'st'
    const subPath = parts.slice(1).join('/');
    if ((platform === 'luker' || platform === 'l') && target === TARGETS.L) {
      return subPath;
    }
    if (platform === 'tt' && target === TARGETS.TT) {
      return `data/default-user/${subPath}`;
    }
    if (platform === 'st' && target === TARGETS.ST) {
      return subPath;
    }
  }

  // 2. 目标不是 Luker 时，Luker 专属私有文件转入 _compat/luker/
  if (target !== TARGETS.L) {
    if (hubPath === 'stats.json' || hubPath === 'macros.json') {
      const compatPath = `_compat/luker/${hubPath}`;
      if (target === TARGETS.TT || target === TARGETS.PT) {
        return `data/default-user/${compatPath}`;
      }
      return compatPath;
    }
  }

  // 3. 目标不是 TT 时，TT 专属私有文件转入 _compat/tt/
  if (target !== TARGETS.TT) {
    if (hubPath === 'tauritavern-settings.json') {
      const compatPath = `_compat/tt/${hubPath}`;
      if (target === TARGETS.PT) {
        return `data/default-user/${compatPath}`;
      }
      return compatPath;
    }
  }

  // 4. 标准平台布局映射
  if (hubPath.startsWith('extensions/')) {
    const rest = hubPath.slice('extensions/'.length);
    // PT 没有用户级扩展目录（目录表不含 `extensions/`），只认 third-party + 来源记录。
    if (target === TARGETS.PT) return `data/extensions/third-party/${rest}`;
    // TT 保留作用域：local → `data/default-user/extensions/`（同名时宿主优先它），
    // global → `data/extensions/third-party/`。
    if (target === TARGETS.TT) {
      return extScope === 'global'
        ? `data/extensions/third-party/${rest}`
        : `data/default-user/extensions/${rest}`;
    }
    // ST / Luker 的恢复端点只往用户目录写，且宿主加载语义是「用户级优先」
    // ⇒ 两种来源都平铺成 `extensions/<n>`，同一扩展只保留一份。
    return hubPath;
  }
  if (target === TARGETS.TT || target === TARGETS.PT) {
    return `data/default-user/${hubPath}`;
  }
  return hubPath;
}

/**
 * 预扫用：判定一条**源路径**属于哪种扩展作用域。
 *
 * 五种形态与四种宿主一一对应（2026-11-12 实机取证，见
 * `docs/PLAN-2026-11-12-extension-scope-and-conflicts.md`）：
 *   `extensions/<n>/`                            用户级（ST / Luker）
 *   `public/scripts/extensions/third-party/<n>/`  全局（ST / Luker，宿主常量 `globalExtensions`）
 *   `public/scripts/extensions/<内置>/`            宿主自带
 *   `data/default-user/extensions/<n>/`           用户级（TT local）
 *   `data/extensions/third-party/<n>/`            全局（TT / PT）
 *
 * @returns {{name:string, scope:'user'|'global'|'builtin'}|null}
 */
export function extensionScopeOf(sourcePath, layout) {
  const p = String(sourcePath || '').replace(/\\/g, '/');
  const hit = (prefix, scope) => {
    if (!p.startsWith(prefix)) return null;
    const rest = p.slice(prefix.length);
    const slash = rest.indexOf('/');
    // 目录根下的散文件（如 `extensions/.gitkeep`）不是扩展
    if (slash <= 0) return null;
    return { name: rest.slice(0, slash), scope };
  };
  if (layout === LAYOUTS.TT) {
    return hit('data/default-user/extensions/', 'user')
      || hit(TT_THIRD_PARTY_PREFIX, 'global');
  }
  // 顺序不可颠倒：third-party 与内置两条前缀更长，必须先判
  return hit(PUBLIC_THIRD_PARTY_PREFIX, 'global')
    || hit(PUBLIC_EXTENSIONS_PREFIX, 'builtin')
    || hit(THIRD_PARTY_PREFIX, 'global')
    || hit(USER_EXTENSIONS_PREFIX, 'user');
}

/** 预扫用:路径若属于**全局**第三方扩展包,返回目录名。 */
export function thirdPartyFolderOf(sourcePath, layout) {
  const hit = extensionScopeOf(sourcePath, layout);
  return hit && hit.scope === 'global' ? hit.name : null;
}

/**
 * 预扫中央目录，按作用域收集扩展目录名（不打开任何数据流）。
 *
 * 四目标共用：同名去重的前提是**先知道全包有哪些名字**。
 */
export async function scanExtensionScopes({ io, sourcePath, layout, reader, isPtNative }) {
  const global = new Set();
  const user = new Set();
  const builtin = new Set();
  if (isPtNative) {
    // PT 归档的条目是 `modules/…`，无法按路径路由；重建器在记录趟直接给出全局目录名。
    for (const name of reader.thirdPartyFolders || []) global.add(name);
    return { global, user, builtin };
  }
  const scanner = await io.openReader(sourcePath);
  try {
    for await (const entry of scanner.entries()) {
      const hit = extensionScopeOf(entry.fileName, layout);
      if (hit) {
        if (hit.scope === 'global') global.add(hit.name);
        else if (hit.scope === 'user') user.add(hit.name);
        else builtin.add(hit.name);
      }
      entry.skip();
    }
  } finally {
    await scanner.close();
  }
  return { global, user, builtin };
}

function noteExtensionPackage(context, hubPath, data) {
  if (!hubPath.startsWith('extensions/')) return;
  const rest = hubPath.slice('extensions/'.length);
  const separator = rest.indexOf('/');
  if (separator <= 0) return;
  const folderName = rest.slice(0, separator);
  const relative = rest.slice(separator + 1);
  if (relative === 'manifest.json' && !context.extensionManifests.has(folderName)) {
    const parsed = parseJsonSafe(data);
    if (parsed) context.extensionManifests.set(folderName, parsed);
  }
}

/**
 * 尾部合成条目:目标 manifest(L)、extension-sources(pt/tt)、官方扩展下载索引、离线脚本与 ST 安装说明。
 */
async function emitSynthesized(writer, report, context, target, selection, {
  extensionMode = EXTENSION_MODES.FULL,
  gitMode = GIT_MODES.KEEP,
  dryRun = false,
} = {}) {
  if (target === TARGETS.L) {
    const baseSelection = { ...L_SELECTION };
    if (selection && typeof selection === 'object') {
      for (const [key, val] of Object.entries(selection)) {
        if (key in baseSelection) {
          baseSelection[key] = Boolean(val);
        }
      }
      // 兼容旧版/别名:
      if (selection.worlds === false) baseSelection.lorebooks = false;
      if (selection.avatars === false) baseSelection.assets = false;
    }
    const manifest = {
      schemaVersion: 1,
      createdAt: FIXED_TIMESTAMP,
      handle: context.manifest?.handle ?? 'default-user',
      selection: baseSelection,
    };
    await writer.add('manifest.json', encodeJson(manifest));
    report.synthesized('manifest.json');
  }

  // 汇总所有已知扩展（状态字段由 extension-manifest.js 派生，保证两条产出路径同源）
  const allExtNames = new Set([
    ...context.extensionManifests.keys(),
    ...context.extensionSources.keys(),
    ...context.extensionGitMeta.keys(),
  ]);

  const extInputs = [...allExtNames].sort().map((name) => ({
    name,
    manifest: context.extensionManifests.get(name) || {},
    gitMeta: context.extensionGitMeta.get(name) || {},
    sourceRecord: context.extensionSources.get(name)?.record || {},
  }));

  // gitMode=minimal：为每个实际打包的 Git 扩展补一个占位文件，保证 `.git/objects` 目录解压后存在。
  // 必要性：git 的 is_git_directory() 要求 objects/refs 是真实目录，而本管线丢弃空目录条目
  // （zip-io.js:101/111），故只能靠一个普通文件把目录「撑」住；缺它则 minimal 与 strip 等价。
  if (gitMode === GIT_MODES.MINIMAL && context.gitMinimalRoots.size > 0) {
    for (const root of [...context.gitMinimalRoots].sort()) {
      const rootName = root.slice('extensions/'.length);
      // 全局扩展的占位文件必须落在全局目录（TT 目标下两处是不同路径）。
      const rootScope = (context.globalExtFolders.has(rootName) && !context.userExtFolders.has(rootName))
        ? 'global' : 'user';
      const keepPath = `${targetEntryPath(root, target, rootScope)}/.git/objects/.keep`;
      if (!dryRun) await writer.add(keepPath, GIT_KEEP_PLACEHOLDER);
      report.synthesized(keepPath);
    }
    report.warn(
      `已按 gitMode=minimal 精简 ${context.gitMinimalRoots.size} 个扩展的 Git 历史：仅保留识别与更新所需元数据`
      + '（config/HEAD/index/refs），对象存储全部剔除。接收方首次「检查更新」时会从 origin 重新拉取对象，'
      + '此后仓库自愈为完整状态；若接收方无网络，请改用 keep 或 strip。',
    );
  }

  // 清单在 FULL 与 MANIFEST **两种模式**下都产出（决策 D-1）；
  // 官方索引仅 MANIFEST 产出（决策 D-6，避免宿主对已内嵌实体重复安装）。
  const shouldEmitManifest = (target === TARGETS.ST || target === TARGETS.L)
    && (extensionMode === EXTENSION_MODES.MANIFEST || extensionMode === EXTENSION_MODES.FULL);

  if (extInputs.length > 0 && (!selection || selection.extensions !== false) && shouldEmitManifest) {
    const isManifestMode = extensionMode === EXTENSION_MODES.MANIFEST;

    // 1. 官方 Content Downloader 索引：**仅轻量清单模式**产出
    if (isManifestMode) {
      const officialIndex = buildOfficialIndex(
        extInputs.map((input) => deriveExtensionEntry({ ...input, mode: extensionMode })),
      );
      if (officialIndex) {
        await writer.add('extensions-index.json', encodeJson(officialIndex));
        report.synthesized('extensions-index.json');
      }
    }

    // 2. 转换器私有清单：两种模式都产出，供宿主插件恢复时引导安装或更新
    const convertManifest = buildExtensionManifest({
      extensions: extInputs,
      mode: extensionMode,
      generatedAt: FIXED_TIMESTAMP,
    });
    await writer.add('_convert/extensions-manifest.json', encodeJson(convertManifest));
    report.synthesized('_convert/extensions-manifest.json');

    report.warn(
      isManifestMode
        ? `已启用轻量清单模式：已记录 ${extInputs.length} 个扩展清单（未打包实体代码与 Git packfile），`
          + '已生成 extensions-index.json 与 _convert/extensions-manifest.json。'
        : `完整离线包已含 ${extInputs.length} 个扩展实体：包内同时写入 _convert/extensions-manifest.json，`
          + '仅用于恢复后的更新引导（不生成 extensions-index.json，以免宿主重复在线安装）。',
    );
  }

  if ((target === TARGETS.ST || target === TARGETS.L) && context.thirdPartyFlattenedCount > 0) {
    report.warn(
      `已针对 ${target.toUpperCase()} 平台规范消除错误的 third-party 嵌套，自动将 ${context.thirdPartyFlattenedCount} 个扩展条目拉平为标准平铺布局 (extensions/<name>/)。`,
    );
  }

  if (target === TARGETS.PT && context.userExtensionsMigrated > 0) {
    report.warn(
      `已将 ${context.userExtensionsMigrated} 个用户级 extensions/** 条目迁移为 third-party 布局`
      + `(PT 规范需放置在 data/extensions/third-party/); `
      + '来源记录取自各扩展 manifest 的 homePage。',
    );
  }
  // 同名去重：四目标统一按「用户级优先」保留一份。被跳过的全局副本必须点名，
  // 否则用户会以为扩展丢了；同时给出「想在宿主里清理哪一份」的指引。
  if (context.globalShadowedByUser.size > 0) {
    const names = [...context.globalShadowedByUser].sort();
    report.warn(
      `检测到 ${names.length} 组同名扩展（用户级与全局各一份）：已按宿主加载语义保留**用户级**，`
      + `跳过全局副本 —— ${names.join(', ')}。`
      + ' 如需消除宿主里的重复安装，请在该宿主删除全局那一份（数据包中也可不勾选对应扩展）。',
    );
  }
  // 宿主自带插件不进包：明确列出，避免用户以为转换丢了文件。
  if (context.builtinExts.size > 0) {
    report.warn(
      `已剥离 ${context.builtinExts.size} 个宿主自带插件（目标宿主自有一套，不含在数据包内）：`
      + [...context.builtinExts].sort().join(', '),
    );
  }

  if ((target === TARGETS.PT || target === TARGETS.TT) && (!selection || selection.extensions !== false)) {
    for (const [path, value] of buildExtensionSources(context, report, target)) {
      await writer.add(path, encodeJson(value));
      report.synthesized(path);
    }
  }

  if (target === TARGETS.ST) {
    await writer.add('_convert/INSTALL.md', encodeText(INSTALL_MD));
    report.synthesized('_convert/INSTALL.md');
    await writer.add('_convert/meta.json', encodeJson({
      converter: 'tavern-convert',
      generatedAt: FIXED_TIMESTAMP,
      note: '本目录不会被任何平台消费,仅供人工核对。',
    }));
    report.synthesized('_convert/meta.json');
  }
}

/**
 * PT/TT 目标的 extension-sources 产出:
 * - 源里已有记录 → 原样保留(保 reference/installed_commit,更新链不断)
 * - 没有记录 → 从扩展 manifest 的 homePage 或 Git 提取信息合成
 */
function buildExtensionSources(context, report, target) {
  const output = new Map();

  for (const { scope, fileName, record } of context.extensionSources.values()) {
    if (record) output.set(`data/_tauritavern/extension-sources/${scope}/${fileName}`, record);
  }

  const allNames = new Set([
    ...context.extensionManifests.keys(),
    ...context.extensionGitMeta.keys(),
  ]);

  for (const folderName of allNames) {
    if (context.extensionSources.has(folderName)) continue;
    const manifest = context.extensionManifests.get(folderName) || {};
    const gitMeta = context.extensionGitMeta.get(folderName) || {};
    const homePage = gitMeta.remoteUrl
      || (typeof manifest.homePage === 'string' ? manifest.homePage.trim() : '');
    // 来源记录的 scope 必须与扩展落点一致：TT 的 local 扩展对应 `extension-sources/local/`。
    // PT 没有用户级扩展目录，一律 global。
    const scope = (target === TARGETS.PT || context.globalExtFolders.has(folderName)) ? 'global' : 'local';

    if (/^https:\/\//iu.test(homePage)) {
      output.set(`data/_tauritavern/extension-sources/${scope}/${folderName}.json`, {
        remote_url: homePage,
        reference: gitMeta.branch || '',
        installed_commit: gitMeta.commit || '',
      });
    } else {
      report.warn(
        `扩展 "${folderName}" 无来源记录且 remoteUrl/homePage 非 https(${homePage || '空'}),`
        + '按 PT 规则它将在导入时被跳过,请在 PT 扩展面板重装。',
      );
    }
  }

  return new Map([...output.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

const JSON_DECODER = new TextDecoder();

/** Buffer/Uint8Array 通用的 JSON 解析(浏览器插件路径没有 Buffer)。 */
export function parseJsonSafe(data) {
  try {
    return JSON.parse(JSON_DECODER.decode(data));
  } catch {
    return null;
  }
}

const JSON_ENCODER = new TextEncoder();

/** 合成 JSON 条目统一走 TextEncoder,核心模块不依赖 node:buffer。 */
export function encodeJson(value) {
  return JSON_ENCODER.encode(JSON.stringify(value, null, 2));
}

export function encodeText(text) {
  return JSON_ENCODER.encode(text);
}
