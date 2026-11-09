/**
 * 内容寻址备份集执行器（S3 / WebDAV 共用）
 *
 * 与 `transfer-runner` 的分工：
 * - `transfer-runner` 负责**单对象分片**（断点、续传、逐片加密）；
 * - 本文件负责**备份集语义**：条目指纹、对象去重、快照清单、保留策略、恢复装配。
 *
 * 不变量：
 * - 对象 key = 明文的 sha256，跨快照共享；只增不改。
 * - 快照清单是**完整**的（列出该版全部条目），所以恢复不依赖快照顺序。
 * - 加密只影响对象与快照的字节，不影响 key：同一明文只加密一次并复用。
 */

import { sha256Hex } from './transfer-runner.js';
import { zipIo } from '../core/zip-io.js';
import {
  buildIndex,
  buildSnapshot,
  objectName,
  parseIndex,
  parseSnapshot,
  previousEntryMap,
  safeSegment,
  shouldReuseEntry,
  snapshotFileName,
  timestampName,
} from '../core/backup-set.js';
import {
  bytesToHex,
  decryptWithKey,
  deriveKeyFromPassphrase,
  encryptWithKey,
  hexToBytes,
  randomBytes,
  SALT_LEN,
} from '../core/s3-crypto.js';

const INDEX_FILE = 'index.json';
const REGISTRY_FILE = 'sets/index.json';

const decode = (bytes) => new TextDecoder().decode(bytes);
const encode = (text) => new TextEncoder().encode(text);
const jsonBytes = (value) => encode(JSON.stringify(value));

async function ensurePath(target, path) {
  if (typeof target.ensureCollection !== 'function') return true;
  const result = await target.ensureCollection(path);
  return result?.ok !== false;
}

async function readIndex(target, setBase) {
  const result = await target.get(`${setBase}/${INDEX_FILE}`);
  if (!result?.ok || !result.bytes) {
    return { ok: false, code: result?.status === 404 ? 'index-missing' : 'index-unreadable', status: result?.status };
  }
  const index = parseIndex(decode(result.bytes));
  if (!index) return { ok: false, code: 'index-corrupt' };
  return { ok: true, index };
}

/**
 * 上传一个备份集快照。
 *
 * @param {object} params
 * @param {object} params.target createTransferTarget 产物
 * @param {string} params.setBase 备份集根 key（含用户前缀）
 * @param {string} params.setName 备份集显示名
 * @param {Array<{path:string,size:number,crc32:number|null,read:Function}>} params.entries
 * @param {string} [params.sourceName] 源包名（写进快照）
 * @param {string} [params.passphrase] 非空即启用加密
 * @param {number} [params.retention=10] 保留最近 N 张快照
 */
