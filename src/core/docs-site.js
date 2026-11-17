/**
 * 文档站地址（唯一源）。
 *
 * 用户 2026-11-17 硬性裁定：
 * - 「查看文档」必须跳到**已部署的 jiozhaoyue GitHub Pages 文档站**；
 * - **禁止**使用 localhost、`./docs/` 或当前页面路径拼接（在宿主/独立页会落进错误路径）；
 * - 设置里的自定义 `docsBaseUrl` 只允许绝对 http(s) 地址，否则回退到部署站。
 */

export const DEPLOYED_DOCS_BASE = 'https://jiozhaoyue.github.io/ST-pack-transfer/docs/';

const ABSOLUTE_HTTP = /^https?:\/\//i;

/** 规范化自定义文档基址；非绝对 http(s) 一律回退部署站。 */
export function resolveDocsBase(override = '') {
  const raw = String(override || '').trim();
  if (!ABSOLUTE_HTTP.test(raw)) return DEPLOYED_DOCS_BASE;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/** 生成文档页绝对地址；默认教程页。保留调用方显式扩展名。 */
export function docsPageUrl(page = 'tutorial', override = '') {
  const base = resolveDocsBase(override);
  const clean = String(page || 'tutorial').replace(/^\/+/, '');
  if (!clean) return `${base}tutorial.html`;
  return ABSOLUTE_HTTP.test(clean) ? clean : `${base}${clean.includes('.') ? clean : `${clean}.html`}`;
}
