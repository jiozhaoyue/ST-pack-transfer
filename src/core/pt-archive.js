/**
 * PT（PureTavern）官方原生归档 → hub（ST 摊平用户目录）重建。
 *
 * 背景（`10-01` R-11 / `D-23`）：PT 原生归档把数据存成**内部模块模型**
 * `modules/<moduleId>/{records,blobs}/<collection>/<id>.{json,bin}`（见 PT 源码
 * `apps/web/src/features/import-export/application/archive-participant-registry.ts`
 * 的 `archivePath()` 与 `domain/archive.ts`），**不是用户目录路径**。转换到
 * ST/L/TT 布局必须按模块语义**反向重建**用户目录文件。
 *
 * 映射的权威证据是 PT 自己的迁移导入器
 * `features/import-export/tauri-tavern/application/tauri-tavern-import.ts`
 * （ST/TT 文件 → PT 记录/blob），本模块实现其**逆映射**。逐条证据见本仓
 * `.trellis/spec/guides/tavern-datapack-formats.md` §「PT 原生归档重建」。
 *
 * 硬约束（`10-01/design.md` §1、`L1-MR-6`）：本模块**不得**依赖 DOM / `window` /
 * `fetch` / `src/ui/**`，须能在 Node/Vitest 直接运行；IO 只经注入的 `io` 适配器
 * （契约 `{ openReader }`）。
 */

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });
const TEXT_ENCODER = new TextEncoder();

export const PT_ARCHIVE_FORMAT = 'pure-tavern-archive';
export const PT_ARCHIVE_SCHEMA_VERSION = 1;

/** PT 归档 manifest 固定文件名。 */
export const PT_MANIFEST_PATH = 'manifest.json';

/** PT 预设类型 → ST 预设目录（与 PT `tauri-tavern-format.ts` 的 `PRESET_DIRECTORIES` 同源）。 */
export const PT_PRESET_DIRECTORIES = Object.freeze({
  kobold: 'KoboldAI Settings',
  novel: 'NovelAI Settings',
  openai: 'OpenAI Settings',
  textgenerationwebui: 'TextGen Settings',
  instruct: 'instruct',
  context: 'context',
  sysprompt: 'sysprompt',
  reasoning: 'reasoning',
  theme: 'themes',
  'moving-ui': 'movingUI',
  'quick-reply': 'QuickReplies',
});

/** PT 资源集合 → ST 目录前缀（不含前导斜杠；与 PT `ASSET_DIRECTORIES` 同源）。 */
export const PT_ASSET_DIRECTORIES = Object.freeze({
  backgrounds: 'backgrounds',
  'user-avatars': 'User Avatars',
  'user-images': 'user/images',
  attachments: 'user/files',
  library: 'assets',
  sprites: 'characters',
});

/** PT 扩展包在 PT 内的 legacyPath 前缀（`data-tree.ts` 的 `EXTENSION_PACKAGE_PATH_PREFIX`）。 */
const EXTENSION_PACKAGE_PREFIX = '/scripts/extensions/third-party/';

/** 归档条目路径：`modules/<moduleId>/<records|blobs>/<collection>/<id>.<json|bin>`。 */
const PT_ENTRY_RE = /^modules\/([^/]+)\/(records|blobs)\/([^/]+)\/([^/]+)\.(json|bin)$/;

const HEX64_RE = /^[a-f0-9]{64}$/i;

export class PtArchiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PtArchiveError';
    this.code = code;
  }
}

function decodeComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseJsonBytes(bytes) {
  let text = TEXT_DECODER.decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 4 空格缩进 + 尾随换行：与 PT `encodeJson` 及 ST 自身写盘一致。 */
function encodeJson(value) {
  return TEXT_ENCODER.encode(`${JSON.stringify(value, null, 4)}\n`);
}

/**
 * 归档条目路径安全校验（复刻 PT `assertArchivePath`）：拒绝绝对路径、盘符、
 * 反斜杠、`.` / `..` / 空段与控制字符——这些来自用户文件系统，不得变成路径。
 */
export function assertSafeArchivePath(archivePath, maxLength = 500) {
  const fail = (msg) => {
    throw new PtArchiveError('unsafe-path', msg);
  };
  if (!archivePath || archivePath.length > maxLength) fail(`不安全或过长的归档路径: ${archivePath}`);
  if (archivePath.includes('\\') || archivePath.startsWith('/') || /^[a-z]:/iu.test(archivePath)) {
    fail(`归档路径含绝对/盘符形式: ${archivePath}`);
  }
  for (const segment of archivePath.split('/')) {
    if (!segment || segment === '.' || segment === '..') fail(`归档路径含非法段: ${archivePath}`);
  }
  for (const ch of archivePath) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) fail(`归档路径含控制字符: ${archivePath}`);
  }
}

