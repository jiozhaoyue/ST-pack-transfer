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

/**
 * 是否为可用的绝对 http(s) 地址。
 *
 * 仅靠前缀正则不够：`http://` 这种只有协议、没有主机的输入也会通过，
 * 直接当 href 会跳到空目标。这里再用 URL 解析确认协议与主机都在。
 */
export function isAbsoluteHttpUrl(value = '') {
  const raw = String(value || '').trim();
  if (!ABSOLUTE_HTTP.test(raw)) return false;
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
}

/**
 * 解析文档基址并带出判定结果，供 UI 提示用。
 *
 * - `custom`：用户填了合法绝对 http(s)，按钮跳它的地址；
 * - `invalid`：用户填了内容但不是合法绝对 http(s)（含 `http://` 这类缺主机的输入），
 *   此时 `base` 回退部署站；调用方必须把这件事显式告诉用户，不能静默替换；
 * - 留空不算 invalid：留空的语义就是「用部署站」。
 *
 * @param {string} [override]
 * @returns {{ base: string, custom: boolean, invalid: boolean, raw: string }}
 */
export function resolveDocsTarget(override = '') {
  const raw = String(override || '').trim();
  if (!raw) return { base: DEPLOYED_DOCS_BASE, custom: false, invalid: false, raw };
  if (!isAbsoluteHttpUrl(raw)) return { base: DEPLOYED_DOCS_BASE, custom: false, invalid: true, raw };
  return { base: raw.endsWith('/') ? raw : `${raw}/`, custom: true, invalid: false, raw };
}

/** 规范化自定义文档基址；非绝对 http(s) 一律回退部署站。 */
export function resolveDocsBase(override = '') {
  return resolveDocsTarget(override).base;
}

/** 生成文档页绝对地址；默认教程页。保留调用方显式扩展名。 */
export function docsPageUrl(page = 'tutorial', override = '') {
  const base = resolveDocsBase(override);
  const clean = String(page || 'tutorial').replace(/^\/+/, '');
  if (!clean) return `${base}tutorial.html`;
  return ABSOLUTE_HTTP.test(clean) ? clean : `${base}${clean.includes('.') ? clean : `${clean}.html`}`;
}
