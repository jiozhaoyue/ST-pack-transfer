/**
 * 存储图表 · 纯逻辑模型（无 DOM）
 *
 * 职责：把 `plan-preview.js` 产出的真实计划（`categories[].items[]`）折叠成
 * demo 定稿的树结构，并提供三态、勾选汇总、分卷与包名折行判定。
 *
 * 分层（L1-MR-6）：本文件必须能在 Node/Vitest 直接跑，不碰 `window` / `document`。
 * 渲染在 `src/ui/chart-view.js`。
 */

import { isTavernBuiltinAsset } from './builtin-assets.js';
import { AVAILABILITY, deriveExtensionEntry } from './extension-manifest.js';
import { EXTENSION_MODES, GIT_MODES } from './export-modes.js';

export { EXTENSION_MODES, GIT_MODES };

/** 建议保留度（与 demo 的四种图例一一对应）。 */
export const SUGGEST = Object.freeze({
  KEEP: 'keep',
  OPTIONAL: 'optional',
  DROP: 'drop',
  UNKNOWN: 'unknown',
});

/** 分卷单卷容量上下限（MB）。低于下限没有意义，高于上限没必要再拆。 */
export const SPLIT_MIN = 32;
export const SPLIT_MAX = 2048;

/**
 * 一级分组定义（顺序即展示顺序）。
 * 依据父 PRD 附录 A 的真实备份包结构与 R2.3「不得出现其它」。
 */
export const CHART_GROUPS = Object.freeze([
  { key: 'chats', label: '聊天记录', icon: 'chat', suggest: SUGGEST.KEEP },
  { key: 'characters', label: '角色卡', icon: 'user', suggest: SUGGEST.KEEP },
  { key: 'lorebooks', label: '世界书', icon: 'book', suggest: SUGGEST.KEEP },
  { key: 'images', label: '图片', icon: 'image', suggest: SUGGEST.KEEP },
  { key: 'presets', label: '预设与设置', icon: 'sliders', suggest: SUGGEST.KEEP },
  { key: 'extensions', label: '扩展', icon: 'puzzle', suggest: SUGGEST.KEEP },
  { key: 'vectors', label: '向量库', icon: 'db', suggest: SUGGEST.OPTIONAL },
  { key: 'private', label: '私有配置', icon: 'lock', suggest: SUGGEST.KEEP },
  { key: 'backups', label: '备份快照', icon: 'archive', suggest: SUGGEST.DROP },
  { key: 'cache', label: '派生缓存', icon: 'bolt', suggest: SUGGEST.DROP },
  { key: 'native', label: '原生资产', icon: 'shield', suggest: SUGGEST.DROP },
  { key: 'unknown', label: '未识别', icon: 'unknown', suggest: SUGGEST.UNKNOWN },
]);

const GROUP_BY_KEY = new Map(CHART_GROUPS.map((g) => [g.key, g]));

/** 类目 → 一级分组 */
const CATEGORY_GROUP = Object.freeze({
  chats: 'chats',
  characters: 'characters',
  lorebooks: 'lorebooks',
  assets: 'images',
  presets: 'presets',
  settings: 'presets',
  secrets: 'private',
  extensions: 'extensions',
  globalExtensions: 'extensions',
  vectors: 'vectors',
  backups: 'backups',
  cache: 'cache',
  appPrivate: 'private',
  other: 'unknown',
});

/** 宿主私有件判据：Luker 边车、密钥、TT 应用私有目录。 */
export function isPrivateConfigPath(path) {
  const p = String(path || '');
  const base = p.split('/').pop() || p;
  return p.includes('.luker-state.')
    || base === 'secrets.json'
    || p.startsWith('_tauritavern/')
    || p.startsWith('data/_tauritavern/');
}

/**
 * 判定条目的分组键。
 * 私有件优先（R12.3：同一文件不得在两个节点下重复计数）。
 * @param {{category?: string, hubPath?: string, sourcePath?: string}} item
 */
export function groupKeyOf(item) {
  const path = item.hubPath || item.sourcePath || '';
  if (isPrivateConfigPath(path)) return 'private';
  // 酒馆原生默认资产单独成组：正向勾选=保留，取消=不打包（不是「清理」反向开关）
  if (isTavernBuiltinAsset(path)) return 'native';
  return CATEGORY_GROUP[item.category] || 'unknown';
}

