/**
 * 扩展目录级打包模式（完整 / 清单）—— 纯逻辑，无 DOM。
 *
 * 用户 2026-11-17 最终裁定：
 * - 每个扩展目录行只有两个按钮：完整 / 清单；两个按钮**可以同时点亮**（双选）；
 * - 双选 = 完整实体 + 官方清单条目并存，不引入第三个按钮；
 * - 组级 / 批量级：组内存在完整就点亮完整，存在清单就点亮清单；两者可同时亮；
 * - 单图表与多图表共用同一套逻辑；同一个数据包里允许三种状态并存。
 * - 界面上**不再显示「混合」文字**；模式读数只用于内部判断。
 *
 * 本模块只负责「按扩展目录名查询模式」与「把仅清单扩展折叠成一条 0 体积叶子」，
 * 真正的丢弃动作在 transform.js 里按 `extensionManifestNames` / `extensionFullNames` 执行。
 */

import { extensionUnitName } from './ext-pack.js';

export const EXT_PACK_MODES = Object.freeze({
  FULL: 'full',
  MANIFEST: 'manifest',
  BOTH: 'both',
});

export const EXT_PACK_MIXED = 'mixed';

/** 归一单个模式；未知值一律按完整处理（保持旧行为）。 */
export function normalizeExtPackMode(value) {
  if (value === EXT_PACK_MODES.MANIFEST) return EXT_PACK_MODES.MANIFEST;
  if (value === EXT_PACK_MODES.BOTH) return EXT_PACK_MODES.BOTH;
  return EXT_PACK_MODES.FULL;
}

/** 模式 → 两个独立开关（完整 / 清单可以同时为 true）。 */
export function extPackFlags(mode) {
  const normalized = normalizeExtPackMode(mode);
  return {
    full: normalized === EXT_PACK_MODES.FULL || normalized === EXT_PACK_MODES.BOTH,
    manifest: normalized === EXT_PACK_MODES.MANIFEST || normalized === EXT_PACK_MODES.BOTH,
  };
}

/** 两个独立开关 → 模式；两个都关时回退到完整。 */
export function extPackModeOf(flags = {}) {
  const full = flags.full !== false;
  const manifest = flags.manifest === true;
  if (full && manifest) return EXT_PACK_MODES.BOTH;
  if (manifest) return EXT_PACK_MODES.MANIFEST;
  return EXT_PACK_MODES.FULL;
}

/**
 * 组级 / 批量级读数。
 * `full` / `manifest` 表示「组内是否存在该模式」，所以两个都可以为 true（双选）。
 * @param {Iterable<string>} names
 * @param {(name:string)=>string} modeOf
 */
export function extensionPackModeSummary(names, modeOf = () => EXT_PACK_MODES.FULL) {
  const list = [...new Set([...(names || [])].map(String).filter(Boolean))];
  const flags = list.map((name) => extPackFlags(modeOf(name)));
  return {
    names: list,
    full: flags.some((f) => f.full),
    manifest: flags.some((f) => f.manifest),
    allFull: flags.length > 0 && flags.every((f) => f.full),
    allManifest: flags.length > 0 && flags.every((f) => f.manifest),
    mode: flags.some((f) => f.full) && flags.some((f) => f.manifest)
      ? EXT_PACK_MODES.BOTH
      : (flags.some((f) => f.manifest) ? EXT_PACK_MODES.MANIFEST : EXT_PACK_MODES.FULL),
  };
}

/** 从叶子路径 / id 取扩展目录名。 */
export function extensionNameOfLeaf(node) {
  const path = String(node?.path || '');
  if (path.startsWith('ext:')) return path.slice(4);
  const byPath = extensionUnitName(path);
  if (byPath) return byPath;
  const id = String(node?.id || '');
  const match = /^ext:(.+)$/.exec(id);
  return match ? match[1] : '';
}

function collectNames(node, out) {
  if (!node) return out;
  if (node.leaf || !node.children || node.children.length === 0) {
    const name = extensionNameOfLeaf(node);
    if (name) out.add(name);
    return out;
  }
  for (const child of node.children || []) collectNames(child, out);
  return out;
}

function firstLeaf(node) {
  if (!node) return null;
  if (node.leaf) return node;
  for (const child of node.children || []) {
    const hit = firstLeaf(child);
    if (hit) return hit;
  }
  return null;
}

function dirPrefix(node) {
  const match = /^dir:(?:extensions|globalExtensions):(.+)$/u.exec(String(node?.id || ''));
  return match ? match[1].replace(/\/+$/u, '') : '';
}

