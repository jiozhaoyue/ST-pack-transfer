/**
 * 全量快照的保留修剪（纯逻辑，2026-11-14 从 index.js 抽出，函数体原样迁移）。
 *
 * 背景（用户 2026-11-09 裁定 D-8）：`full` 模式每次备份一个时间戳快照、互不覆盖，
 * 保留最近 N 份；超出部分连同其分片与清单一并删除。此前该逻辑埋在根控制器里、
 * **没有任何单测**——「自动化云存储（含修剪）」要求它可测 ⇒ 抽到 core 层。
 *
 * 判定口径：
 * - 快照的识别依据是 `<base>.manifest.json` 条目（与 transfer-runner 的落盘命名同源）；
 * - 排序键优先取清单里的 `createdAt`，缺了回落条目的 `lastModified`（不伪造时间）；
 * - 列表能力不可用（如 WebDAV 服务器禁 PROPFIND）⇒ **跳过修剪，不阻断备份**。
 */
import { chunkKey, manifestKey, parseManifest } from './transfer-plan.js';

export const FULL_KEEP_DEFAULT = 10;

/**
 * 删除超出保留数的全量快照。
 * @param {{list?:Function, get:Function, remove:Function}} target 传输目标（createTransferTarget 产物）
 * @param {{prefix?:string, keep?:number}} [options] prefix 为云端目录前缀；keep 保留份数（≥1）
 * @returns {Promise<{ok:boolean, removed:string[], code?:string}>}
 */
export async function pruneFullSnapshots({ target, prefix = '', keep = FULL_KEEP_DEFAULT } = {}) {
  const limit = Math.max(1, Math.trunc(Number(keep) || FULL_KEEP_DEFAULT));
  if (typeof target?.list !== 'function') return { ok: false, removed: [], code: 'list-unavailable' };
  const listPrefix = prefix ? `${prefix}/snapshots/` : 'snapshots/';
  const listed = await target.list(listPrefix);
  if (!listed?.ok) return { ok: false, removed: [], code: listed?.code || listed?.message || 'list-unavailable' };

  const map = new Map();
  for (const item of listed.items || []) {
    if (!/\.manifest\.json$/i.test(item.key)) continue;
    const base = item.key.slice(0, -'.manifest.json'.length);
    const man = await target.get(item.key);
    const parsed = man?.ok && man.bytes ? parseManifest(new TextDecoder().decode(man.bytes)) : null;
    map.set(base, { key: base, createdAt: parsed?.createdAt || item.lastModified || '' });
  }

  const sorted = [...map.values()].sort(
    (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  const removed = [];
  for (const item of sorted.slice(limit)) {
    const man = await target.get(manifestKey(item.key));
    const parsed = man?.ok && man.bytes ? parseManifest(new TextDecoder().decode(man.bytes)) : null;
    if (parsed) {
      for (const chunk of parsed.chunks) await target.remove(chunkKey(item.key, chunk.index));
    }
    await target.remove(manifestKey(item.key));
    await target.remove(item.key);
    removed.push(item.key);
  }
  return { ok: true, removed };
}
