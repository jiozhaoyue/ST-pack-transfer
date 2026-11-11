/**
 * 资产列表契约（Asset List Contract）
 *
 * 酒馆原生「下载扩展和资源菜单」（Download Extensions & Assets）的 Asset URL
 * 只接受**扁平 JSON 数组**，条目键为 `id / type / name / description / url`。
 * 本模块是该形状的唯一纯逻辑实现点：包内清单与宿主 discover 两条来源都经它归一，
 * 避免 UI 层各自拼装出「看起来像、实际加载失败」的文件。
 *
 * 分层约束：`src/core/`，禁止 DOM / fetch / window。
 */

/** 官方资产类型（与宿主 `assets/index.js` 的 KNOWN_TYPES 一致）。 */
export const ASSET_TYPE = Object.freeze({
  EXTENSION: 'extension',
  CHARACTER: 'character',
  AMBIENT: 'ambient',
  BGM: 'bgm',
  BLIP: 'blip',
});

/** 仅 http(s) 可被宿主在线安装；其余协议一律视为不可用。 */
export function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 从一个扩展描述派生官方资产条目。
 *
 * 只输出官方五键，不把 `version` / `author` 等私有字段塞进 JSON——
 * 宿主会忽略未知键，但多出来的键会让「能否被加载」这件事难以判断。
 * @param {object} ext
 * @returns {{id:string,type:string,name:string,description:string,url:string}|null}
 */
export function extensionToAsset(ext = {}) {
  const url = text(ext.url || ext.homePage || ext.remoteUrl);
  const id = text(ext.id || ext.folder || ext.name);
  const name = text(ext.displayName || ext.name || ext.id || ext.folder);
  if (!id || !name || !isHttpUrl(url)) return null;
  return {
    id,
    type: ASSET_TYPE.EXTENSION,
    name,
    description: text(ext.description),
    url,
  };
}

/**
 * 归一宿主 discover 响应。
 *
 * 接受两种形状：裸数组，或 `{ extensions: [...] }`。**形状不认识时返回 `null`**，
 * 调用方必须如实报「宿主未提供扩展清单」，不得把它当成空清单。
 * @param {unknown} payload
 * @returns {Array<{name:string,sourceType:string,manifest?:object}>|null}
 */
export function normalizeDiscoverResponse(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.extensions) ? payload.extensions : null);
  if (!raw) return null;
  return raw.map((item) => {
    const name = text(item?.name || item?.id);
    if (!name) return null;
    const entry = {
      name,
      sourceType: text(item?.type) || 'local',
    };
    if (item?.manifest && typeof item.manifest === 'object') entry.manifest = item.manifest;
    return entry;
  }).filter(Boolean);
}

/** `third-party/foo` → `foo`；取最后一段作为稳定 id。 */
export function folderNameOf(name) {
  const normalized = text(name).replace(/\\/g, '/').replace(/\/+$/, '');
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

/**
 * 扩展 manifest 的宿主静态地址（站点根绝对路径）。
 * 段级编码，避免宿主返回的目录名带空格或特殊字符时请求失败。
 * @param {string} name discover 返回的 `name`（可能含 `third-party/` 前缀）
 * @returns {string}
 */
export function manifestUrlOf(name) {
  return `/scripts/extensions/${text(name).split('/').map(encodeURIComponent).join('/')}/manifest.json`;
}

/**
 * 从 manifest 派生扩展条目。
 *
 * `url` 缺失时仍保留条目（`url:''`），让调用方能区分
 * 「宿主不支持扩展清单」与「有扩展但没有可导入地址」两种事实。
 * @param {string} folder discover 返回的目录名
 * @param {object} [manifest]
 * @param {{sourceType?:string,url?:string}} [extra]
 */
export function manifestToExtension(folder, manifest = {}, extra = {}) {
  const id = folderNameOf(folder);
  const name = text(manifest.display_name || id);
  return {
    id,
    folder: id,
    name,
    displayName: name,
    description: text(manifest.description),
    version: text(manifest.version),
    author: text(manifest.author),
    url: text(manifest.homePage || manifest.homepage || extra.url),
    sourceType: text(extra.sourceType) || 'local',
    /* 加载顺序事实（只读）：manifest.loading_order；缺失/非法时为 null，调用方必须显示「未提供」。 */
    loadingOrder: Number.isFinite(Number(manifest?.loading_order)) && String(manifest?.loading_order ?? '') !== ''
      ? Number(manifest.loading_order)
      : null,
  };
}

/**
 * 构建官方扁平数组。
 *
 * 只保留带 http(s) 地址的条目；同一 `id` 后到覆盖，最后按名称稳定排序。
 * 返回 `[]` 表示「没有任何可导入项」，调用方必须如实提示，不得伪装成功。
 * @param {Array<object>} extensions
 * @returns {Array<{id:string,type:string,name:string,description:string,url:string}>}
 */
export function buildAssetList(extensions = []) {
  const byId = new Map();
  for (const ext of Array.isArray(extensions) ? extensions : []) {
    const asset = extensionToAsset(ext);
    if (!asset) continue;
    byId.set(asset.id, asset);
  }
  return [...byId.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/** 合并多个资产列表（后到覆盖同 id），输出仍为官方扁平数组。 */
export function mergeAssetLists(...lists) {
  return buildAssetList(lists.flat().filter(Boolean));
}

/**
 * 统计扩展集合的可导入情况。
 * @param {Array<object>} extensions
 * @returns {{total:number,installable:number,missingUrl:number}}
 */
export function summarizeExtensions(extensions = []) {
  const list = Array.isArray(extensions) ? extensions : [];
  const installable = list.filter((ext) => isHttpUrl(ext?.url)).length;
  return {
    total: list.length,
    installable,
    missingUrl: Math.max(0, list.length - installable),
  };
}
