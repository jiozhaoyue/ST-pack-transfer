/**
 * 内容寻址备份集（纯逻辑）
 *
 * 形态（用户 2026-11-09 裁定 D-8）：
 *   sets/<set>/index.json           对象总账，只增不改
 *   sets/<set>/objects/<sha256>     条目内容，按内容寻址、跨快照共享
 *   sets/<set>/snapshots/<ts>.json  每版**完整**清单（含当时全部条目）
 *
 * 关键性质：
 * - 快照清单是完整的 ⇒ 任意一张都能独立恢复，不依赖快照顺序，没有差量链；
 * - 对象按 sha256 共享 ⇒ 同一文件只存一份，第二次备份只传新增/修改；
 * - 本模块只做纯逻辑与 ZIP 读取，网络与加密在 `src/app/backup-set-runner.js`。
 *
 * 分层约束：`src/core/`，禁止 DOM / fetch / 平台判断。
 */

import { zipIo } from './zip-io.js';

export const BACKUP_INDEX_SCHEMA = 1;
export const BACKUP_SNAPSHOT_SCHEMA = 1;

/** `2026-11-09 18:30:00` → `20261109-183000`（文件名安全、可按字典序排时间）。 */
export function timestampName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** 路径段清洗：去掉斜杠、冒号、引号、空白等文件名非法字符。 */
export function safeSegment(text, fallback = 'pack') {
  const cleaned = String(text || '')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

/** 相对 setBase 的快照 key；加密时追加 `.spt` 后缀。 */
export function snapshotFileName(ts, encrypted = false) {
  return `snapshots/${ts}.json${encrypted ? '.spt' : ''}`;
}

/** 相对 setBase 的对象 key。 */
export function objectName(sha256) {
  return `objects/${String(sha256 || '').toLowerCase()}`;
}

export function buildIndex({
  set,
  encrypted = false,
  salt = '',
  objects = {},
  snapshots = [],
  latest = '',
}) {
  return {
    schema: BACKUP_INDEX_SCHEMA,
    set: String(set || ''),
    encrypted: Boolean(encrypted),
    salt: String(salt || ''),
    objects: { ...objects },
    snapshots: (Array.isArray(snapshots) ? snapshots : []).map((s) => ({
      ts: String(s.ts || ''),
      key: String(s.key || ''),
      entries: Math.max(0, Math.trunc(Number(s.entries) || 0)),
      size: Math.max(0, Math.trunc(Number(s.size) || 0)),
      createdAt: String(s.createdAt || ''),
    })),
    latest: String(latest || ''),
    updatedAt: new Date().toISOString(),
  };
}

export function parseIndex(raw) {
  const obj = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!obj || typeof obj !== 'object' || obj.schema !== BACKUP_INDEX_SCHEMA) return null;

  const objects = {};
  for (const [sha, value] of Object.entries(obj.objects || {})) {
    if (!/^[0-9a-f]{64}$/i.test(sha)) continue;
    objects[sha.toLowerCase()] = {
      size: Math.max(0, Math.trunc(Number(value?.size) || 0)),
    };
  }

  const snapshots = (Array.isArray(obj.snapshots) ? obj.snapshots : [])
    .filter((s) => s && typeof s.key === 'string' && s.key)
    .map((s) => ({
      ts: String(s.ts || ''),
      key: String(s.key || ''),
      entries: Math.max(0, Math.trunc(Number(s.entries) || 0)),
      size: Math.max(0, Math.trunc(Number(s.size) || 0)),
      createdAt: String(s.createdAt || ''),
    }));

  return {
    schema: BACKUP_INDEX_SCHEMA,
    set: String(obj.set || ''),
    encrypted: Boolean(obj.encrypted),
    salt: String(obj.salt || ''),
    objects,
    snapshots,
    latest: String(obj.latest || ''),
    updatedAt: String(obj.updatedAt || ''),
  };
}

export function buildSnapshot({ set, ts, source = {}, entries = [] }) {
  return {
    schema: BACKUP_SNAPSHOT_SCHEMA,
    set: String(set || ''),
    ts: String(ts || ''),
    source: {
      kind: String(source.kind || 'pack'),
      name: String(source.name || ''),
    },
    entries: (Array.isArray(entries) ? entries : []).map((entry) => ({
      path: String(entry.path || ''),
      sha256: String(entry.sha256 || '').toLowerCase(),
      size: Math.max(0, Math.trunc(Number(entry.size) || 0)),
      crc32: entry.crc32 == null ? null : Number(entry.crc32),
    })),
    createdAt: new Date().toISOString(),
  };
}

export function parseSnapshot(raw) {
  const obj = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!obj || typeof obj !== 'object' || obj.schema !== BACKUP_SNAPSHOT_SCHEMA) return null;
  if (!Array.isArray(obj.entries)) return null;

  // 快照是恢复的唯一依据：任一条目形状不对就整体拒绝，绝不静默丢条目。
  const entries = [];
  for (const entry of obj.entries) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) return null;
    if (!/^[0-9a-f]{64}$/i.test(String(entry.sha256 || ''))) return null;
    entries.push({
      path: String(entry.path),
      sha256: String(entry.sha256).toLowerCase(),
      size: Math.max(0, Math.trunc(Number(entry.size) || 0)),
      crc32: entry.crc32 == null ? null : Number(entry.crc32),
    });
  }
  if (!entries.length) return null;

  return {
    schema: BACKUP_SNAPSHOT_SCHEMA,
    set: String(obj.set || ''),
    ts: String(obj.ts || ''),
    source: {
      kind: String(obj.source?.kind || 'pack'),
      name: String(obj.source?.name || ''),
    },
    entries,
    createdAt: String(obj.createdAt || ''),
  };
}

/**
 * 打开一个 ZIP，返回条目会话。
 *
 * ⚠️ `read()` 依赖 reader 仍打开：调用方用完必须 `close()`，且不要在 close 后再读。
 * @param {Blob|File|string} blob
 */
export async function openEntrySession(blob) {
  const reader = await zipIo.openReader(blob);
  const entries = [];
  try {
    for await (const entry of reader.entries()) {
      entries.push({
        path: entry.fileName,
        size: Number(entry.uncompressedSize) || 0,
        crc32: entry.crc32 ?? null,
        read: () => entry.read(),
      });
    }
  } catch (error) {
    await reader.close();
    throw error;
  }
  return {
    entries,
    close: () => reader.close(),
  };
}

/** 上一版快照 → `path → entry`。 */
export function previousEntryMap(snapshot) {
  const map = new Map();
  for (const entry of snapshot?.entries || []) map.set(entry.path, entry);
  return map;
}

/**
 * 能否直接复用上一版的内容哈希：必须 path/size/crc32 三者全等。
 * crc32 缺失时**不跳**（宁可重读重算，不假去重）。
 */
export function shouldReuseEntry(prev, entry) {
  if (!prev?.sha256) return false;
  if (Number(prev.size) !== Number(entry?.size)) return false;
  if (prev.crc32 == null || entry?.crc32 == null) return false;
  return Number(prev.crc32) === Number(entry.crc32);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