/**
 * 解析并校验 PT 原生归档 manifest。
 * @returns {object|null} 合法 PT manifest；不是 PT 归档（format 不符 / 非 JSON）时返回 `null`；
 *   format 相符但结构非法时抛 `PtArchiveError`。
 */
export function parsePtManifest(bytes) {
  const parsed = parseJsonBytes(bytes);
  if (!isPlainObject(parsed) || parsed.format !== PT_ARCHIVE_FORMAT) return null;
  if (parsed.schemaVersion !== PT_ARCHIVE_SCHEMA_VERSION) {
    throw new PtArchiveError(
      'unsupported-version',
      `不支持的 PT 归档版本: ${String(parsed.schemaVersion)}（本工具支持 ${PT_ARCHIVE_SCHEMA_VERSION}）`,
    );
  }
  if (!Array.isArray(parsed.modules) || !Array.isArray(parsed.files)) {
    throw new PtArchiveError('invalid-manifest', 'PT 归档 manifest 缺少 modules / files 数组');
  }
  for (const mod of parsed.modules) {
    if (!isPlainObject(mod) || typeof mod.moduleId !== 'string') {
      throw new PtArchiveError('invalid-manifest', 'PT 归档模块描述符无效');
    }
  }
  const seen = new Set();
  for (const file of parsed.files) {
    if (!isPlainObject(file)
      || typeof file.path !== 'string'
      || typeof file.moduleId !== 'string'
      || (file.kind !== 'record' && file.kind !== 'blob')
      || typeof file.sha256 !== 'string'
      || !HEX64_RE.test(file.sha256)) {
      throw new PtArchiveError('invalid-file', 'PT 归档文件描述符无效');
    }
    assertSafeArchivePath(file.path);
    const key = file.path.normalize('NFKC').toLowerCase();
    if (seen.has(key)) {
      throw new PtArchiveError('duplicate-path', `PT 归档含重复条目路径: ${file.path}`);
    }
    seen.add(key);
  }
  return parsed;
}

/**
 * 解析一个归档条目路径的模块坐标。
 * @returns {{moduleId:string, kind:'records'|'blobs', collection:string, id:string, ext:string}|null}
 */
export function classifyPtEntry(name) {
  const match = PT_ENTRY_RE.exec(name);
  if (!match) return null;
  return {
    moduleId: decodeComponent(match[1]),
    kind: match[2],
    collection: decodeComponent(match[3]),
    id: decodeComponent(match[4]),
    ext: match[5],
  };
}