/** 建议保留度：显式丢弃类一律 drop；可选类 optional；其余 keep。 */
function suggestOf(groupKey, item) {
  if (item && item.rawAction === 'DROP') return SUGGEST.DROP;
  const group = GROUP_BY_KEY.get(groupKey);
  return group ? group.suggest : SUGGEST.UNKNOWN;
}

/** 去掉一级前缀后的展示路径。 */
function relPathOf(path) {
  const p = String(path || '');
  const idx = p.indexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

/** 字节 → MB（保留三位小数，0 字节保持 0）。 */
export function toMb(bytes) {
  const n = Number(bytes) || 0;
  return n > 0 ? Math.round((n / (1024 * 1024)) * 1000) / 1000 : 0;
}

/** MB → 人类可读。 */
export function fmtMB(mb) {
  const n = Number(mb) || 0;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  if (n >= 1) return `${Math.round(n * 10) / 10} MB`;
  return `${Math.round(n * 1000)} KB`;
}

/**
 * 把真实计划折叠成图表树。
 *
 * @param {{categories?: Record<string, {items?: Array<object>}>}} plan
 * @param {{groupOrder?: string[]}} [opts]
 * @returns {Array<object>} 一级节点数组
 */
export function buildChartTree(plan, opts = {}) {
  const groups = new Map();
  const seen = new Set();

  for (const [categoryKey, bucket] of Object.entries(plan?.categories || {})) {
    for (const item of bucket?.items || []) {
      const path = item.hubPath || item.sourcePath || '';
      if (!path || seen.has(path)) continue; // 去重：同一文件只计一次
      seen.add(path);
      const groupKey = groupKeyOf({ ...item, category: item.category || categoryKey });
      if (!groups.has(groupKey)) groups.set(groupKey, { def: GROUP_BY_KEY.get(groupKey) || GROUP_BY_KEY.get('unknown'), items: [] });
      groups.get(groupKey).items.push(item);
    }
  }

  const order = opts.groupOrder || CHART_GROUPS.map((g) => g.key);
  const nodes = [];
  for (const key of order) {
    const bucket = groups.get(key);
    if (!bucket || bucket.items.length === 0) continue;
    nodes.push(buildGroupNode(bucket.def, bucket.items));
  }
  return nodes;
}

/** 构建一个一级分组节点（内部按目录分层）。 */
function buildGroupNode(def, items) {
  const root = {
    id: `group:${def.key}`,
    label: def.label,
    icon: def.icon,
    suggest: def.suggest,
    children: [],
    mb: 0,
    leaf: false,
  };
  const dirIndex = new Map(); // relPath -> node

  for (const item of items) {
    const path = item.hubPath || item.sourcePath || '';
    const rel = relPathOf(path);
    const parts = rel.split('/').filter(Boolean);
    const fileName = parts.pop() || rel;
    let container = root.children;
    let prefix = '';
    for (const seg of parts) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      const key = `${def.key}:${prefix}`;
      let dir = dirIndex.get(key);
      if (!dir) {
        dir = {
          id: `dir:${key}`,
          label: seg,
          icon: 'folder',
          suggest: def.suggest,
          children: [],
          mb: 0,
          leaf: false,
        };
        dirIndex.set(key, dir);
        container.push(dir);
      }
      container = dir.children;
    }
    container.push({
      id: `leaf:${path}`,
      label: fileName,
      icon: 'file',
      suggest: suggestOf(def.key, item),
      children: [],
      mb: toMb(item.sizeBytes),
      leaf: true,
      path,
      selected: item.selected !== false,
      checked: item.selected !== false,
      action: item.action || '',
      privateConfig: def.key === 'private',
    });
  }

  recomputeMb(root);
  return root;
}

/** 自底向上重算体积。 */
export function recomputeMb(node) {
  if (!node.children || node.children.length === 0) return node.mb || 0;
  node.mb = node.children.reduce((sum, child) => sum + recomputeMb(child), 0);
  return node.mb;
}

/** 遍历所有节点。 */
export function walk(nodes, fn) {
  for (const node of nodes || []) {
    fn(node);
    walk(node.children, fn);
  }
}

/** 收集所有叶子。 */
export function leavesOf(nodes) {
  const out = [];
  walk(nodes, (node) => { if (node.leaf) out.push(node); });
  return out;
}

