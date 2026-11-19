import { zipIo } from './zip-io.js';
import { detectFromReader, LAYOUTS } from './detect.js';
import * as zip from '../vendor/zip.js';
import { ACTIONS, generatePlan } from './plan-preview.js';

export const CATEGORIES = Object.freeze({
  CHARACTERS: 'characters',
  CHATS: 'chats',
  LOREBOOKS: 'lorebooks',
  PRESETS: 'presets',
  SETTINGS: 'settings',
  SECRETS: 'secrets',
  ASSETS: 'assets',
  EXTENSIONS: 'extensions',
  GLOBAL_EXTENSIONS: 'globalExtensions',
  VECTORS: 'vectors',

  // 向后兼容别名
  WORLDS: 'lorebooks',
  AVATARS: 'assets',
});

export const CATEGORY_LABELS = Object.freeze({
  [CATEGORIES.CHARACTERS]: '角色卡 (Characters)',
  [CATEGORIES.CHATS]: '聊天记录 (Chats)',
  [CATEGORIES.LOREBOOKS]: '世界书 (World Info)',
  [CATEGORIES.PRESETS]: '预设配置 (Presets & Prompts)',
  [CATEGORIES.SETTINGS]: '系统设置 (Settings)',
  [CATEGORIES.SECRETS]: 'API 密钥 (Secrets)',
  /* assets = **附件**（用户 2026-11-19 明令：不得叫成图片/素材）。
     Luker 的 assets 下已按用途细分（bgm / ambient / blip / live2d / vrm / character / temp），
     说明它是「附件桶」而非「图片桶」；图片只是其中一类。
     细分类型（image / audio / video / document / model / database / archive /
     other-binary / unknown）由体检与图表另行标注，不改这里的大类语义。 */
  [CATEGORIES.ASSETS]: '附件 (Assets)',
  [CATEGORIES.EXTENSIONS]: '用户扩展 (User Extensions)',
  [CATEGORIES.GLOBAL_EXTENSIONS]: '第三方扩展 (3rd-party Extensions)',
  [CATEGORIES.VECTORS]: '向量数据库 (Vectors)',
});

/* ============================================================================
 * 附件细分（attachment subkind）—— 新增的独立层
 * ----------------------------------------------------------------------------
 * assets = **附件桶**（用户 2026-11-19 裁定：不得叫成图片/素材）。其内部既可能是
 * 图片，也可能是音频、3D 模型、权重、数据库等。Luker 的 src/assets.js 已按用途
 * 把 assets 细分为 bgm / ambient / blip / live2d / vrm / character / temp，
 * 印证 assets 是附件桶而非图片桶。以下细分不改 CATEGORIES 大类归属，
 * 也不改 categoryOfHubPath / categoryOfEntry 的既有行为。
 * ==========================================================================*/

/** 附件细分类别（assets = 附件桶；按用户 2026-11-19 裁定） */
export const ATTACHMENT_KINDS = Object.freeze({
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  MODEL: 'model',
  DATABASE: 'database',
  ARCHIVE: 'archive',
  OTHER_BINARY: 'other-binary',
  UNKNOWN: 'unknown',
});

