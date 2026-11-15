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

/**
 * 打包模式建议（纯函数，2026-11-15 用户裁定：图表上**每个扩展**都要标注原件/清单建议）。
 *
 * 与打包弹窗「智能推荐」同一启发式，收敛到这里供图表行内徽标与弹窗共用：
 * - 插件自身（pack-transfer）→ **原件**（必须自举运行）；
 * - 无远端地址 → **原件**（目标宿主拉不到）；
 * - 需凭据的远端（登记账号带密钥/用户名，或 URL 内嵌 userinfo）→ **原件**；
 * - 其余公开远端 → **清单**（省空间、可自动拉取）。
 *
 * @param {string} name 扩展名
 * @param {string} url 远端仓库地址（可为空）
 * @param {{hasPrivateCredential?:boolean}} [hints] 调用方注入的凭据线索
 * @returns {{mode:'full'|'manifest', key:'self'|'no-remote'|'private'|'public'}}
 */
export function suggestPackMode(name, url, hints = {}) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('pack-transfer') || lower.includes('st-pack-transfer')) {
    return { mode: 'full', key: 'self' };
  }
  const raw = String(url || '').trim();
  if (!raw) return { mode: 'full', key: 'no-remote' };
  if (hints.hasPrivateCredential || /\/\/[^/@]+@/.test(raw)) {
    return { mode: 'full', key: 'private' };
  }
  return { mode: 'manifest', key: 'public' };
}

