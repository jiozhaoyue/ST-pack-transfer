/**
 * 扩展单元（打包选择的最小粒度）——纯逻辑，无 DOM。
 *
 * 图表树里扩展是一个文件树；「选择哪些扩展」需要把它折成**一行一个扩展**。
 * 五种真实路径形态都要认，否则同一份数据包在 ST / Luker / TT / PT 下会折出不同的名字：
 *   extensions/<n>                          用户级扩展（ST / Luker）
 *   extensions/third-party/<n>              第三方布局
 *   public/scripts/extensions/third-party/<n> 全局扩展
 *   data/extensions/third-party/<n>         TT / PT 落点
 *   _tauritavern/extension-sources/<n>      TT 来源记录
 *
 * `extensions/third-party/<n>` 必须排在 `extensions/<n>` **之前**判定，否则名字会变成
 * `third-party`，整个第三方目录会被折成一个假扩展。
 */

const UNIT_PATTERNS = Object.freeze([
  /^extensions\/third-party\/([^/]+)(?:\/|$)/i,
  /^public\/scripts\/extensions\/third-party\/([^/]+)(?:\/|$)/i,
  /^scripts\/extensions\/third-party\/([^/]+)(?:\/|$)/i,
  /^data\/extensions\/third-party\/([^/]+)(?:\/|$)/i,
  /^_tauritavern\/extension-sources\/([^/]+)(?:\/|$)/i,
  /^extensions\/([^/]+)(?:\/|$)/i,
]);

/**
 * 从 hub 路径取扩展名。
 * @param {string} hubPath
 * @returns {string} 无法识别时返回空串
 */
export function extensionUnitName(hubPath) {
  const p = String(hubPath || '').replace(/\\/g, '/');
  for (const re of UNIT_PATTERNS) {
    const m = re.exec(p);
    if (m && m[1]) return m[1].replace(/\.json$/i, '');
  }
  return '';
}

/**
 * 把扩展组节点折成扩展单元列表。
 *
 * 兼容两种树：
 * - 完整模式：叶子带 `path`（hub 路径），按 `extensionUnitName` 归组；
 * - 仅清单模式：叶子 id 形如 `ext:<name>`，直接用它作单元名。
 *
 * @param {object|null} groupNode `group:extensions` 节点
 * @returns {Array<{name:string, leaves:Array<object>, files:number, mb:number}>}
 */
export function extensionUnitsOf(groupNode) {
  const map = new Map();
  const visit = (node) => {
    if (!node) return;
    if (node.leaf) {
      const path = String(node.path || '');
      const name = path.startsWith('ext:') ? path.slice(4) : extensionUnitName(path);
      if (!name) return;
      let unit = map.get(name);
      if (!unit) {
        unit = { name, leaves: [], files: 0, mb: 0 };
        map.set(name, unit);
      }
      unit.leaves.push(node);
      unit.files += 1;
      unit.mb += Number(node.mb) || 0;
      return;
    }
    for (const child of node.children || []) visit(child);
  };
  visit(groupNode);
  return [...map.values()]
    .map((u) => ({ ...u, mb: Math.round(u.mb * 1000) / 1000 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