/** 扩展名 → 附件细分（全小写键；匹配时统一转小写，大小写不敏感） */
const EXTENSION_KIND_MAP = Object.freeze({
  // image
  png: ATTACHMENT_KINDS.IMAGE,
  jpg: ATTACHMENT_KINDS.IMAGE,
  jpeg: ATTACHMENT_KINDS.IMAGE,
  webp: ATTACHMENT_KINDS.IMAGE,
  gif: ATTACHMENT_KINDS.IMAGE,
  avif: ATTACHMENT_KINDS.IMAGE,
  svg: ATTACHMENT_KINDS.IMAGE,
  bmp: ATTACHMENT_KINDS.IMAGE,
  ico: ATTACHMENT_KINDS.IMAGE,
  tiff: ATTACHMENT_KINDS.IMAGE,
  tif: ATTACHMENT_KINDS.IMAGE,
  // audio
  mp3: ATTACHMENT_KINDS.AUDIO,
  wav: ATTACHMENT_KINDS.AUDIO,
  ogg: ATTACHMENT_KINDS.AUDIO,
  oga: ATTACHMENT_KINDS.AUDIO,
  flac: ATTACHMENT_KINDS.AUDIO,
  m4a: ATTACHMENT_KINDS.AUDIO,
  aac: ATTACHMENT_KINDS.AUDIO,
  opus: ATTACHMENT_KINDS.AUDIO,
  weba: ATTACHMENT_KINDS.AUDIO,
  mid: ATTACHMENT_KINDS.AUDIO,
  midi: ATTACHMENT_KINDS.AUDIO,
  // video
  mp4: ATTACHMENT_KINDS.VIDEO,
  webm: ATTACHMENT_KINDS.VIDEO,
  mov: ATTACHMENT_KINDS.VIDEO,
  mkv: ATTACHMENT_KINDS.VIDEO,
  avi: ATTACHMENT_KINDS.VIDEO,
  m4v: ATTACHMENT_KINDS.VIDEO,
  // document
  pdf: ATTACHMENT_KINDS.DOCUMENT,
  txt: ATTACHMENT_KINDS.DOCUMENT,
  md: ATTACHMENT_KINDS.DOCUMENT,
  markdown: ATTACHMENT_KINDS.DOCUMENT,
  rtf: ATTACHMENT_KINDS.DOCUMENT,
  doc: ATTACHMENT_KINDS.DOCUMENT,
  docx: ATTACHMENT_KINDS.DOCUMENT,
  odt: ATTACHMENT_KINDS.DOCUMENT,
  csv: ATTACHMENT_KINDS.DOCUMENT,
  tsv: ATTACHMENT_KINDS.DOCUMENT,
  html: ATTACHMENT_KINDS.DOCUMENT,
  htm: ATTACHMENT_KINDS.DOCUMENT,
  xml: ATTACHMENT_KINDS.DOCUMENT,
  yml: ATTACHMENT_KINDS.DOCUMENT,
  yaml: ATTACHMENT_KINDS.DOCUMENT,
  // model（.bin 不在此：本仓实证同一 .bin 至少三种互斥语义——
  //   vectors/index.bin=向量库、_engine_dump.bin=数据库 dump、PT 包 *.png.bin=图片，
  //   扩展名本身不携带语义，默认归 other-binary；语义提升一律走 attachmentKindOfPath 的路径规则）
  onnx: ATTACHMENT_KINDS.MODEL,
  gguf: ATTACHMENT_KINDS.MODEL,
  safetensors: ATTACHMENT_KINDS.MODEL,
  pt: ATTACHMENT_KINDS.MODEL,
  pth: ATTACHMENT_KINDS.MODEL,
  ckpt: ATTACHMENT_KINDS.MODEL,
  h5: ATTACHMENT_KINDS.MODEL,
  pb: ATTACHMENT_KINDS.MODEL,
  tflite: ATTACHMENT_KINDS.MODEL,
  vrm: ATTACHMENT_KINDS.MODEL,
  glb: ATTACHMENT_KINDS.MODEL,
  gltf: ATTACHMENT_KINDS.MODEL,
  fbx: ATTACHMENT_KINDS.MODEL,
  obj: ATTACHMENT_KINDS.MODEL,
  mtl: ATTACHMENT_KINDS.MODEL,
  live2d: ATTACHMENT_KINDS.MODEL,
  moc3: ATTACHMENT_KINDS.MODEL,
  mtn: ATTACHMENT_KINDS.MODEL,
  physics3: ATTACHMENT_KINDS.MODEL,
  // database
  sqlite: ATTACHMENT_KINDS.DATABASE,
  sqlite3: ATTACHMENT_KINDS.DATABASE,
  db: ATTACHMENT_KINDS.DATABASE,
  db3: ATTACHMENT_KINDS.DATABASE,
  realm: ATTACHMENT_KINDS.DATABASE,
  leveldb: ATTACHMENT_KINDS.DATABASE,
  ldb: ATTACHMENT_KINDS.DATABASE,
  // archive
  zip: ATTACHMENT_KINDS.ARCHIVE,
  tar: ATTACHMENT_KINDS.ARCHIVE,
  gz: ATTACHMENT_KINDS.ARCHIVE,
  tgz: ATTACHMENT_KINDS.ARCHIVE,
  bz2: ATTACHMENT_KINDS.ARCHIVE,
  xz: ATTACHMENT_KINDS.ARCHIVE,
  zst: ATTACHMENT_KINDS.ARCHIVE,
  '7z': ATTACHMENT_KINDS.ARCHIVE,
  rar: ATTACHMENT_KINDS.ARCHIVE,
  // other-binary（.bin 默认在此：扩展名本身不携带语义，见下方 // model 注释）
  bin: ATTACHMENT_KINDS.OTHER_BINARY,
  wasm: ATTACHMENT_KINDS.OTHER_BINARY,
  so: ATTACHMENT_KINDS.OTHER_BINARY,
  dll: ATTACHMENT_KINDS.OTHER_BINARY,
  dylib: ATTACHMENT_KINDS.OTHER_BINARY,
  exe: ATTACHMENT_KINDS.OTHER_BINARY,
  node: ATTACHMENT_KINDS.OTHER_BINARY,
});

/** 扩展名是否给出「强类型」信号（非 image / 非 unknown）——用于和弱图片路径消解冲突 */
function isStrongAttachmentKind(kind) {
  return Boolean(kind)
    && kind !== ATTACHMENT_KINDS.IMAGE
    && kind !== ATTACHMENT_KINDS.UNKNOWN;
}

/** 纯扩展名判定（内部复用；大小写不敏感，只取末段文件名，忽略路径） */
function kindByExtension(fileName) {
  if (typeof fileName !== 'string' || !fileName) return ATTACHMENT_KINDS.UNKNOWN;
  const base = fileName.replace(/\\/g, '/').split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return ATTACHMENT_KINDS.UNKNOWN;
  const ext = base.slice(dot + 1).toLowerCase();
  const kind = EXTENSION_KIND_MAP[ext] || ATTACHMENT_KINDS.UNKNOWN;

  // 双扩展名特判：PT 包 *.png.bin / *.jpg.bin 实为图片。
  // 末段 .bin 语义不确定时，看紧邻的前一个扩展名是否有明确语义。
  if (ext === 'bin') {
    const prevDot = base.lastIndexOf('.', dot - 1);
    if (prevDot >= 0) {
      const prevExt = base.slice(prevDot + 1, dot).toLowerCase();
      const prevKind = EXTENSION_KIND_MAP[prevExt];
      if (prevKind && prevKind !== ATTACHMENT_KINDS.OTHER_BINARY && prevKind !== ATTACHMENT_KINDS.UNKNOWN) {
        return prevKind;
      }
    }
  }
  return kind;
}

