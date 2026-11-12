/**
 * 文件系统（`fs`）引擎适配：包内磁盘条目 ↔ canonical 行。
 *
 * 上游事实（2026-11-12 取证）：
 * - 映射表见 `src/storage/README.md` 的「Repo coverage」。
 * - 聊天文件 = 首行 header + 每行一条消息（`fs-engine-transaction.js:230-236,319-322`）。
 * - 群聊文件名即 chatId，行里 `char_dir=''`、`group_id=文件名`（`fs-engine-transaction.js:380-405`）。
 * - 旁车命名 `<base>.luker-state.<namespace>.json`（`sidecar-naming.js`）。
 * - 预设目录名与 `dir_key` 不同名（`constants.js:47-58`）。
 * - 预设记录在名字不安全或过长时改用 `.luker-preset-records/v1/<hex>/value.json`
 *   （`preset-paths.js` 的 `encodePresetRecordRelativePath`）。
 *
 * 本模块不做 zip IO，只处理「名字 + 文本」；IO 由 engine-bridge 注入。
 */

import {
  ENGINE_KINDS,
  BUCKET_TO_FOLDER,
  FOLDER_TO_BUCKET,
  PRESET_DIR_KEY_TO_FOLDER,
  PRESET_FOLDER_TO_DIR_KEY,
  SIDECAR_INFIX,
  SIDECAR_EXT,
  parseSidecarName,
  sidecarName,
  parseDocValue,
  serializeDocValue,
} from '../engine-model.js';

const PRESET_RECORDS_DIRECTORY = '.luker-preset-records';

/** 去掉 `data/<handle>/` 前缀，统一成用户根下的相对路径。 */
export function relativizeEntryName(name, handle) {
  let rel = String(name || '').replace(/^\/+/, '');
  if (rel.startsWith('data/')) {
    const parts = rel.split('/');
    if (parts.length > 2) rel = parts.slice(2).join('/');
  }
  if (handle && rel.startsWith(`${handle}/`)) rel = rel.slice(handle.length + 1);
  return rel;
}

const encoder = new TextEncoder();
function byteLength(text) {
  return encoder.encode(text).length;
}

function isSafeSegment(value) {
  return value !== '' && value !== '.' && value !== '..' && value !== '.git' && value !== '.DS_Store'
    && !/[\\/\0]/.test(value);
}

