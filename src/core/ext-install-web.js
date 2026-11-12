/**
 * Web / 独立形态「把扩展装进数据包」的纯决策层。
 *
 * 与宿主形态的分工：宿主形态由宿主服务端克隆进扩展目录；这里没有宿主，
 * 改为把仓库文件写进**当前数据包的源包**，随包导出、恢复后由宿主识别。
 * 落点按源包布局决定，保证 `detectFromReader` / `routeSource` 能把它认成扩展。
 */

/** 布局 → 扩展根前缀 */
const EXT_ROOTS = Object.freeze({
  st: 'extensions/',
  l: 'extensions/',
  tt: 'data/default-user/extensions/',
  unknown: 'extensions/',
});

/**
 * @typedef {{path:string, data:Uint8Array}} RepoFile
 */

/** 仓库名 → 扩展目录名（去非法字符，保留 URL 安全的常见符号） */
export function extensionDirName(repo) {
  const raw = String(repo?.repo || '').trim();
  return raw.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '') || 'extension';
}

/**
 * 校验仓库能不能作为前端扩展安装。
 * @param {RepoFile[]} files
 * @returns {{ok:true, name:string}|{ok:false, reason:'no-manifest'|'server-plugin'|'empty'}}
 */
export function classifyRepoFiles(files) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return { ok: false, reason: 'empty' };
  const has = (name) => list.some((f) => f.path === name);
  if (!has('manifest.json')) {
    return { ok: false, reason: has('package.json') ? 'server-plugin' : 'no-manifest' };
  }
  return { ok: true, name: '' };
}

/**
 * 文件 → 注入条目（目标路径 = 布局前缀 + 扩展名 + 仓库内相对路径）。
 * @param {RepoFile[]} files
 * @param {string} extName 扩展目录名
 * @param {'st'|'l'|'tt'|'unknown'} layout 源包布局
 * @returns {Array<{name:string, data:Uint8Array}>}
 */
export function buildInjectionEntries(files, extName, layout) {
  const root = EXT_ROOTS[layout] || EXT_ROOTS.unknown;
  const dir = String(extName || '').replace(/^\/+|\/+$/g, '');
  if (!dir) return [];
  const out = [];
  const seen = new Set();
  for (const file of Array.isArray(files) ? files : []) {
    const rel = String(file?.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel) continue;
    const name = `${root}${dir}/${rel}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, data: file.data });
  }
  return out;
}

/**
 * 注入后包里的路径前缀（用于日志与报告）。
 * @param {string} extName
 * @param {'st'|'l'|'tt'|'unknown'} layout
 */
export function injectionRoot(extName, layout) {
  return `${EXT_ROOTS[layout] || EXT_ROOTS.unknown}${extName}/`;
}