/**
 * 判定附件细分类型（对外综合入口，大小写不敏感）。
 * 输入含路径时先走 attachmentKindOfPath（Luker 用途目录覆盖扩展名），
 * 路径无结论再回退末段扩展名；纯文件名等价于按扩展名判定。
 * @param {string} fileNameOrPath
 * @returns {string} ATTACHMENT_KINDS 之一
 */
export function attachmentKindOf(fileNameOrPath) {
  const byPath = attachmentKindOfPath(fileNameOrPath);
  return byPath || kindByExtension(fileNameOrPath);
}

/**
 * 按路径细分附件类型（优先于扩展名判定）。
 *
 * 优先级（最终裁定）：
 *   0) `.bin` 语义不确定（向量库 / dump / 图片双扩展名 / 模型），扩展名层默认
 *      other-binary；仅以下路径/形态提升：vectors/ 或名含 _engine_dump → database；
 *      assets/vrm/、assets/live2d/、models/ → model；*.png.bin 等在扩展名层按
 *      前一扩展名判（见 kindByExtension）。
 *   1) Luker assets 用途子目录（强语义）覆盖扩展名：
 *      bgm / ambient / blip → audio；vrm / live2d → model。
 *      → assets/bgm/x.bin 判为 audio（路径覆盖扩展名）。
 *   2) 扩展名「强类型」覆盖弱语义图片目录：backgrounds/、User Avatars/、
 *      user/images/、expressions/、sprites/、assets/character/、assets/temp/
 *      默认 image，但若扩展名是强类型则以扩展名为准。
 *   3) 通用附件桶 user/files/ 与 assets/（含 TT 深层 data/default-user/assets/）：
 *      按扩展名判定。
 *   4) 无任何路径线索 → 返回 null（交扩展名层判定）。
 *
 * 路径分隔符统一为 '/'；前缀按目录边界匹配（assets/ 不误命中 assets-archive/）；
 * 支持深层嵌套与中文/超长文件名。
 * @param {string} hubPath
 * @returns {string|null} ATTACHMENT_KINDS 之一，或 null（无法从路径判断）
 */
export function attachmentKindOfPath(hubPath) {
  if (typeof hubPath !== 'string' || !hubPath) return null;
  const norm = hubPath.replace(/\\/g, '/');
  const fileName = norm.split('/').pop() || '';
  const extKind = kindByExtension(fileName);
  const strong = isStrongAttachmentKind(extKind);

  // 0) .bin 专用提升规则（扩展名默认 other-binary，仅明确路径/形态提升）
  const isBin = /\.bin$/i.test(fileName);
  if (isBin) {
    if (/(^|\/)vectors(\/|$)/i.test(norm) || /_engine_dump/i.test(fileName)) {
      return ATTACHMENT_KINDS.DATABASE;
    }
    if (/(^|\/)models(\/|$)/i.test(norm)) return ATTACHMENT_KINDS.MODEL;
  }

  // 1) Luker assets 用途子目录：强语义路径覆盖扩展名
  if (/(^|\/)assets\/(bgm|ambient|blip)(\/|$)/i.test(norm)) return ATTACHMENT_KINDS.AUDIO;
  if (/(^|\/)assets\/(vrm|live2d)(\/|$)/i.test(norm)) return ATTACHMENT_KINDS.MODEL;

  // 2) 弱语义图片目录：默认 image；扩展名强类型时以扩展名为准
  const weakImagePath = /(^|\/)assets\/(character|temp)(\/|$)/i.test(norm)
    || /(^|\/)(backgrounds|User Avatars|expressions|sprites)(\/|$)/i.test(norm)
    || /(^|\/)user\/images(\/|$)/i.test(norm);
  if (weakImagePath) return strong ? extKind : ATTACHMENT_KINDS.IMAGE;

  // 3) 通用附件桶：user/files/ 与 assets/（含深层，如 TT 的 data/default-user/assets/）
  const genericBucket = /(^|\/)user\/files(\/|$)/i.test(norm)
    || /(^|\/)assets(\/|$)/i.test(norm);
  if (genericBucket) return extKind;

  // 4) 无路径线索
  return null;
}

const TT_USER_PREFIX = 'data/default-user/';
const TT_THIRD_PARTY_PREFIX = 'data/extensions/third-party/';
const TT_SOURCES_PREFIX = 'data/_tauritavern/extension-sources/';

/**
 * 判断指定 hub 路径所属的业务类目 (对齐 ST / Luker 10 大标准备份项)
 * @param {string} hubPath
 * @returns {string|null}
 */