export async function uploadBackupSet({
  target,
  setBase,
  setName,
  entries,
  sourceName = '',
  passphrase = '',
  retention = 10,
  onProgress,
  signal,
  crypto = globalThis.crypto,
} = {}) {
  if (!target?.ready) return { ok: false, code: 'not-configured' };
  if (!Array.isArray(entries) || !entries.length) return { ok: false, code: 'empty-package' };

  await ensurePath(target, setBase);
  await ensurePath(target, `${setBase}/objects`);
  await ensurePath(target, `${setBase}/snapshots`);

  const current = await readIndex(target, setBase);
  let index = null;
  if (current.ok) index = current.index;
  else if (current.code !== 'index-missing') return { ok: false, code: current.code, status: current.status };

  const encrypted = Boolean(passphrase);
  if (index?.encrypted && !passphrase) return { ok: false, code: 'passphrase-required' };
  if (index && !index.encrypted && encrypted) return { ok: false, code: 'encryption-mismatch' };

  let salt = null;
  let key = null;
  if (encrypted) {
    salt = index?.salt ? hexToBytes(index.salt) : randomBytes(SALT_LEN, crypto);
    try {
      key = await deriveKeyFromPassphrase(passphrase, salt, { crypto });
    } catch (error) {
      return { ok: false, code: error?.message || 'crypto-unavailable' };
    }
  }

  let previous = null;
  if (index?.latest) {
    const snapResult = await target.get(`${setBase}/${index.latest}`);
    if (snapResult?.ok && snapResult.bytes) {
      let raw = snapResult.bytes;
      if (index.encrypted) {
        try {
          raw = await decryptWithKey(raw, key, { crypto });
        } catch {
          return { ok: false, code: 'bad-passphrase' };
        }
      }
      previous = parseSnapshot(decode(raw));
    }
  }
  const prevMap = previousEntryMap(previous);

  const objects = { ...(index?.objects || {}) };
  const snapshotEntries = [];
  const totalBytes = entries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0);
  let reused = 0;
  let deduped = 0;
  let uploaded = 0;
  let uploadedBytes = 0;

  for (const entry of entries) {
    if (signal?.aborted) return { ok: false, code: 'aborted' };
    const prev = prevMap.get(entry.path);
    let sha = '';
    if (shouldReuseEntry(prev, entry)) {
      sha = prev.sha256;
      reused += 1;
    } else {
      const bytes = await entry.read();
      sha = await sha256Hex(bytes, crypto);
      if (!sha) return { ok: false, code: 'crypto-unavailable' };
      if (!objects[sha]) {
        const payload = encrypted ? await encryptWithKey(bytes, key, salt, { crypto }) : bytes;
        const result = await target.put(`${setBase}/${objectName(sha)}`, payload, {
          contentType: 'application/octet-stream',
        });
        if (!result.ok) {
          return {
            ok: false,
            code: result.code || result.message || 'object-upload-failed',
            status: result.status,
          };
        }
        objects[sha] = { size: Number(entry.size) || bytes.length };
        uploaded += 1;
        uploadedBytes += payload.length;
      } else {
        deduped += 1;
      }
    }
    snapshotEntries.push({
      path: entry.path,
      sha256: sha,
      size: Number(entry.size) || 0,
      crc32: entry.crc32,
    });
    onProgress?.({
      phase: 'uploading',
      done: snapshotEntries.length,
      total: entries.length,
      reused,
      deduped,
      uploaded,
      uploadedBytes,
      totalBytes,
    });
  }

  if (!snapshotEntries.length) return { ok: false, code: 'empty-package' };

  let ts = timestampName();
  const used = new Set((index?.snapshots || []).map((s) => s.ts));
  if (used.has(ts)) {
    let n = 2;
    while (used.has(`${ts}-${n}`)) n += 1;
    ts = `${ts}-${n}`;
  }

  const snapshot = buildSnapshot({
    set: setName,
    ts,
    source: { kind: 'pack', name: sourceName },
    entries: snapshotEntries,
  });
  const plainSnapshot = jsonBytes(snapshot);
  const snapRel = snapshotFileName(ts, encrypted);
  const snapPayload = encrypted ? await encryptWithKey(plainSnapshot, key, salt, { crypto }) : plainSnapshot;
  const snapWritten = await target.put(`${setBase}/${snapRel}`, snapPayload, { contentType: 'application/json' });
  if (!snapWritten.ok) {
    return { ok: false, code: snapWritten.code || 'snapshot-upload-failed', status: snapWritten.status };
  }

  const keep = Math.max(1, Math.trunc(Number(retention) || 10));
  const snapshots = [
    ...(index?.snapshots || []),
    {
      ts,
      key: snapRel,
      entries: snapshotEntries.length,
      size: plainSnapshot.length,
      createdAt: new Date().toISOString(),
    },
  ].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  const pruned = [];
  while (snapshots.length > keep) {
    const old = snapshots.shift();
    const removed = await target.remove(`${setBase}/${old.key}`);
    if (!removed?.ok) {
      // 删不掉就保留记录：宁可多留一张，也不让索引指向不存在的快照。
      snapshots.unshift(old);
      break;
    }
    pruned.push(old.ts);
  }

  const nextIndex = buildIndex({
    set: setName,
    encrypted,
    salt: encrypted ? bytesToHex(salt) : '',
    objects,
    snapshots,
    latest: snapRel,
  });
  const indexWritten = await target.put(`${setBase}/${INDEX_FILE}`, jsonBytes(nextIndex), {
    contentType: 'application/json',
  });
  if (!indexWritten.ok) {
    return { ok: false, code: indexWritten.code || 'index-upload-failed', status: indexWritten.status };
  }

  onProgress?.({
    phase: 'done',
    done: entries.length,
    total: entries.length,
    reused,
    deduped,
    uploaded,
    uploadedBytes,
    totalBytes,
  });

  return {
    ok: true,
    encrypted,
    snapshotKey: snapRel,
    snapshotTs: ts,
    entries: snapshotEntries.length,
    uploaded,
    deduped,
    reused,
    uploadedBytes,
    totalBytes,
    pruned,
  };
}