async function sha256Hex(bytes) {
  const copy = bytes.slice();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function recordKey(moduleId, collection, id) {
  return `${moduleId}\u001f${collection}\u001f${id}`;
}

/**
 * 把一条 PT 资源记录（`assets/index`）解析成 hub 目标路径。
 * 扩展包（legacyPath 以 `/scripts/extensions/third-party/` 开头）落到 ST 第三方扩展布局。
 */
function assetHubPath(record) {
  const legacyPath = typeof record?.legacyPath === 'string' ? record.legacyPath : '';
  if (!legacyPath) return null;
  const withoutRoot = legacyPath.replace(/^\/+/, '');
  if (legacyPath.startsWith(EXTENSION_PACKAGE_PREFIX)) {
    const rest = legacyPath.slice(EXTENSION_PACKAGE_PREFIX.length);
    return `extensions/third-party/${rest}`;
  }
  if (!withoutRoot) return null;
  return withoutRoot;
}

/**
 * 读取 PT 原生归档并**重建 hub 条目**（ST 摊平用户目录视角）。
 *
 * 两趟读取（zip 读游标不可倒回）：
 *   1) 先读**记录**（JSON，体量小）——它是重建其它一切所需的语义索引；
 *      其中体积可能较大的 `chats/messages` 只登记、不驻留，留到第二趟按需读；
 *   2) 再读**大块**（blob 与 `messages`），逐条 `read()` 后立即 yield ⇒ 峰值 ≈ 单条目。
 *
 * @param {object} params
 * @param {{openReader: function}} params.io IO 适配器（只用到 openReader）
 * @param {Blob|File|string} params.sourcePath 源包
 * @param {(message:string)=>void} [params.onWarning] 警告回调（重建过程中的有损点 / 跳过项）
 * @param {boolean} [params.verifyIntegrity=true] 逐条目校验 sha256；不匹配即抛错（不产出残缺包）
 * @param {boolean} [params.readBlobs=true] 是否读取大块数据；dryRun 预览时可置 false
 * @returns {Promise<{entries: function(): AsyncGenerator, close: function(): Promise<void>,
 *   totalEntries:number, thirdPartyFolders:Set<string>, modules:object}>}
 */
export async function createPtNativeHubReader({
  io,
  sourcePath,
  onWarning,
  verifyIntegrity = true,
  readBlobs = true,
}) {
  if (!io || typeof io.openReader !== 'function') {
    throw new PtArchiveError('no-io', 'createPtNativeHubReader: 需要有效的 io 适配器');
  }
  const warn = typeof onWarning === 'function' ? onWarning : () => {};

  // ---- 第 1 趟：读记录（+ manifest），登记 blob / messages ----
  const records = new Map(); // key → { moduleId, collection, id, value }
  const blobRefs = new Map(); // 条目名 → { moduleId, collection, id }
  const messageRefs = new Map(); // 条目名 → { id }
  const hashByPath = new Map(); // 条目名 → 期望 sha256
  const thirdPartyFolders = new Set();
  let manifest = null;

  {
    const reader = await io.openReader(sourcePath);
    try {
      for await (const entry of reader.entries()) {
        if (entry.isDirectory) {
          entry.skip();
          continue;
        }
        const name = entry.fileName;
        if (name === PT_MANIFEST_PATH) {
          manifest = parsePtManifest(await entry.read());
          continue;
        }
        const info = classifyPtEntry(name);
        if (!info) {
          entry.skip();
          continue;
        }
        if (info.kind === 'blobs') {
          blobRefs.set(name, info);
          entry.skip();
          continue;
        }
        // records
        if (info.moduleId === 'chats' && info.collection === 'messages') {
          messageRefs.set(name, info);
          entry.skip();
          continue;
        }
        const bytes = await entry.read();
        if (verifyIntegrity) await assertEntryHash(name, bytes, manifest, hashByPath);
        records.set(recordKey(info.moduleId, info.collection, info.id), { ...info, value: parseJsonBytes(bytes) });
      }
    } finally {
      await reader.close();
    }
  }

  if (!manifest) {
    throw new PtArchiveError('missing-manifest', 'PT 原生归档缺少 manifest.json');
  }
  // 记录 blob / messages 的期望哈希（第 1 趟只读了记录，这两类留到第 2 趟校验）
  for (const file of manifest.files) {
    if (file.kind === 'blob' || file.path.includes('/messages/')) {
      hashByPath.set(file.path, file.sha256);
    }
  }

  const getRecord = (moduleId, collection, id) => records.get(recordKey(moduleId, collection, id))?.value;

  // ---- 由记录重建 hub 条目（不含 chats：它需要 messages，留到第 2 趟） ----
  const recordEntries = [];

  // characters：avatars blob 即带卡 PNG，1:1 落到 characters/<avatarFile>；cards 记录仅作旁证。
  for (const [, rec] of records) {
    if (rec.moduleId === 'characters' && rec.collection === 'cards') {
      const card = rec.value;
      if (isPlainObject(card) && typeof card.avatarFile === 'string') {
        // 记录里有卡但对应 avatar blob 缺失时，如实登记（避免静默丢角色）。
        const blobName = `modules/characters/blobs/avatars/${encodeURIComponent(card.avatarFile)}.bin`;
        if (!blobRefs.has(blobName)) {
          warn(`角色「${card.avatarFile}」只有卡片记录、缺少头像 blob，无法重建为 PNG，已跳过`);
        }
      }
    }
  }

  // world-books：books.document → worlds/<legacyFileId>.json
  for (const [, rec] of records) {
    if (rec.moduleId === 'world-books' && rec.collection === 'books') {
      const book = rec.value;
      const legacyFileId = typeof book?.legacyFileId === 'string' && book.legacyFileId
        ? book.legacyFileId
        : null;
      if (!legacyFileId || !isPlainObject(book.document)) {
        warn('世界书条目缺少 legacyFileId 或 document，已跳过');
        continue;
      }
      recordEntries.push({ name: `worlds/${legacyFileId}.json`, data: encodeJson(book.document) });
    }
  }

  // presets：documents → <ST 预设目录>/<name>.json
  for (const [, rec] of records) {
    if (rec.moduleId === 'presets' && rec.collection === 'documents') {
      const doc = rec.value;
      const dir = PT_PRESET_DIRECTORIES[doc?.type];
      const name = typeof doc?.name === 'string' ? doc.name : '';
      if (!dir || !name) {
        warn(`预设「${doc?.type ?? '?'}/${name || '?'}」类型或名字无法识别，已跳过`);
        continue;
      }
      recordEntries.push({ name: `${dir}/${name}.json`, data: encodeJson(doc.value) });
    }
  }

  // settings / secrets / stats 单例
  for (const [, rec] of records) {
    if (rec.collection !== 'documents' && rec.collection !== 'store') continue;
    if (rec.moduleId === 'settings' && rec.collection === 'documents' && rec.id === 'current') {
      recordEntries.push({ name: 'settings.json', data: encodeJson(rec.value) });
    } else if (rec.moduleId === 'secrets' && rec.collection === 'store' && rec.id === 'current') {
      recordEntries.push({ name: 'secrets.json', data: encodeJson(rec.value?.secrets ?? {}) });
    } else if (rec.moduleId === 'stats' && rec.collection === 'documents' && rec.id === 'current') {
      recordEntries.push({ name: 'stats.json', data: encodeJson(rec.value) });
    }
  }

  // image-metadata.json：背景分组 + 每图元数据（ST 用它做背景管理器分组）
  const imageMetadata = buildImageMetadata(records);
  if (imageMetadata) recordEntries.push({ name: 'image-metadata.json', data: encodeJson(imageMetadata) });

  // 统计第三方扩展目录名（供 PT 目标迁移时判重），来自扩展包资源记录
  for (const [, rec] of records) {
    if (rec.moduleId !== 'assets' || rec.collection !== 'index') continue;
    const legacyPath = typeof rec.value?.legacyPath === 'string' ? rec.value.legacyPath : '';
    if (legacyPath.startsWith(EXTENSION_PACKAGE_PREFIX)) {
      const rest = legacyPath.slice(EXTENSION_PACKAGE_PREFIX.length);
      const slash = rest.indexOf('/');
      if (slash > 0) thirdPartyFolders.add(rest.slice(0, slash));
    }
  }

  const blobCount = blobRefs.size;
  const totalEntries = recordEntries.length + blobCount + messageRefs.size;

  // 重建出的 hub 条目 → 转换管线可消费的「源条目」形态（与 zip reader 的 entry 同契约）。
  const toEntry = (name, data, size) => ({
    fileName: name,
    isDirectory: false,
    crc32: null,
    uncompressedSize: size ?? data.byteLength,
    skip() {},
    async read() {
      return data;
    },
    async openStream() {
      return new Blob([data]).stream();
    },
  });

  // ---- 第 2 趟：读大块（blob + messages）并重建 ----
  async function* entries() {
    for (const entry of recordEntries) yield toEntry(entry.name, entry.data);

    const reader = await io.openReader(sourcePath);
    try {
      for await (const entry of reader.entries()) {
        if (entry.isDirectory) {
          entry.skip();
          continue;
        }
        const name = entry.fileName;
        const info = classifyPtEntry(name);
        if (!info) {
          entry.skip();
          continue;
        }

        if (info.kind === 'blobs') {
          const hubName = blobHubPath(info, getRecord);
          if (!hubName) {
            entry.skip();
            warn(`无法定位 blob ${name} 对应的用户目录路径，已跳过`);
            continue;
          }
          if (!readBlobs) {
            entry.skip();
            yield toEntry(hubName, new Uint8Array(0), entry.uncompressedSize ?? 0);
            continue;
          }
          const bytes = await entry.read();
          if (verifyIntegrity) await assertEntryHash(name, bytes, manifest, hashByPath);
          yield toEntry(hubName, bytes);
          continue;
        }

        // messages 记录：与对应 sessions 记录合成一个 jsonl
        if (info.moduleId === 'chats' && info.collection === 'messages') {
          const session = getRecord('chats', 'sessions', info.id);
          if (!isPlainObject(session)) {
            entry.skip();
            warn(`聊天消息 ${name} 找不到对应会话记录，已跳过`);
            continue;
          }
          const bytes = await entry.read();
          if (verifyIntegrity) await assertEntryHash(name, bytes, manifest, hashByPath);
          const messages = parseJsonBytes(bytes);
          if (!Array.isArray(messages)) {
            warn(`聊天消息 ${name} 不是数组，已跳过`);
            continue;
          }
          const hubName = chatHubPath(session);
          if (!hubName) {
            warn(`会话 ${info.id} 缺少 ownerAlias/legacyFileName，已跳过`);
            continue;
          }
          const lines = [session.header, ...messages].map((value) => JSON.stringify(value));
          yield toEntry(hubName, TEXT_ENCODER.encode(lines.join('\n')));
          continue;
        }

        entry.skip();
      }
    } finally {
      await reader.close();
    }
  }

  return {
    entries,
    close: async () => {},
    totalEntries,
    thirdPartyFolders,
    manifest,
  };
}

/** 由 blob 坐标 + 记录索引定位 hub 路径。 */
function blobHubPath(info, getRecord) {
  if (info.moduleId === 'characters' && info.collection === 'avatars') {
    // blob id 即头像文件名（`<name>.png`），本身带卡，直接作为 ST 角色卡落位。
    return `characters/${info.id}`;
  }
  if (info.moduleId === 'assets') {
    const record = getRecord('assets', 'index', info.id);
    return assetHubPath(record);
  }
  return null;
}

/** 会话记录 → `chats/<角色目录>/<文件名>.jsonl`。 */
function chatHubPath(session) {
  const ownerAlias = typeof session.ownerAlias === 'string' ? session.ownerAlias : '';
  const legacyFileName = typeof session.legacyFileName === 'string' ? session.legacyFileName : '';
  if (!ownerAlias || !legacyFileName) return null;
  const directory = ownerAlias.replace(/\.png$/i, '');
  return `chats/${directory}/${legacyFileName}`;
}

/** 重建 `image-metadata.json`（背景虚拟分组 + 每图元数据）；无内容时返回 null。 */
function buildImageMetadata(records) {
  const images = {};
  let imageCount = 0;
  for (const [, rec] of records) {
    if (rec.moduleId !== 'assets' || rec.collection !== 'index') continue;
    const record = rec.value;
    if (!isPlainObject(record?.imageMetadata) || typeof record.legacyPath !== 'string') continue;
    const { path: _p, addedTimestamp: _t, ...meta } = record.imageMetadata;
    images[record.legacyPath.replace(/^\/+/, '')] = meta;
    imageCount += 1;
  }
  const folders = [];
  for (const [, rec] of records) {
    if (rec.moduleId !== 'assets' || rec.collection !== 'background-folders') continue;
    const folder = rec.value;
    if (!isPlainObject(folder) || typeof folder.id !== 'string') continue;
    folders.push({
      id: folder.id,
      name: typeof folder.name === 'string' ? folder.name : folder.id,
      thumbnailFile: typeof folder.thumbnailFile === 'string' ? folder.thumbnailFile : '',
    });
  }
  if (imageCount === 0 && folders.length === 0) return null;
  return { images, folders };
}

/** 逐条目 sha256 校验：manifest 有该条目的期望哈希且不匹配即抛错（不产出残缺包）。 */
async function assertEntryHash(name, bytes, manifest, hashByPath) {
  let expected = hashByPath.get(name);
  if (!expected && manifest) {
    const file = manifest.files.find((f) => f.path === name);
    expected = file?.sha256;
    if (expected) hashByPath.set(name, expected);
  }
  if (!expected) return;
  const actual = await sha256Hex(bytes);
  if (actual !== expected.toLowerCase()) {
    throw new PtArchiveError('hash-mismatch', `PT 归档条目校验失败（内容与 manifest 不符）: ${name}`);
  }
}
