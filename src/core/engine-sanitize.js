/**
 * 恢复前净化：剔除数据库引擎的裸 SQL 转储。
 *
 * 背景（2026-11-11 实测事故）：Luker 数据库模式（PostgreSQL / MySQL / SQLite）导出的
 * 原生备份包含 `_engine_dump.bin` + `_engine_meta.json`。这份转储内硬编码了源实例句柄
 * （如 `default-user`）并直接 `INSERT INTO settings`，跨实例 / 跨引擎恢复时与目标已存在
 * 的主键冲突，服务端抛 `duplicate key value violates unique constraint "settings_pkey"`，
 * 整个恢复失败。
 *
 * 处理原则：**只要能确认包内还有标准便携文件**，就把引擎转储剔除，走宿主官方便携导入通道。
 * 这样 PG→文件系统、文件系统→PG、PG→PG（不兼容）三种方向都不会再触发主键冲突。
 * 只有「纯引擎转储、没有便携文件」的包不能安全剔除——交给调用方如实提示，不假装成功。
 *
 * 本模块属 `src/core/`：禁止 DOM。
 */
import * as zip from '../vendor/zip.js';
import { zipIo } from './zip-io.js';

export const ENGINE_DUMP_ENTRIES = Object.freeze(['_engine_dump.bin', '_engine_meta.json']);

function baseName(name) {
  const n = String(name || '');
  return n.slice(n.lastIndexOf('/') + 1);
}

/** 条目是否属于数据库引擎转储。 */
export function isEngineDumpEntry(name) {
  return ENGINE_DUMP_ENTRIES.includes(baseName(name));
}

/** 包内是否含标准便携数据（用于判断剔除引擎转储后是否还有内容可恢复）。 */
export function isPortableEntry(name) {
  const n = String(name || '').replace(/^\/+/, '');
  if (isEngineDumpEntry(n)) return false;
  return /^data\/[^/]+\/(settings\.json|characters\/|chats\/|groups\/|group chats\/|worlds\/|presets\/|themes\/|backgrounds\/|user\/)/.test(n)
    || /^(settings\.json|characters\/|chats\/|groups\/|group chats\/|worlds\/|presets\/|themes\/|backgrounds\/)/.test(n);
}

/**
 * 读取引擎转储的来源引擎类型（拿不到就返回空串，不猜）。
 * @param {object|null} meta `_engine_meta.json` 的内容
 */
export function engineKindOf(meta) {
  const kind = meta?.kind || meta?.engine || meta?.engineKind;
  return typeof kind === 'string' ? kind : '';
}

/**
 * 恢复前净化一个 zip。
 *
 * @param {Blob|File|Uint8Array|string} source 源数据包
 * @param {{ onProgress?: (done:number,total:number)=>void }} [options]
 * @returns {Promise<{
 *   changed: boolean,
 *   blob: Blob|File|Uint8Array|string,
 *   stripped: string[],
 *   sourceEngine: string,
 *   portable: boolean,
 *   reason?: string,
 * }>}
 */
export async function sanitizeEngineDumpForRestore(source, { onProgress } = {}) {
  const reader = await zipIo.openReader(source);
  const names = [];
  let meta = null;
  try {
    for await (const entry of reader.entries()) {
      names.push(entry.fileName);
      if (baseName(entry.fileName) === '_engine_meta.json') {
        try {
          meta = JSON.parse(new TextDecoder().decode(await entry.read()));
        } catch {
          meta = null;
        }
      }
    }
  } finally {
    await reader.close();
  }

  const stripped = names.filter(isEngineDumpEntry);
  const sourceEngine = engineKindOf(meta);
  if (!stripped.length) {
    return { changed: false, blob: source, stripped: [], sourceEngine, portable: names.some(isPortableEntry) };
  }

  const portable = names.some((name) => !isEngineDumpEntry(name) && isPortableEntry(name));
  if (!portable) {
    // 纯引擎转储：剔除后无内容可恢复。不静默丢弃，也不让宿主去撞主键。
    return { changed: false, blob: source, stripped: [], sourceEngine, portable: false, reason: 'engine-only' };
  }

  const readAgain = await zipIo.openReader(source);
  const target = new zip.BlobWriter('application/zip');
  const writer = await zipIo.createWriter(target, { level: 0 });
  const total = names.length;
  let done = 0;
  try {
    for await (const entry of readAgain.entries()) {
      if (!isEngineDumpEntry(entry.fileName)) {
        writer.addLazy(
          entry.fileName,
          (cb) => { entry.openStream().then((stream) => cb(null, stream), (err) => cb(err)); },
          entry.uncompressedSize,
        );
      }
      done += 1;
      onProgress?.(done, total);
      if (done % 64 === 0) await writer.waitForRoom();
    }
    await writer.close();
  } finally {
    await readAgain.close();
  }

  return {
    changed: true,
    blob: await target.getData(),
    stripped,
    sourceEngine,
    portable: true,
  };
}
