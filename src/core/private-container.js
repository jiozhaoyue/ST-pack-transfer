/**
 * 私有配置容器：插件自有、zip 兼容的私有件打包格式。
 *
 * 结构（用户 PRD R5.2 / 约束）：
 *   manifest.json        —— schemaVersion / 来源格式 / 目标格式 / 每个成员的原始路径、类型、字节数
 *   _private/<原路径>    —— 原样保存的私有文件
 *
 * 为什么单独成容器而不是塞进目标包：目标包根目录的 `manifest.json` 是 Luker 自己的
 * schema，混入会冲突。容器与数据包「同行」，各自独立；目标宿主匹配时按 manifest 走原生还原。
 *
 * 本模块属 `src/core/`：禁止 DOM。
 */
import * as zip from '@zip.js/zip.js';
import { zipIo } from './zip-io.js';

export const CONTAINER_MANIFEST = 'manifest.json';
export const CONTAINER_DIR = '_private/';
export const CONTAINER_SCHEMA = 1;
export const CONTAINER_KIND = 'st-pack-transfer/private-container';

/** 私有件类型判定（只看路径，不猜宿主内部实现）。 */
export function classifyPrivateFile(path) {
  const p = String(path || '').toLowerCase();
  if (/(^|\/)secrets\.json$/.test(p)) return 'secrets';
  if (/\.luker-state\./.test(p)) return 'luker-state';
  if (/(^|\/)settings\.json$/.test(p)) return 'settings';
  if (/(^|\/)user\/files\//.test(p)) return 'plugin-data';
  return 'private';
}

/**
 * 生成容器清单。
 * @param {Array<{path:string,sizeBytes?:number}>} files
 * @param {{sourceLayout?:string,targetLayout?:string,createdAt?:number}} [meta]
 */
export function buildManifest(files = [], { sourceLayout = 'unknown', targetLayout = 'unknown', createdAt = Date.now() } = {}) {
  const nativeRestore = Boolean(sourceLayout) && sourceLayout === targetLayout;
  return {
    schemaVersion: CONTAINER_SCHEMA,
    kind: CONTAINER_KIND,
    sourceLayout,
    targetLayout,
    createdAt,
    nativeRestore,
    files: files.map((file) => ({
      path: file.path,
      type: classifyPrivateFile(file.path),
      sizeBytes: Number(file.sizeBytes) || 0,
      nativeRestore,
    })),
  };
}

/** 目标宿主是否可原生完整还原（清单的 target 与当前宿主一致才算）。 */
export function canNativeRestore(manifest, targetLayout) {
  return Boolean(manifest)
    && manifest.schemaVersion === CONTAINER_SCHEMA
    && manifest.nativeRestore === true
    && manifest.targetLayout === targetLayout;
}

/**
 * 打包容器。
 * @param {Array<{path:string, blob:Blob|Uint8Array}>} entries
 * @param {{sourceLayout?:string,targetLayout?:string,createdAt?:number,compressionLevel?:number}} [meta]
 */
export async function packPrivateContainer(entries = [], meta = {}) {
  const manifest = buildManifest(
    entries.map((entry) => ({ path: entry.path, sizeBytes: entry.blob?.size ?? entry.blob?.byteLength ?? 0 })),
    meta,
  );
  const target = new zip.BlobWriter('application/zip');
  const writer = await zipIo.createWriter(target, { level: Number(meta.compressionLevel) || 5 });
  await writer.add(CONTAINER_MANIFEST, new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  for (const entry of entries) {
    const path = String(entry.path || '').replace(/^\/+/, '');
    if (!path) continue;
    const bytes = entry.blob instanceof Uint8Array
      ? entry.blob
      : new Uint8Array(await entry.blob.arrayBuffer());
    await writer.add(CONTAINER_DIR + path, bytes);
  }
  await writer.close();
  return { blob: await target.getData(), manifest };
}

/**
 * 读取容器。坏包 / 缺清单 / schema 不符一律 `{ok:false}`，不抛。
 * @param {Blob|Uint8Array} source
 */
export async function readPrivateContainer(source) {
  let manifest = null;
  const files = [];
  const reader = await zipIo.openReader(source);
  try {
    for await (const entry of reader.entries()) {
      if (entry.fileName === CONTAINER_MANIFEST) {
        try {
          manifest = JSON.parse(new TextDecoder().decode(await entry.read()));
        } catch {
          manifest = null;
        }
        continue;
      }
      if (!entry.fileName.startsWith(CONTAINER_DIR)) continue;
      files.push({
        path: entry.fileName.slice(CONTAINER_DIR.length),
        bytes: await entry.read(),
        sizeBytes: entry.uncompressedSize,
      });
    }
  } catch (err) {
    return { ok: false, reason: 'read-failed', detail: err?.message || String(err) };
  } finally {
    await reader.close();
  }
  if (!manifest || manifest.schemaVersion !== CONTAINER_SCHEMA || manifest.kind !== CONTAINER_KIND) {
    return { ok: false, reason: 'invalid-manifest' };
  }
  return { ok: true, manifest, files };
}