export function presetRecordPath(dirKey, kind, name, namespace) {
  const folder = PRESET_DIR_KEY_TO_FOLDER[dirKey];
  if (!folder) return null;
  const fileName = kind === 'preset-state'
    ? sidecarName(name, namespace)
    : `${name}${SIDECAR_EXT}`;
  if (isSafeSegment(fileName) && byteLength(fileName) <= 255) return `${folder}/${fileName}`;
  const tuple = kind === 'preset-state'
    ? ['preset-state', dirKey, name, namespace]
    : ['preset', dirKey, name];
  const hex = Array.from(encoder.encode(JSON.stringify(tuple)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const chunks = hex.match(/.{1,120}/g) || [];
  return `${folder}/${PRESET_RECORDS_DIRECTORY}/v1/${chunks.join('/')}/value.json`;
}

/** 解析预设记录路径（含 hex 规范路径）；不认识返回 null。 */
export function parsePresetRecordPath(relPath) {
  const segments = String(relPath || '').split('/');
  const folder = segments[0];
  const dirKey = PRESET_FOLDER_TO_DIR_KEY[folder];
  if (!dirKey) return null;
  if (segments.length === 2) {
    const file = segments[1];
    if (!file.endsWith(SIDECAR_EXT)) return null;
    const sidecar = parseSidecarName(file);
    if (sidecar) return { kind: 'preset-state', dirKey, name: sidecar.base, namespace: sidecar.namespace };
    return { kind: 'preset', dirKey, name: file.slice(0, -SIDECAR_EXT.length) };
  }
  if (segments[1] !== PRESET_RECORDS_DIRECTORY) return null;
  if (segments[2] !== 'v1') return null;
  const chunks = segments.slice(3, -1);
  if (segments.at(-1) !== 'value.json' || chunks.length === 0) return null;
  if (!chunks.every((chunk) => /^(?:[0-9a-f]{2})+$/.test(chunk) && chunk.length <= 120)) return null;
  const hex = chunks.join('');
  if (hex.length % 2 !== 0) return null;
  let tuple;
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    tuple = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!Array.isArray(tuple) || tuple[1] !== dirKey) return null;
  if (tuple[0] === 'preset' && tuple.length === 3) return { kind: 'preset', dirKey, name: tuple[2] };
  if (tuple[0] === 'preset-state' && tuple.length === 4) {
    return { kind: 'preset-state', dirKey, name: tuple[2], namespace: tuple[3] };
  }
  return null;
}

/** 判断某个相对路径是否由 fs 适配器负责。 */
export function isFsEnginePath(relPath, { presetFolders = Object.values(PRESET_DIR_KEY_TO_FOLDER) } = {}) {
  const p = String(relPath || '');
  if (p === 'settings.json' || p === 'stats.json') return true;
  if (p.startsWith('worlds/') && p.endsWith('.json')) return true;
  if (p.startsWith('groups/') && p.endsWith('.json')) return true;
  if (p.startsWith('chats/') && (p.endsWith('.jsonl') || p.includes(SIDECAR_INFIX))) return true;
  if (p.startsWith('group chats/') && (p.endsWith('.jsonl') || p.includes(SIDECAR_INFIX))) return true;
  for (const [bucketFolder] of Object.entries(FOLDER_TO_BUCKET)) {
    if (p.startsWith(`${bucketFolder}/`) && p.endsWith('.json')) return true;
  }
  for (const folder of presetFolders) {
    if (p.startsWith(`${folder}/`)) return true;
  }
  return false;
}

function chatFileOf(row) {
  if (row.is_group) return `group chats/${row.group_id || row.name}.jsonl`;
  return `chats/${row.char_dir || ''}/${row.name}.jsonl`;
}

function chatFileContent(doc) {
  const header = doc?.header ?? {};
  const body = Array.isArray(doc?.body) ? doc.body : [];
  const lines = [JSON.stringify(header)];
  for (const message of body) lines.push(JSON.stringify(message));
  return `${lines.join('\n')}\n`;
}

function splitChatFile(text) {
  const lines = String(text).split('\n').filter((line) => line.length > 0);
  if (!lines.length) return null;
  try {
    const header = JSON.parse(lines[0]);
    const body = lines.slice(1).map((line) => JSON.parse(line));
    return { header, body };
  } catch {
    return null;
  }
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 一行 canonical 行 → 目标文件条目 `{ name, text }`；不认识返回 null。
 * @param {string} table
 * @param {object} row
 */
export function rowToFsEntry(table, row) {
  switch (table) {
    case 'settings':
      return row.doc ? { name: 'settings.json', text: serializeDocValue(row.doc) } : null;
    case 'stats':
      return row.doc ? { name: 'stats.json', text: serializeDocValue(row.doc) } : null;
    case 'worlds':
      return row.doc && row.name ? { name: `worlds/${row.name}.json`, text: serializeDocValue(row.doc) } : null;
    case 'groups_table':
      return row.doc && row.id ? { name: `groups/${row.id}.json`, text: serializeDocValue(row.doc) } : null;
    case 'named_docs': {
      const folder = BUCKET_TO_FOLDER[row.bucket];
      if (!folder || !row.name || !row.doc) return null;
      return { name: `${folder}/${row.name}.json`, text: serializeDocValue(row.doc) };
    }
    case 'presets': {
      const name = presetRecordPath(row.dir_key, 'preset', row.name);
      return name && row.doc ? { name, text: serializeDocValue(row.doc) } : null;
    }
    case 'preset_states': {
      const name = presetRecordPath(row.dir_key, 'preset-state', row.name, row.namespace);
      return name && row.doc ? { name, text: serializeDocValue(row.doc) } : null;
    }
    case 'chats':
      if (!row.name || !row.doc) return null;
      return { name: chatFileOf(row), text: chatFileContent(row.doc) };
    case 'chat_states': {
      if (!row.name || !row.namespace) return null;
      const chatName = chatFileOf(row);
      const base = chatName.slice(0, -'.jsonl'.length);
      return { name: sidecarName(base, row.namespace), text: serializeDocValue(row.doc) };
    }
    default:
      return null;
  }
}

/**
 * 源包里的一个 fs 条目 → `{ table, row }`；不归本适配器负责返回 null。
 *
 * @param {string} name 相对用户根的路径
 * @param {string} text 文本内容（二进制条目不喂进来）
 * @param {{ handle: string, updatedAt?: number }} ctx
 */
export function fsEntryToRow(name, text, { handle, updatedAt = 0 } = {}) {
  const p = String(name || '');
  const stamp = numOr(updatedAt, 0);

  if (p === 'settings.json') {
    const doc = parseDocValue(text);
    return doc ? { table: 'settings', row: { handle, doc, updated_at: stamp } } : null;
  }
  if (p === 'stats.json') {
    const doc = parseDocValue(text);
    return doc ? { table: 'stats', row: { handle, doc, updated_at: stamp } } : null;
  }
  if (p.startsWith('worlds/') && p.endsWith('.json')) {
    const doc = parseDocValue(text);
    const base = p.slice('worlds/'.length, -'.json'.length);
    return doc && base ? { table: 'worlds', row: { handle, name: base, doc, updated_at: stamp } } : null;
  }
  if (p.startsWith('groups/') && p.endsWith('.json')) {
    const doc = parseDocValue(text);
    const id = p.slice('groups/'.length, -'.json'.length);
    return doc && id ? { table: 'groups_table', row: { handle, id, doc, updated_at: stamp, created_at: stamp } } : null;
  }
  for (const [folder, bucket] of Object.entries(FOLDER_TO_BUCKET)) {
    if (p.startsWith(`${folder}/`) && p.endsWith('.json')) {
      const doc = parseDocValue(text);
      const base = p.slice(folder.length + 1, -'.json'.length);
      if (!doc || !base || base.includes('/')) return null;
      return { table: 'named_docs', row: { handle, bucket, name: base, doc, updated_at: stamp } };
    }
  }
  const preset = parsePresetRecordPath(p);
  if (preset) {
    const doc = parseDocValue(text);
    if (!doc) return null;
    if (preset.kind === 'preset') {
      return {
        table: 'presets',
        row: { handle, dir_key: preset.dirKey, name: preset.name, doc, updated_at: stamp },
      };
    }
    return {
      table: 'preset_states',
      row: { handle, dir_key: preset.dirKey, name: preset.name, namespace: preset.namespace, doc },
    };
  }

  if (p.startsWith('chats/') || p.startsWith('group chats/')) {
    const sidecar = parseSidecarName(p.split('/').pop());
    if (sidecar) {
      const dir = p.slice(0, p.lastIndexOf('/'));
      const fileBase = `${dir}/${sidecar.base}.jsonl`;
      const identity = chatIdentityOf(fileBase);
      if (!identity) return null;
      const doc = parseDocValue(text);
      if (!doc) return null;
      return {
        table: 'chat_states',
        row: {
          handle,
          char_dir: identity.charDir,
          name: identity.name,
          is_group: identity.isGroup,
          group_id: identity.groupId,
          namespace: sidecar.namespace,
          doc,
        },
      };
    }
    if (p.endsWith('.jsonl')) {
      const identity = chatIdentityOf(p);
      if (!identity) return null;
      const doc = splitChatFile(text);
      if (!doc) return null;
      const createdAt = numOr(doc.header?.create_date, stamp);
      return {
        table: 'chats',
        row: {
          handle,
          char_dir: identity.charDir,
          name: identity.name,
          is_group: identity.isGroup,
          group_id: identity.groupId,
          doc,
          updated_at: stamp,
          created_at: createdAt,
        },
      };
    }
  }
  return null;
}

function chatIdentityOf(relPath) {
  if (relPath.startsWith('group chats/')) {
    const rest = relPath.slice('group chats/'.length);
    if (rest.includes('/') || !rest.endsWith('.jsonl')) return null;
    const name = rest.slice(0, -'.jsonl'.length);
    return name ? { charDir: '', name, isGroup: true, groupId: name } : null;
  }
  if (relPath.startsWith('chats/')) {
    const rest = relPath.slice('chats/'.length);
    const segments = rest.split('/');
    if (segments.length !== 2 || !segments[1].endsWith('.jsonl')) return null;
    const name = segments[1].slice(0, -'.jsonl'.length);
    if (!segments[0] || !name) return null;
    return { charDir: segments[0], name, isGroup: false, groupId: '' };
  }
  return null;
}

export const FS_ENGINE_KIND = ENGINE_KINDS.FS;