export function categoryOfHubPath(hubPath) {
  if (hubPath === 'secrets.json') return CATEGORIES.SECRETS;
  if (
    hubPath === 'settings.json'
    || hubPath === 'tauritavern-settings.json'
    || hubPath === 'stats.json'
    || hubPath === 'macros.json'
    || hubPath === 'user_data.json'
    || hubPath.startsWith('backups/')
    || hubPath === 'backups'
  ) {
    return CATEGORIES.SETTINGS;
  }
  if (hubPath.startsWith('characters/') || hubPath === 'characters') return CATEGORIES.CHARACTERS;
  if (
    hubPath.startsWith('chats/')
    || hubPath === 'chats'
    || hubPath.startsWith('groups/')
    || hubPath === 'groups'
    || hubPath.startsWith('group chats/')
    || hubPath === 'group chats'
  ) {
    return CATEGORIES.CHATS;
  }
  if (hubPath.startsWith('worlds/') || hubPath === 'worlds') return CATEGORIES.LOREBOOKS;
  if (
    hubPath.startsWith('OpenAI Settings/')
    || hubPath.startsWith('NovelAI Settings/')
    || hubPath.startsWith('presets/')
    || hubPath.startsWith('instruct/')
    || hubPath.startsWith('context/')
    || hubPath.startsWith('sysprompt/')
    || hubPath.startsWith('reasoning/')
    || hubPath.startsWith('themes/')
    || hubPath.startsWith('movingUI/')
    || hubPath.startsWith('QuickReplies/')
    || hubPath.startsWith('quick-replies/')
    || hubPath.startsWith('quick_replies/')
    || hubPath.startsWith('textgen_presets/')
    || hubPath.startsWith('regex/')
    || hubPath.startsWith('regex_scripts/')
    || hubPath === 'custom_styles.css'
    || hubPath === 'custom.css'
  ) {
    return CATEGORIES.PRESETS;
  }
  if (
    hubPath.startsWith('User Avatars/')
    || hubPath === 'User Avatars'
    || hubPath.startsWith('backgrounds/')
    || hubPath === 'backgrounds'
    || hubPath.startsWith('assets/')
    || hubPath === 'assets'
    || hubPath.startsWith('user/')
    || hubPath === 'user'
    || hubPath.startsWith('expressions/')
    || hubPath.startsWith('expression/')
    || hubPath.startsWith('default_expressions/')
    || hubPath.startsWith('sprites/')
    || hubPath.startsWith('speech/')
    || hubPath.startsWith('audio/')
    || hubPath.startsWith('sounds/')
    || hubPath.startsWith('voice/')
  ) {
    return CATEGORIES.ASSETS;
  }
  if (
    hubPath.startsWith('extensions/third-party/')
    || hubPath.startsWith('_tauritavern/extension-sources/')
    || hubPath.startsWith('public/scripts/extensions/third-party/')
  ) {
    return CATEGORIES.GLOBAL_EXTENSIONS;
  }
  if (
    hubPath.startsWith('extensions/')
    || hubPath === 'extensions'
    || hubPath.startsWith('scripts/')
  ) {
    return CATEGORIES.EXTENSIONS;
  }
  if (hubPath.startsWith('vectors/') || hubPath === 'vectors') {
    return CATEGORIES.VECTORS;
  }
  return null;
}

/**
 * 判断指定路径是否属于历史备份快照或聊天备份文件
 * 涵盖：
 * 1. backups/ 或包含 backups/ 目录
 * 2. chats/ 或 group chats/ 下带备份特征的文件 (_backup, backup_, .bak, (backup), [backup])
 * @param {string} filePath
 * @returns {boolean}
 */