/**
 * 从快照重建一个 ZIP。
 * 任意快照都能独立恢复：它自带全部条目清单，不需要按顺序应用补丁。
 */
export async function restoreBackupSet({
  target,
  setBase,
  snapshotKey = '',
  passphrase = '',
  onProgress,
  signal,
  crypto = globalThis.crypto,
} = {}) {
  if (!target?.ready) return { ok: false, code: 'not-configured' };
  const current = await readIndex(target, setBase);
  if (!current.ok) return { ok: false, code: current.code, status: current.status };
  const index = current.index;

  const encrypted = Boolean(index.encrypted);
  if (encrypted && !passphrase) return { ok: false, code: 'passphrase-required' };
  let key = null;
  if (encrypted) {
    try {
      key = await deriveKeyFromPassphrase(passphrase, hexToBytes(index.salt), { crypto });
    } catch {
      return { ok: false, code: 'bad-passphrase' };
    }
  }

  const rel = String(snapshotKey || '').startsWith(`${setBase}/`)
    ? String(snapshotKey).slice(setBase.length + 1)
    : String(snapshotKey || index.latest);
  if (!rel) return { ok: false, code: 'snapshot-missing' };

  const snapResult = await target.get(`${setBase}/${rel}`);
  if (!snapResult?.ok || !snapResult.bytes) {
    return { ok: false, code: 'snapshot-missing', status: snapResult?.status };
  }
  let raw = snapResult.bytes;
  if (encrypted) {
    try {
      raw = await decryptWithKey(raw, key, { crypto });
    } catch {
      return { ok: false, code: 'bad-passphrase' };
    }
  }
  const snapshot = parseSnapshot(decode(raw));
  if (!snapshot) return { ok: false, code: 'snapshot-corrupt' };

  const writer = await zipIo.createWriter();
  let done = 0;
  for (const entry of snapshot.entries) {
    if (signal?.aborted) {
      await writer.abort();
      return { ok: false, code: 'aborted' };
    }
    const objectResult = await target.get(`${setBase}/${objectName(entry.sha256)}`);
    if (!objectResult?.ok || !objectResult.bytes) {
      await writer.abort();
      return { ok: false, code: 'object-missing', path: entry.path, status: objectResult?.status };
    }
    let bytes = objectResult.bytes;
    if (encrypted) {
      try {
        bytes = await decryptWithKey(bytes, key, { crypto });
      } catch {
        await writer.abort();
        return { ok: false, code: 'bad-passphrase', path: entry.path };
      }
    }
    const actual = await sha256Hex(bytes, crypto);
    if (actual && entry.sha256 && actual !== entry.sha256) {
      await writer.abort();
      return { ok: false, code: 'sha256-mismatch', path: entry.path };
    }
    await writer.add(entry.path, bytes);
    done += 1;
    onProgress?.({ phase: 'restoring', done, total: snapshot.entries.length, path: entry.path });
  }

  const dest = await writer.close();
  const blob = dest && typeof dest.getData === 'function' ? await dest.getData() : dest;
  return {
    ok: true,
    blob,
    name: `${safeSegment(snapshot.set || 'backup', 'backup')}-${snapshot.ts || 'snapshot'}.zip`,
    entries: snapshot.entries.length,
    set: snapshot.set,
    ts: snapshot.ts,
  };
}

