/**
 * 扩展目录级打包模式（完整 / 清单）—— 纯逻辑，无 DOM。
 *
 * 用户 2026-11-17 裁定：
 * - 每个扩展目录行只有两个按钮：完整 / 清单，只有一个点亮；
 * - 组级 / 批量级只有三种读数：全完整、全清单、混合（混合时两个按钮都不点亮）；
 * - 单图表与多图表共用同一套逻辑；同一个数据包里允许两种模式并存。
 *
 * 本模块只负责「按扩展目录名查询模式」与「把清单扩展折叠成一条 0 体积叶子」，
 * 真正的丢弃动作在 transform.js 里按 `extensionManifestNames` 执行。
 */

import { extensionUnitName } from './ext-pack.js';

export const EXT_PACK_MODES = Object.freeze({
  FULL: 'full',
  MANIFEST: 'manifest',
});

export const EXT_PACK_MIXED = 'mixed';

/** 归一单个模式；未知值一律按完整处理（保持旧行为）。 */
export function normalizeExtPackMode(value) {
  return value === EXT_PACK_MODES.MANIFEST ? EXT_PACK_MODES.MANIFEST : EXT_PACK_MODES.FULL;
}

/**
 * 组级 / 批量级三态读数。
 * @param {Iterable<string>} names
 * @param {(name:string)=>string} modeOf
 * @returns {'full'|'manifest'|'mixed'}
 */
export function extensionPackModeSummary(names, modeOf = () => EXT_PACK_MODES.FULL) {
  const list = [...new Set([...(names || [])].map(String).filter(Boolean))];
  if (list.length === 0) return EXT_PACK_MODES.FULL;
  const first = normalizeExtPackMode(modeOf(list[0]));
  return list.every((name) => normalizeExtPackMode(modeOf(name)) === first)
    ? first
    : EXT_PACK_MIXED;
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
 * - 每个扩展目录根获得 `extModeName` 与 `packMode`；
 * - 清单模式的扩展目录折叠为一条 `manifestOnly` 叶子（体积 0，勾选镜像目录节点）；
 * - 完整模式的扩展子树原样克隆，不再把 `.git` 等子目录误判成扩展根。
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
  return extensionPackNames(nodes).filter(
    (name) => normalizeExtPackMode(modeOf(name)) === EXT_PACK_MODES.MANIFEST,
  );
}