/** 叶子 id → 选中态 */
export function selectionFromTree(nodes) {
  const map = new Map();
  for (const leaf of leavesOf(nodes)) map.set(leaf.path, leaf.selected !== false);
  return map;
}

/**
 * 把选中态应用回树（供渲染前三态计算）。
 * @param {Array<object>} nodes
 * @param {Map<string, boolean>} selection
 */
export function applySelection(nodes, selection) {
  const visit = (node) => {
    if (node.leaf) {
      node.checked = selection.has(node.path) ? !!selection.get(node.path) : node.selected !== false;
      node.indeterminate = false;
      return node.checked;
    }
    const states = (node.children || []).map(visit);
    const all = states.length > 0 && states.every(Boolean);
    const none = states.length > 0 && states.every((v) => !v);
    node.checked = all;
    node.indeterminate = !all && !none;
    return all;
  };
  for (const node of nodes || []) visit(node);
}

/** 按 id 查节点（深度优先）。 */
export function findNode(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * 从图表节点派生转换器 options（纯函数）。
 *
 * 正向语义：组内任一叶子被勾选 ⇒ 该维度包含；`native` 组反过来映射
 * `pruneBuiltinAssets`（勾选=保留原生资产 ⇒ 不清理）。
 */
export function deriveExportOptions({ nodes = [], isChecked = () => false, ui = {} } = {}) {
  const anyChecked = (groupId) => {
    const group = findNode(nodes, groupId);
    if (!group) return false;
    return leavesOf([group]).some((leaf) => isChecked(leaf));
  };
  const target = String(ui.target || '').toLowerCase();
  const isTt = target === 'tt' || target === 'tauritavern';
  const compression = Number(ui.compression);
  return {
    compressionLevel: Number.isFinite(compression) ? compression : 5,
    extensionMode: ui.extensionMode === EXTENSION_MODES.MANIFEST ? EXTENSION_MODES.MANIFEST : EXTENSION_MODES.FULL,
    gitMode: [GIT_MODES.KEEP, GIT_MODES.MINIMAL, GIT_MODES.STRIP].includes(ui.gitMode) ? ui.gitMode : GIT_MODES.KEEP,
    keepDevFiles: !!ui.keepDev,
    includeBackups: anyChecked('group:backups'),
    includeCache: anyChecked('group:cache'),
    includeAppPrivate: isTt && anyChecked('group:private'),
    pruneBuiltinAssets: !anyChecked('group:native'),
  };
}

function urlHost(url) {
  try { return new URL(url).host; } catch { return ''; }
}

/** 仅清单模式的扩展子树：一行一个扩展（名称 + 来源可用性）。 */
export function manifestExtensionGroup(extensions = []) {
  const entries = (extensions || [])
    .map((input) => deriveExtensionEntry({ ...input, mode: EXTENSION_MODES.MANIFEST }))
    .filter((entry) => entry.name);
  if (entries.length === 0) return null;
  return {
    id: 'group:extensions',
    label: '扩展',
    icon: 'puzzle',
    suggest: SUGGEST.KEEP,
    mb: 0,
    leaf: false,
    children: entries.map((entry) => {
      const installable = entry.availability === AVAILABILITY.INSTALLABLE;
      return {
        id: `ext:${entry.name}`,
        label: entry.displayName || entry.name,
        icon: 'puzzle',
        suggest: installable ? SUGGEST.KEEP : SUGGEST.UNKNOWN,
        children: [],
        mb: 0,
        leaf: true,
        path: `ext:${entry.name}`,
        selected: installable,
        checked: installable,
        badge: installable ? urlHost(entry.url) : '无地址',
        url: entry.url,
        availability: entry.availability,
      };
    }),
  };
}

/** 按扩展模式返回图表树：完整=原始树；仅清单=用扩展条目替换扩展组。 */
export function chartTreeFor(pkg, extensionMode = EXTENSION_MODES.FULL) {
  const nodes = pkg?.nodes || [];
  if (extensionMode !== EXTENSION_MODES.MANIFEST) return nodes;
  const manifest = manifestExtensionGroup(pkg?.extensions || []);
  const idx = nodes.findIndex((node) => node.id === 'group:extensions');
  if (!manifest) return nodes.filter((node) => node.id !== 'group:extensions');
  const out = nodes.slice();
  if (idx >= 0) out[idx] = manifest;
  else out.push(manifest);
  return out;
}

/** 选中汇总（只数叶子）。 */
export function sumSelected(nodes) {
  let mb = 0;
  let count = 0;
  for (const leaf of leavesOf(nodes)) {
    if (leaf.checked) { mb += leaf.mb || 0; count += 1; }
  }
  return { mb: Math.round(mb * 1000) / 1000, count };
}

/**
 * 分卷下钻：某节点比单卷上限大时继续拆到子项。
 * @returns {Array<{path: object[], node: object, mb: number}>}
 */
export function splitChunks(nodes, limit, path = []) {
  const out = [];
  for (const node of nodes || []) {
    if (!node.checked) continue;
    if ((node.mb || 0) > limit && node.children && node.children.length) {
      out.push(...splitChunks(node.children, limit, path.concat([node])));
    } else {
      out.push({ path, node, mb: node.mb || 0 });
    }
  }
  return out;
}

/** 把某卷碎片重建成完整树（祖先按需补出）。 */
export function buildVolumeTree(chunks) {
  const roots = [];
  const index = new Map();
  for (const chunk of chunks) {
    let container = roots;
    let keyPath = '';
    for (const ancestor of chunk.path) {
      keyPath += `/${ancestor.id}`;
      let hit = index.get(keyPath);
      if (!hit) {
        hit = { ...ancestor, children: [], mb: 0 };
        index.set(keyPath, hit);
        container.push(hit);
      }
      container = hit.children;
    }
    container.push({ ...chunk.node, children: (chunk.node.children || []).map((child) => ({ ...child, children: [] })) });
  }
  const recompute = (arr) => {
    for (const node of arr) {
      if (node.children && node.children.length) {
        recompute(node.children);
        node.mb = node.children.reduce((sum, child) => sum + child.mb, 0);
      }
    }
  };
  recompute(roots);
  return roots;
}

/** 解析分卷输入（'' → 0）。 */
export function splitLimitOf(raw) {
  const value = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value));
}