export function isBackupChatOrSnapshot(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const norm = filePath.replace(/\\/g, '/');

  // 1. 系统/用户级 backups 快照目录
  if (
    norm.startsWith('backups/')
    || norm === 'backups'
    || norm.includes('/backups/')
  ) {
    return true;
  }

  // 2. 聊天目录内的备份文件
  const isChatPath = norm.startsWith('chats/')
    || norm.includes('/chats/')
    || norm.startsWith('groups/')
    || norm.includes('/groups/')
    || norm.startsWith('group chats/')
    || norm.includes('/group chats/');

  if (isChatPath) {
    const filename = norm.split('/').pop() || '';
    if (
      /(?:^|[._\-\s])backup(?:[._\-\s]|$)/i.test(filename)
      || /_backup/i.test(filename)
      || /backup_/i.test(filename)
      || /\.bak$/i.test(filename)
      || /\.backup$/i.test(filename)
      || /\(backup\)/i.test(filename)
      || /\[backup\]/i.test(filename)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 从原始 zip 条目名与所属布局识别类目
 * @param {string} entryName
 * @param {string} layout
 * @returns {string|null}
 */
export function categoryOfEntry(entryName, layout) {
  if (layout === LAYOUTS.TT) {
    if (entryName.startsWith(TT_USER_PREFIX)) {
      return categoryOfHubPath(entryName.slice(TT_USER_PREFIX.length));
    }
    if (entryName.startsWith(TT_THIRD_PARTY_PREFIX) || entryName.startsWith(TT_SOURCES_PREFIX)) {
      return CATEGORIES.GLOBAL_EXTENSIONS;
    }
    return null;
  }
  return categoryOfHubPath(entryName);
}

/**
 * 零拷贝预检 Zip 包中央目录并按业务资产分类统计
 * @param {Blob|File|string} source
 * @param {object} [options]
 * @param {object} [options.io]
 * @returns {Promise<{
 *   layout: string,
 *   evidence: string,
 *   totalFiles: number,
 *   totalBytes: number,
 *   categories: Record<string, { count: number, sizeBytes: number, label: string }>
 * }>}
 */
export async function inspectArchive(source, { io = zipIo } = {}) {
  const reader = await io.openReader(source);
  let detection;
  try {
    detection = await detectFromReader(reader);
  } finally {
    await reader.close();
  }

  // 重新打开遍历条目统计（开销极低，仅读中央目录）
  const scanner = await io.openReader(source);
  const categories = {};
  const orderedKeys = [
    CATEGORIES.CHARACTERS,
    CATEGORIES.CHATS,
    CATEGORIES.LOREBOOKS,
    CATEGORIES.PRESETS,
    CATEGORIES.SETTINGS,
    CATEGORIES.SECRETS,
    CATEGORIES.ASSETS,
    CATEGORIES.EXTENSIONS,
    CATEGORIES.GLOBAL_EXTENSIONS,
    CATEGORIES.VECTORS,
  ];
  for (const cat of orderedKeys) {
    categories[cat] = {
      count: 0,
      sizeBytes: 0,
      label: CATEGORY_LABELS[cat] || cat,
    };
  }

  let totalFiles = 0;
  let totalBytes = 0;

  try {
    for await (const entry of scanner.entries()) {
      if (entry.isDirectory) {
        entry.skip();
        continue;
      }
      totalFiles += 1;
      const size = entry.uncompressedSize || 0;
      totalBytes += size;

      const cat = categoryOfEntry(entry.fileName, detection.layout);
      if (cat && categories[cat]) {
        categories[cat].count += 1;
        categories[cat].sizeBytes += size;
      }
      entry.skip();
    }
  } finally {
    await scanner.close();
  }

  return {
    layout: detection.layout,
    evidence: detection.evidence,
    totalFiles,
    totalBytes,
    categories,
  };
}

/* ==========================================================================
 * 离线包体检（A+B+C+D+E 五层）
 *
 * 本节为纯逻辑：不引用任何 src/ui/**，不触碰 DOM，可在 Node（无 DOM）环境运行。
 * 只依赖 zip-io / detect / plan-preview / vendor zip.js。
 * A 层先于解析（size===0 不进 ZIP 解析器）；C/D 层只读中央目录，绝不解压大文件。
 * ========================================================================== */

/** verdict.code 固定枚举（供 UI 转文案） */
export const INSPECT_VERDICTS = Object.freeze({
  EMPTY_FILE: 'empty-file',
  TOO_SMALL: 'too-small',
  NOT_ZIP: 'not-zip',
  TRUNCATED: 'truncated',
  ZIP64: 'zip64',
  MULTI_DISK: 'multi-disk',
  CENTRAL_DIR_CORRUPT: 'central-dir-corrupt',
  EMPTY_PACKAGE: 'empty-package',
  UNKNOWN_LAYOUT: 'unknown-layout',
  SPLIT_PACKAGE: 'split-package',
  HAS_EMPTY_ENTRIES: 'has-empty-entries',
  ALL_DROPPED: 'all-dropped',
  OK: 'ok',
});

const VERDICT_META = Object.freeze({
  'empty-file': { severity: 'fatal', layer: 'A', key: 'inspect.a.empty' },
  'too-small': { severity: 'fatal', layer: 'A', key: 'inspect.a.tooSmall' },
  'not-zip': { severity: 'fatal', layer: 'A', key: 'inspect.a.badHeader' },
  'truncated': { severity: 'fatal', layer: 'A', key: 'inspect.a.truncated' },
  'central-dir-corrupt': { severity: 'fatal', layer: 'B', key: 'inspect.b.cdBounds' },
  'multi-disk': { severity: 'fatal', layer: 'B', key: 'inspect.b.multiDisk' },
  zip64: { severity: 'warn', layer: 'B', key: 'inspect.b.zip64' },
  'empty-package': { severity: 'warn', layer: 'D', key: 'inspect.d.empty' },
  'unknown-layout': { severity: 'warn', layer: 'D', key: 'inspect.d.unknownLayout' },
  'split-package': { severity: 'warn', layer: 'D', key: 'inspect.d.splitPart' },
  'has-empty-entries': { severity: 'warn', layer: 'C', key: 'inspect.c.zeroEntries' },
  'all-dropped': { severity: 'warn', layer: 'E', key: 'inspect.e.allDrop' },
  ok: { severity: 'ok', layer: 'E', key: 'inspect.ok' },
});

const TARGET_MAP = Object.freeze({ st: 'st', l: 'l', tt: 'tt', pt: 'pt' });
const EOCD_SIG = [0x50, 0x4b, 0x05, 0x06];
const ZIP64_LOCATOR_SIG = [0x50, 0x4b, 0x06, 0x07];
const LOCAL_HEADER_SIG = 0x04034b50;
const EOCD_LEN = 22;
const EOCD_WINDOW = 65557;
const SAMPLE_LIMIT = 20;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function atSig(bytes, i, sig) {
  return bytes[i] === sig[0] && bytes[i + 1] === sig[1]
    && bytes[i + 2] === sig[2] && bytes[i + 3] === sig[3];
}

/**
 * 在尾部窗口内找「最后一个有效 EOCD」。
 * 有效性判据与 vendor 同：eocdOffset + 22 + commentLen === size。
 */
function findEocd(tail, tailStart, size) {
  let found = null;
  for (let i = tail.length - EOCD_LEN; i >= 0; i -= 1) {
    if (!atSig(tail, i, EOCD_SIG)) continue;
    const view = new DataView(tail.buffer, tail.byteOffset + i + 4, 18);
    const diskNo = view.getUint16(0, true);
    const cdStartDisk = view.getUint16(2, true);
    const entriesThisDisk = view.getUint16(4, true);
    const totalEntries = view.getUint16(6, true);
    const cdSize = view.getUint32(8, true);
    const cdOffset = view.getUint32(12, true);
    const commentLen = view.getUint16(16, true);
    const offset = tailStart + i;
    if (offset + EOCD_LEN + commentLen !== size) continue;
    found = {
      offset, diskNo, cdStartDisk, entriesThisDisk, totalEntries, cdSize, cdOffset, commentLen,
      zip64Sentinel: totalEntries === 0xffff || entriesThisDisk === 0xffff
        || cdSize === 0xffffffff || cdOffset === 0xffffffff,
    };
    break; // 从后往前，第一个有效即最后一个
  }
  return found;
}

function hasZip64Locator(tail, eocdIndex) {
  const limit = eocdIndex >= 0 ? eocdIndex : tail.length;
  for (let i = 0; i + 4 <= limit; i += 1) {
    if (atSig(tail, i, ZIP64_LOCATOR_SIG)) return true;
  }
  return false;
}

/** 不安全路径：绝对路径 / 盘符 / `..` 段（与 vendor Ka() 判据一致） */
function isUnsafePath(name) {
  const n = String(name || '').replace(/\\/g, '/');
  if (n.startsWith('/')) return true;
  if (/^[A-Za-z]:/.test(n)) return true;
  return n.split('/').includes('..');
}

/** 真正携带用户数据的条目（排除清单与转换器合成元数据） */
function isDataEntry(name) {
  const n = String(name || '');
  if (!n || n === 'manifest.json') return false;
  if (n.startsWith('_convert/') || n.startsWith('__MACOSX/')) return false;
  const base = n.split('/').pop();
  if (base === '.DS_Store' || base === 'Thumbs.db') return false;
  return true;
}

/** 30 字节本地头随机读；返回 null 表示一致或无需比对，否则返回原因字符串 */
async function localHeaderIssue(blob, entry) {
  if (entry.offset == null || !Number.isFinite(entry.offset)) return null;
  const buf = await blob.slice(entry.offset, entry.offset + 30).arrayBuffer();
  if (buf.byteLength < 30) return 'short';
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== LOCAL_HEADER_SIG) return 'bad-signature';
  const method = view.getUint16(8, true);
  if ((entry.rawBitFlag & 0x08) !== 0) {
    // general purpose bit 3（data descriptor）：本地头 size/crc 为 0，跳过比对
    return method === entry.compressionMethod ? null : 'method-mismatch';
  }
  if (view.getUint32(14, true) !== (entry.crc32 ?? 0)) return 'mismatch';
  if (view.getUint32(18, true) !== (entry.compressedSize ?? 0)) return 'mismatch';
  if (view.getUint32(22, true) !== (entry.uncompressedSize ?? 0)) return 'mismatch';
  return null;
}

function blankReport(size = 0) {
  return {
    ok: false,
    layer: 'A',
    bytes: { size, headHex: '', hasEocd: false, eocdOffset: -1 },
    zip: { entryCount: 0, declaredCount: -1, isZip64: false, isMultiDisk: false, centralDirOk: false },
    entries: {
      total: 0, zeroByteCount: 0, zeroByteSamples: [], methods: {},
      encryptedCount: 0, unsafePathCount: 0, nonUtf8Names: { count: 0, sample: [] },
    },
    layout: { detected: 'unknown', evidence: [], isSplit: false, isEmpty: true },
    convertible: {
      planOk: false, sourceEntries: 0, selectedEntries: 0, outputEntries: 0,
      allDropped: false, reason: '',
    },
    verdict: { code: INSPECT_VERDICTS.EMPTY_FILE, severity: 'fatal', key: VERDICT_META['empty-file'].key },
    warnings: [],
  };
}

function applyVerdict(report, code) {
  const meta = VERDICT_META[code] || VERDICT_META.ok;
  report.verdict = { code, severity: meta.severity, key: meta.key };
  report.layer = meta.layer;
  report.ok = meta.severity !== 'fatal';
  return report;
}

/**
 * 离线包体检：A+B+C+D+E 五层
 * @param {Blob|File} blob
 * @param {{targetLayout?: 'st'|'l'|'tt'|'pt'}} [opts]
 * @returns {Promise<InspectReport>}
 */
export async function inspectPackage(blob, opts = {}) {
  const size = (blob && typeof blob.size === 'number') ? blob.size : 0;
  const report = blankReport(size);
  report.bytes.size = size;

  // ---- A 层：文件字节（先于任何解析）----
  if (size === 0) return applyVerdict(report, INSPECT_VERDICTS.EMPTY_FILE);
  if (size < 22) return applyVerdict(report, INSPECT_VERDICTS.TOO_SMALL);

  let headBytes;
  let tail;
  const tailStart = Math.max(0, size - EOCD_WINDOW);
  try {
    headBytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  } catch (err) {
    report.warnings.push(`读取文件字节失败：${err?.message || err}`);
    return applyVerdict(report, INSPECT_VERDICTS.TRUNCATED);
  }
  report.bytes.headHex = bytesToHex(headBytes);
  const headOk = atSig(headBytes, 0, [0x50, 0x4b, 0x03, 0x04])
    || atSig(headBytes, 0, [0x50, 0x4b, 0x05, 0x06]);
  if (!headOk) return applyVerdict(report, INSPECT_VERDICTS.NOT_ZIP);

  const eocd = findEocd(tail, tailStart, size);
  if (!eocd) return applyVerdict(report, INSPECT_VERDICTS.TRUNCATED);
  report.bytes.hasEocd = true;
  report.bytes.eocdOffset = eocd.offset;
  const eocdIndex = eocd.offset - tailStart;
  const zip64Locator = eocd.zip64Sentinel || hasZip64Locator(tail, eocdIndex);

  // ---- B/C 层：用 tolerant reader 枚举（unsafe 路径不抛）----
  let reader;
  let rawEntries;
  let readerWarnings = [];
  let readerMeta = {};
  try {
    const blobReader = blob instanceof zip.BlobReader ? blob : new zip.BlobReader(blob);
    reader = new zip.ZipReader(blobReader, { strictness: 'tolerant', useWebWorkers: false });
    rawEntries = await reader.getEntries();
    readerWarnings = Array.isArray(reader.warnings) ? reader.warnings.slice() : [];
    readerMeta = {
      directoryOffset: reader.directoryOffset,
      directoryLength: reader.directoryLength,
      size: reader.size,
    };
  } catch (err) {
    report.warnings.push(`ZIP 中央目录解析失败：${err?.message || err}`);
    return applyVerdict(report, INSPECT_VERDICTS.CENTRAL_DIR_CORRUPT);
  }

  const entries = rawEntries.filter((e) => !e.directory);
  const entryCount = rawEntries.length;
  report.zip.entryCount = entryCount;
  report.zip.declaredCount = eocd.totalEntries;
  report.zip.isZip64 = zip64Locator || entries.some((e) => !!e.zip64);
  report.zip.isMultiDisk = eocd.diskNo !== 0 || eocd.cdStartDisk !== 0
    || eocd.entriesThisDisk !== eocd.totalEntries
    || entries.some((e) => (e.diskNumberStart ?? 0) !== 0);
  report.zip.centralDirOk = eocd.zip64Sentinel ? true : eocd.totalEntries === entryCount;

  // C 层画像
  const methods = {};
  const zeroByteSamples = [];
  const seen = new Set();
  const nonUtf8 = { count: 0, sample: [] };
  let zeroByteCount = 0;
  let encryptedCount = 0;
  let unsafePathCount = 0;
  let duplicateCount = 0;
  let hasCharacters = false;
  let hasSettings = false;
  let hasDataRoot = false;
  let hasRootManifest = false;
  let hasConvertDir = false;
  let dataEntryCount = 0;
  const allNames = [];
  for (const entry of entries) {
    const name = entry.filename ?? '';
    allNames.push(name);
    const methodKey = String(entry.compressionMethod);
    methods[methodKey] = (methods[methodKey] || 0) + 1;
    if ((entry.uncompressedSize ?? 0) === 0) {
      zeroByteCount += 1;
      if (zeroByteSamples.length < SAMPLE_LIMIT) zeroByteSamples.push(name);
    }
    if (entry.encrypted || entry.zipCrypto) encryptedCount += 1;
    if (!entry.filenameUTF8 && /[^\x00-\x7F]/.test(name)) {
      nonUtf8.count += 1;
      if (nonUtf8.sample.length < SAMPLE_LIMIT) nonUtf8.sample.push(name);
    }
    if (isUnsafePath(name)) unsafePathCount += 1;
    if (seen.has(name)) duplicateCount += 1; else seen.add(name);
    if (name === 'manifest.json') hasRootManifest = true;
    if (name === '_convert/split-manifest.json') hasConvertDir = true;
    if (name.startsWith('characters/') || name.startsWith('settings.json')) hasCharacters = true;
    if (name === 'settings.json') hasSettings = true;
    if (name.startsWith('data/')) hasDataRoot = true;
    if (isDataEntry(name)) dataEntryCount += 1;
  }
  report.entries = {
    total: entries.length,
    zeroByteCount, zeroByteSamples, methods,
    encryptedCount, unsafePathCount, nonUtf8Names: nonUtf8,
  };

  // B 层：本地头比对（>2000 条时采样，避免 8683 次 slice 卡住主线程）
  const localSample = entries.length > 2000 ? entries.slice(0, 200) : entries;
  const localIssues = [];
  for (const entry of localSample) {
    const issue = await localHeaderIssue(blob, entry);
    if (issue) localIssues.push(`${entry.filename ?? ''}: ${issue}`);
  }
  const cdBoundsBad = (eocd.cdOffset + eocd.cdSize > size)
    || ((readerMeta.directoryOffset ?? 0) + (readerMeta.directoryLength ?? 0) > size);
  if (cdBoundsBad) report.warnings.push('中央目录偏移/大小越出文件范围');
  if (localIssues.length) report.warnings.push(`本地头与目录不一致：${localIssues.slice(0, SAMPLE_LIMIT).join('; ')}`);
  if (encryptedCount) report.warnings.push(`发现 ${encryptedCount} 个加密条目`);
  if (unsafePathCount) report.warnings.push(`发现 ${unsafePathCount} 个危险路径条目`);
  if (nonUtf8.count) report.warnings.push(`${nonUtf8.count} 个文件名未标记 UTF-8 且含非 ASCII 字符`);
  if (duplicateCount) report.warnings.push(`${duplicateCount} 个重复文件名`);
  for (const w of readerWarnings) {
    report.warnings.push(`结构告警：${w?.reason || (typeof w === 'string' ? w : 'unknown')}`);
  }

  // D 层：语义识别（复用 detectFromReader，传入同一批条目的适配器，零额外 I/O）
  const filename = (blob && typeof blob.name === 'string') ? blob.name : '';
  const adapter = {
    async *entries() {
      for (const entry of entries) {
        yield {
          fileName: entry.filename ?? '',
          read: async () => {
            if ((entry.uncompressedSize ?? 0) > 1024 * 1024) return new Uint8Array(0);
            return await entry.getData(new zip.Uint8ArrayWriter());
          },
          skip: () => {},
        };
      }
    },
    async close() {},
  };
  let detection = { layout: LAYOUTS.UNKNOWN, evidence: 'detection failed', handle: null };
  try {
    detection = await detectFromReader(adapter, { filename });
  } catch (err) {
    report.warnings.push(`布局识别失败：${err?.message || err}`);
  }
  const isSplit = allNames.includes('_convert/split-manifest.json');
  const isEmpty = entries.length === 0 || dataEntryCount === 0;
  report.layout = {
    detected: detection.layout,
    evidence: detection.evidence ? [String(detection.evidence)] : [],
    isSplit,
    isEmpty,
  };

  // E 层：可转换性（generatePlan 独立扫描，不解压大文件）
  const target = TARGET_MAP[opts.targetLayout] || 'st';
  try {
    await reader.close();
  } catch { /* 忽略关闭异常 */ }
  let plan;
  try {
    plan = await generatePlan(blob, target);
    let selectedEntries = 0;
    let sourceOut = 0;
    for (const cat of Object.values(plan.categories || {})) {
      for (const item of (cat.items || [])) {
        if (!item.selected) continue;
        selectedEntries += 1;
        if (item.action !== ACTIONS.SYNTHESIZE) sourceOut += 1;
      }
    }
    const allDropped = sourceOut === 0 && plan.totalSourceFiles > 0;
    report.convertible = {
      planOk: true,
      sourceEntries: plan.totalSourceFiles,
      selectedEntries,
      outputEntries: plan.expectedOutputFiles,
      allDropped,
      reason: allDropped ? '所有源条目都会被丢弃' : '',
    };
    if (allDropped) report.warnings.push('所有源条目都会被丢弃，转换后没有可导入内容');
  } catch (err) {
    report.convertible = {
      planOk: false, sourceEntries: 0, selectedEntries: 0, outputEntries: 0,
      allDropped: false, reason: err?.message || String(err),
    };
    report.warnings.push(`生成转换计划失败：${err?.message || err}`);
  }

  // ---- 结论映射（取最严重者）----
  let verdictCode;
  if (report.zip.isMultiDisk) verdictCode = INSPECT_VERDICTS.MULTI_DISK;
  else if (!report.zip.centralDirOk || cdBoundsBad || localIssues.length > 0) {
    verdictCode = INSPECT_VERDICTS.CENTRAL_DIR_CORRUPT;
  } else if (isEmpty) verdictCode = INSPECT_VERDICTS.EMPTY_PACKAGE;
  else if (report.convertible.planOk && report.convertible.allDropped) {
    verdictCode = INSPECT_VERDICTS.ALL_DROPPED;
  } else if (zeroByteCount > 0) verdictCode = INSPECT_VERDICTS.HAS_EMPTY_ENTRIES;
  else if (isSplit) verdictCode = INSPECT_VERDICTS.SPLIT_PACKAGE;
  else if (report.zip.isZip64) verdictCode = INSPECT_VERDICTS.ZIP64;
  else if (detection.layout === LAYOUTS.UNKNOWN) verdictCode = INSPECT_VERDICTS.UNKNOWN_LAYOUT;
  else verdictCode = INSPECT_VERDICTS.OK;

  return applyVerdict(report, verdictCode);
}