/** 目录前缀是否**恰好**是扩展根（而不是 third-party / scripts 这类容器）。 */
function isExtensionRootPrefix(prefix, name) {
  const p = String(prefix || '').replace(/\/+$/u, '');
  if (!p || !name) return false;
  if (p === name) return true;
  return p === `third-party/${name}`
    || p === `scripts/extensions/third-party/${name}`
    || p === `data/extensions/third-party/${name}`
    || p === `public/scripts/extensions/third-party/${name}`
    || p.endsWith(`/third-party/${name}`);
}

function cloneShallow(node) {
  return { ...node, children: (node.children || []).map(cloneShallow) };
}

function recompute(node) {
  if (!node.children || node.children.length === 0) return Number(node.mb) || 0;
  node.mb = node.children.reduce((sum, child) => sum + recompute(child), 0);
  return node.mb;
}

/**
 * 把双模式应用到图表树（返回新树，绝不改 `pkg.nodes`）。
 *
 * - 扩展组节点获得 `extModeScope:'group'` 与 `extModeNames`；
 * - 每个扩展目录根获得 `extModeName` 与 `packMode`（full / manifest / both）；
 * - 仅清单（manifest-only）的扩展目录折叠为一条 `manifestOnly` 叶子（体积 0，勾选镜像目录节点）；
 * - 完整与双选（both）保留完整实体子树，不再把 `.git` 等子目录误判成扩展根。
 *
 * @param {Array<object>} nodes
 * @param {{modeOf?:Function, manifestLabel?:string}} [opts]
 * @returns {Array<object>}
 */
export function applyExtensionPackModes(nodes, {
  modeOf = () => EXT_PACK_MODES.FULL,
  manifestLabel = 'manifest',
} = {}) {
  let touched = false;

  function visitContainer(node) {
    if (!node) return node;
    if (node.leaf || !node.children || node.children.length === 0) {
      const name = extensionNameOfLeaf(node);
      if (!name) return node;
      const mode = normalizeExtPackMode(modeOf(name));
      return {
        ...node,
        extModeName: name,
        packMode: mode,
        ...(mode === EXT_PACK_MODES.MANIFEST ? { manifestOnly: true } : {}),
      };
    }
    const names = collectNames(node, new Set());
    if (names.size === 0) return node;
    const prefix = dirPrefix(node);
    const onlyName = names.size === 1 ? [...names][0] : '';
    const isRoot = names.size === 1 && isExtensionRootPrefix(prefix, onlyName);
    if (!isRoot) {
      const clone = { ...node, children: (node.children || []).map(visitContainer) };
      recompute(clone);
      return clone;
    }
    // 单扩展目录根
    const name = onlyName;
    const mode = normalizeExtPackMode(modeOf(name));
    const clone = { ...node, extModeName: name, packMode: mode };
    if (mode === EXT_PACK_MODES.MANIFEST) {
      const leaf = firstLeaf(node);
      clone.children = [{
        id: `manifest:${name}`,
        mirrorId: node.id,
        label: manifestLabel,
        icon: 'file',
        suggest: node.suggest,
        children: [],
        mb: 0,
        leaf: true,
        path: leaf?.path || '',
        checked: node.checked !== false,
        action: 'DROP',
        manifestOnly: true,
        packMode: EXT_PACK_MODES.MANIFEST,
        extModeName: name,
      }];
      clone.mb = 0;
      return clone;
    }
    clone.children = (node.children || []).map(cloneShallow);
    recompute(clone);
    return clone;
  }

  const out = (nodes || []).map((group) => {
    if (!group || (group.id !== 'group:extensions' && group.id !== 'group:globalExtensions')) {
      return group;
    }
    const names = collectNames(group, new Set());
    if (names.size === 0) return group;
    touched = true;
    const clone = { ...group, children: (group.children || []).map(visitContainer) };
    clone.extModeScope = 'group';
    clone.extModeNames = [...names].sort();
    recompute(clone);
    return clone;
  });
  return touched ? out : nodes;
}

/**
 * 从完整树收集扩展目录名（供导出选项 / 批量栏使用）。
 * @param {Array<object>} nodes
 * @returns {string[]}
 */
export function extensionPackNames(nodes) {
  const names = new Set();
  for (const group of nodes || []) {
    if (!group || (group.id !== 'group:extensions' && group.id !== 'group:globalExtensions')) continue;
    collectNames(group, names);
  }
  return [...names].sort();
}

/**
 * 从完整树列出清单模式的扩展名。
 * @param {Array<object>} nodes
 * @param {(name:string)=>string} modeOf
 * @returns {string[]}
 */
export function manifestExtensionNames(nodes, modeOf) {
  return extensionPackNames(nodes).filter((name) => extPackFlags(modeOf(name)).manifest);
}

/** 需要保留完整实体的扩展名（完整 / 双选）。 */
export function fullExtensionNames(nodes, modeOf) {
  return extensionPackNames(nodes).filter((name) => extPackFlags(modeOf(name)).full);
}