/** 删除一张快照；共享对象不动（其它快照仍引用它们）。 */
export async function removeSnapshotFromSet({ target, setBase, snapshotKey = '' } = {}) {
  if (!target?.ready) return { ok: false, code: 'not-configured' };
  const current = await readIndex(target, setBase);
  if (!current.ok) return { ok: false, code: current.code };
  const index = current.index;
  const rel = String(snapshotKey || '').startsWith(`${setBase}/`)
    ? String(snapshotKey).slice(setBase.length + 1)
    : String(snapshotKey || '');
  const snapshots = index.snapshots.filter((s) => s.key !== rel);
  if (snapshots.length === index.snapshots.length) return { ok: false, code: 'snapshot-not-found' };

  const removed = await target.remove(`${setBase}/${rel}`);
  if (!removed?.ok && removed?.status !== 404) {
    return { ok: false, code: removed?.code || 'remove-failed', status: removed?.status };
  }

  const latest = index.latest === rel ? (snapshots[snapshots.length - 1]?.key || '') : index.latest;
  const nextIndex = buildIndex({
    set: index.set,
    encrypted: index.encrypted,
    salt: index.salt,
    objects: index.objects,
    snapshots,
    latest,
  });
  const written = await target.put(`${setBase}/${INDEX_FILE}`, jsonBytes(nextIndex), {
    contentType: 'application/json',
  });
  return written.ok ? { ok: true } : { ok: false, code: 'index-upload-failed' };
}

/** 读取一个备份集的索引（刷新列表用）。 */
export async function readBackupSet({ target, setBase } = {}) {
  if (!target?.ready) return { ok: false, code: 'not-configured' };
  return readIndex(target, setBase);
}

export async function readSetRegistry({ target, prefix = '' } = {}) {
  if (!target?.ready) return { ok: false, code: 'not-configured' };
  const key = prefix ? `${prefix}/${REGISTRY_FILE}` : REGISTRY_FILE;
  const result = await target.get(key);
  if (!result?.ok) {
    if (result?.status === 404) return { ok: true, sets: [] };
    return { ok: false, code: 'registry-unreadable', status: result?.status };
  }
  try {
    const parsed = JSON.parse(decode(result.bytes));
    const sets = (Array.isArray(parsed?.sets) ? parsed.sets : []).filter((s) => s && s.name);
    return { ok: true, sets };
  } catch {
    return { ok: false, code: 'registry-corrupt' };
  }
}

/** 备份成功后更新备份集登记表（一处 GET + 一处 PUT，不依赖 PROPFIND）。 */
export async function updateSetRegistry({
  target,
  prefix = '',
  setName,
  latest = '',
  snapshotCount = 0,
} = {}) {
  if (!target?.ready) return { ok: false, code: 'not-configured' };
  if (!setName) return { ok: false, code: 'set-name-required' };
  const setsDir = prefix ? `${prefix}/sets` : 'sets';
  await ensurePath(target, setsDir);
  const current = await readSetRegistry({ target, prefix });
  const sets = (current.ok ? current.sets : []).filter((s) => s.name !== setName);
  sets.push({
    name: setName,
    latest,
    snapshots: Math.max(0, Math.trunc(Number(snapshotCount) || 0)),
    updatedAt: new Date().toISOString(),
  });
  sets.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const key = prefix ? `${prefix}/${REGISTRY_FILE}` : REGISTRY_FILE;
  const result = await target.put(key, jsonBytes({ schema: 1, sets }), {
    contentType: 'application/json',
  });
  return result.ok ? { ok: true } : { ok: false, code: 'registry-upload-failed', status: result.status };
}
