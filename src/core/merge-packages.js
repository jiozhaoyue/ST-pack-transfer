/**
 * 合并模式：把多个数据包合成一棵图表 / 一个产物。
 *
 * 用户裁定（2026-10-27）：默认仍是「每包一组图表」；只有打开**合并模式**时，
 * 选中的包才合并成一棵树、共用一套勾选 / 分卷 / 压缩 / 目标宿主，并产出一个合并包。
 * 同名路径**遇同名即停**并给出冲突清单，绝不静默覆盖、也不静默多留一份。
 *
 * 本模块属 `src/core/`：禁止 DOM；zip 读写走 `zip-io.js`（vendor zip.js 封装）。
 */
import * as zip from '@zip.js/zip.js';
import { zipIo } from './zip-io.js';
import { buildGroupNodeFromItems, leavesOf } from './chart-model.js';

/**
 * 把多个包的图表树合并成一棵。
 *
 * 叶子 id 带来源包前缀（`leaf:<pkgId>|<path>`），这样两份包出现同名路径时
 * 仍能在树里各占一行（导出阶段再按「同名即停」拦下），勾选状态也不会互相覆盖。
 *
 * @param {Array<{pkgId:string, nodes:Array<object>}>} sources
 * @returns {Array<object>} 合并后的一级节点
 */
export function mergeChartTrees(sources = []) {
  const buckets = new Map();
  for (const source of sources) {
    const pkgId = source?.pkgId;
    if (!pkgId) continue;
    for (const group of source.nodes || []) {
      if (!buckets.has(group.id)) buckets.set(group.id, { def: group, items: [] });
      const bucket = buckets.get(group.id);
      for (const leaf of leavesOf([group])) {
        bucket.items.push({
          path: leaf.path,
          mb: leaf.mb,
          action: leaf.action || '',
          suggest: leaf.suggest,
          pkgId,
        });
      }
    }
  }

  const merged = [];
  for (const { def, items } of buckets.values()) {
    /* 组节点只带 id（`group:<key>`），建树函数还要 key 做目录 id 与建议色查找。 */
    const key = String(def.id || '').startsWith('group:') ? String(def.id).slice(6) : String(def.id || '');
    merged.push(buildGroupNodeFromItems({ ...def, key }, items, {
      pathOf: (item) => item.path,
      mbOf: (item) => Number(item.mb) || 0,
      idOf: (item, path) => `leaf:${item.pkgId}|${path}`,
      extraOf: (item) => ({
        srcPkgId: item.pkgId,
        ...(item.suggest ? { suggest: item.suggest } : {}),
      }),
    }));
  }
  return merged;
}

/**
 * 检出跨来源的同名条目。
 * @param {Array<Array<string>>} namesBySource 每个来源的条目路径列表
 * @returns {Array<{path:string, sources:number[]}>} 冲突清单（按路径排序）
 */
export function findEntryConflicts(namesBySource = []) {
  const owners = new Map();
  namesBySource.forEach((names, index) => {
    for (const name of names || []) {
      if (!owners.has(name)) owners.set(name, []);
      owners.get(name).push(index);
    }
  });
  return [...owners.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([path, sources]) => ({ path, sources }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 合并若干已转换好的包。
 *
 * @param {Array<Blob>} blobs 各包的转换产物
 * @param {{compressionLevel?:number, onProgress?:Function}} [opts]
 * @returns {Promise<{ok:true, blob:Blob, fileCount:number} | {ok:false, conflicts:Array<{path:string,sources:number[]}>}>}
 */
export async function mergeConvertedBlobs(blobs = [], { compressionLevel = 5, onProgress } = {}) {
  const perSource = [];
  for (const blob of blobs) {
    const names = [];
    const entries = [];
    const reader = await zipIo.openReader(blob);
    try {
      for await (const entry of reader.entries()) {
        names.push(entry.fileName);
        entries.push({ name: entry.fileName, data: await entry.read() });
      }
    } finally {
      await reader.close();
    }
    perSource.push({ names, entries });
  }

  const conflicts = findEntryConflicts(perSource.map((source) => source.names));
  if (conflicts.length) return { ok: false, conflicts };

  const target = new zip.BlobWriter('application/zip');
  const writer = await zipIo.createWriter(target, { level: compressionLevel });
  const written = new Set();
  let done = 0;
  const total = perSource.reduce((sum, source) => sum + source.entries.length, 0);
  for (const source of perSource) {
    for (const entry of source.entries) {
      if (written.has(entry.name)) continue;
      written.add(entry.name);
      await writer.add(entry.name, entry.data);
      done += 1;
      if (typeof onProgress === 'function') onProgress(done, total, entry.name);
    }
  }
  await writer.close();
  return { ok: true, blob: await target.getData(), fileCount: written.size };
}
