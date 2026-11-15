import * as zip from '../vendor/zip.js';
import { zipIo } from './zip-io.js';
import { logger } from './logger.js';

/**
 * 包内扩展清理（**只做减法**，2026-11-15 用户裁定）——
 * 从数据包 zip 中移除选中的扩展（实体条目 + 私有清单条目），产出新包。
 *
 * ## 语义边界
 *
 * - **只删不增不改**：除 `_convert/extensions-manifest.json` 被重写（去掉被移除条目）外，
 *   其余条目一律 `addLazy` 流式直通、字节级保持；
 * - **无命中 ⇒ 原样返回**：没有任何 zip 条目与清单条目命中时返回 `{ blob: source, removedFiles: 0 }`，
 *   不做任何 IO（与 `zip-augment` 的常态路径同一纪律）；
 * - 内存纪律与 `zip-augment` 相同：源条目不整条缓冲，直通写入。
 *
 * @module core/ext-prune
 */

/** 清单文件的固定落位（与 `extension-manifest.js` 的产出路径同源） */
const MANIFEST_ENTRY = '_convert/extensions-manifest.json';

/**
 * 判断一条 zip 路径是否属于被移除扩展的实体文件。
 * 匹配规则（大小写不敏感）：路径处于 extensions 子树内，且**任意目录段**命中被移除扩展名——
 * 覆盖 `extensions/<name>/**` 与 `extensions/third-party/<name>/**` 等落位。
 * @param {string} entryName 归一化（正斜杠）后的 zip 条目路径
 * @param {Set<string>} lowered 被移除扩展名（小写）
 */
function isRemovedExtensionFile(entryName, lowered) {
  if (!lowered.size) return false;
  const segments = entryName.toLowerCase().split('/');
  let inExtensions = false;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i] === 'extensions') inExtensions = true;
    else if (inExtensions && lowered.has(segments[i])) return true;
  }
  return false;
}

/**
 * 从数据包 zip 中移除选中的扩展（实体 + 清单条目），产出新 zip Blob。
 *
 * @param {Blob|File} source 源数据包
 * @param {string[]} names 要移除的扩展名列表（清单条目 `name` 字段 / 目录名）
 * @param {object} [opts]
 * @param {number} [opts.compressionLevel=5] 重写清单条目时的压缩等级
 * @param {boolean} [opts.keepManifest=false] **转成清单**（2026-11-15 用户裁定）：
 *   只删实体文件、**保留**清单条目；包内没有清单文件时用 `manifestSeed` 补建。
 * @param {Array<object>} [opts.manifestSeed=[]] keepManifest 且包内无清单文件时的种子条目
 *   （`{name,url,...}`，来自视图层的包清单缓存）
 * @returns {Promise<{blob: Blob, removedFiles: number, removedManifest: number, manifest: object|null}>}
 *   `blob === source` 表示无命中、未做任何改写；`manifest` 为重写后的完整清单对象（无清单文件时为 null）
 */
export async function prunePackageExtensions(source, names, { compressionLevel = 5, keepManifest = false, manifestSeed = [] } = {}) {
  const removed = (Array.isArray(names) ? names : [])
    .map((n) => String(n || '').trim()).filter(Boolean);
  const lowered = new Set(removed.map((n) => n.toLowerCase()));
  if (!lowered.size) return { blob: source, removedFiles: 0, removedManifest: 0, manifest: null };

  const reader = await zipIo.openReader(source);
  const destination = new zip.BlobWriter('application/zip');
  const writer = await zipIo.createWriter(destination, { level: compressionLevel });
  let removedFiles = 0;
  let manifestRaw = null;

  try {
    for await (const entry of reader.entries()) {
      const name = String(entry.fileName || '').replace(/\\/g, '/');
      if (name === MANIFEST_ENTRY) {
        manifestRaw = new TextDecoder().decode(await entry.read());
        continue;
      }
      if (isRemovedExtensionFile(name, lowered)) {
        removedFiles += 1;
        continue;
      }
      writer.addLazy(name, (cb) => {
        entry.openStream().then((stream) => cb(null, stream), (err) => cb(err));
      }, entry.uncompressedSize || 0);
    }

    let manifest = null;
    let removedManifest = 0;
    /* 零命中 ⇒ 不产出新包（不做无谓 IO），原样返回源（与 zip-augment 的常态路径同一纪律） */
    if (!removedFiles) {
      await writer.abort?.();
      return { blob: source, removedFiles: 0, removedManifest: 0, manifest: null };
    }
    if (manifestRaw !== null) {
      try {
        manifest = JSON.parse(manifestRaw);
        const before = Array.isArray(manifest.extensions) ? manifest.extensions.length : 0;
        if (Array.isArray(manifest.extensions)) {
          if (keepManifest) {
            /* 转成清单：实体已删，清单条目原样保留（total 不变） */
            removedManifest = 0;
          } else {
            manifest.extensions = manifest.extensions.filter((m) => {
              const hit = lowered.has(String(m?.name || m?.id || '').trim().toLowerCase());
              if (hit) removedManifest += 1;
              return !hit;
            });
            manifest.total = manifest.extensions.length;
          }
        }
        await writer.add(MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));
      } catch (err) {
        /* 清单不是合法 JSON：按「只删实体」处理，原样保留清单条目 */
        logger.warn(`包内清理：清单解析失败，保留原清单（${err?.message || err}）`);
        manifest = null;
        await writer.add(MANIFEST_ENTRY, manifestRaw);
      }
    } else if (keepManifest) {
      /* 包内本无清单文件：用种子条目补建一份（转成清单的产物必须有清单可装） */
      const seed = (Array.isArray(manifestSeed) ? manifestSeed : [])
        .map((m) => ({ ...m, name: String(m?.name || '').trim() }))
        .filter((m) => m.name && lowered.has(m.name.toLowerCase()));
      manifest = {
        converter: 'ST-pack-transfer',
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        mode: 'manifest',
        total: seed.length,
        extensions: seed,
      };
      await writer.add(MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));
    }

    await writer.close();
    const blob = await destination.getData();
    return { blob, removedFiles, removedManifest, manifest };
  } catch (err) {
    try { await writer.abort?.(); } catch { /* 收尾失败不改变结论 */ }
    throw err;
  } finally {
    try { await reader.close(); } catch { /* 读侧关闭失败不改变结论 */ }
  }
}
