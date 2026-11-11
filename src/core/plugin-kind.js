/**
 * 插件类型识别（纯逻辑，不 fetch）。
 *
 * 事实依据：酒馆前端扩展目录里必须有 `manifest.json`；服务端插件（`plugins/`）是
 * 带 `package.json` 的 Node 包。因此仓库根同时决定「能装到哪」：
 *
 * | 仓库根文件 | 判定 | 安装位置 |
 * | --- | --- | --- |
 * | `manifest.json` | 前端扩展 | 扩展目录（局部 / 全局） |
 * | 无 `manifest.json` + 有 `package.json` | 服务端插件 | `plugins/`（宿主管理面板） |
 * | 都没有 / 无法解析 | 未知 | 不拦截，按宿主提示如实报错 |
 *
 * **纪律**：识别不出来就是 `unknown`，不得猜成 extension 或 server 去拦截/放行。
 */

export const PLUGIN_KINDS = Object.freeze({
  extension: 'extension',
  server: 'server',
  unknown: 'unknown',
});

/**
 * 按仓库根文件的存在性判定插件类型。
 * @param {{manifest?:unknown, packageJson?:unknown}} [input]
 * @returns {'extension'|'server'|'unknown'}
 */
export function classifyPluginKind({ manifest = null, packageJson = null } = {}) {
  if (isObject(manifest)) return PLUGIN_KINDS.extension;
  if (isObject(packageJson)) return PLUGIN_KINDS.server;
  return PLUGIN_KINDS.unknown;
}

/** 服务端插件（装到扩展目录就是装错位置）。 */
export function isServerPluginKind(kind) {
  return kind === PLUGIN_KINDS.server;
}

/** 前端扩展。 */
export function isExtensionKind(kind) {
  return kind === PLUGIN_KINDS.extension;
}

/** 给界面用的稳定键（翻译由视图层负责）。 */
export function pluginKindLabelKey(kind) {
  if (kind === PLUGIN_KINDS.extension) return 'kindExtension';
  if (kind === PLUGIN_KINDS.server) return 'kindServer';
  return 'kindUnknown';
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