/**
 * 按单卷上限切分。
 * @param {Array<object>} nodes 已应用选中态的树
 * @param {number} totalMb 整包体积
 * @param {number} limit 单卷上限（0 = 不分卷）
 */
export function volumesOf(nodes, totalMb, limit) {
  if (!limit || totalMb <= limit) {
    return [{ i: 1, n: 1, mb: Math.round(totalMb * 10) / 10, nodes, over: false }];
  }
  const chunks = splitChunks(nodes, limit, []);
  const buckets = [];
  let cur = { mb: 0, chunks: [] };
  for (const chunk of chunks) {
    // 0 字节节点不单独开卷
    if (cur.chunks.length && chunk.mb > 0 && cur.mb + chunk.mb > limit) {
      buckets.push(cur);
      cur = { mb: 0, chunks: [] };
    }
    cur.chunks.push(chunk);
    cur.mb += chunk.mb;
  }
  if (cur.chunks.length) buckets.push(cur);
  return buckets.map((bucket, idx) => ({
    i: idx + 1,
    n: buckets.length,
    mb: Math.round(bucket.mb),
    nodes: buildVolumeTree(bucket.chunks),
    over: bucket.mb > limit + 0.5,
  }));
}

/**
 * 包名折行判定（只允许尾行 ≥ 45% 时折两行）。
 * @param {number} needWidth 整名渲染宽度
 * @param {number} availWidth 可用宽度
 */
export function shouldWrapTwoLines(needWidth, availWidth) {
  const avail = Math.max(1, Number(availWidth) || 1);
  const lines = (Number(needWidth) || 0) / avail;
  return lines > 1.05 && (lines % 1) >= 0.45;
}

/** 两区各自按导入时间编号（删除后不重排）。 */
export function assignSequence(packages) {
  const map = {};
  for (const zone of ['import', 'export']) {
    packages
      .filter((pkg) => pkg.zone === zone)
      .slice()
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .forEach((pkg, idx) => {
        map[pkg.id] = `${zone === 'import' ? '导入' : '导出'}${String(idx + 1).padStart(2, '0')}`;
      });
  }
  return map;
}

/** 序号里的两位数字（压在图标角上）。 */
export function seqNum(label) {
  return String(label || '--').replace(/^(导入|导出)/, '');
}
