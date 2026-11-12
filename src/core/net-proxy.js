/**
 * 可选 CORS 代理（纯逻辑）。
 *
 * 事实边界（2026-11-12 核对 Luker `docs/guide/configuration.md`）：
 * - Luker/SillyTavern 的 `requestProxy` 是**服务端** config.yaml 项，只影响服务端出站请求，
 *   需要能编辑服务端文件并重启；浏览器端拿不到，也改不了。
 * - `enableCorsProxy` 同样只能改 config.yaml。
 * - 浏览器没有任何 API 能直接使用 SOCKS / HTTP 代理，插件只能把请求转发到一个
 *   **HTTP 可达、且自己带 CORS 头**的转发服务。
 *
 * 因此这里只做「用户自填转发地址」：留空即直连，不猜测、不探测宿主配置。
 */

/**
 * 归一代理地址：去空白、补协议；末尾多个斜杠收敛成一个（保留单个斜杠用于
 * 识别「路径前缀型」代理，如 `https://cors.example/`）。
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeProxyUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/{2,}$/, '/');
}

/**
 * 把目标地址改写为经代理访问。三种约定（按顺序判断）：
 * 1. 代理地址含 `{url}` 占位符 → 替换为编码后的目标；
 * 2. 以 `=` 结尾（如 `https://proxy.example/?url=`）→ 直接追加编码后的目标；
 * 3. 以 `/` 结尾 → 追加原样目标（路径前缀型，如 `https://cors.example/`）；
 * 4. 其它 → 追加 `?url=` / `&url=`。
 * @param {string} url 目标地址
 * @param {string} proxyUrl 代理地址；空表示直连
 * @returns {string}
 */
export function applyProxy(url, proxyUrl) {
  const target = String(url || '');
  const proxy = normalizeProxyUrl(proxyUrl);
  if (!target || !proxy) return target;
  if (proxy.includes('{url}')) {
    return proxy.replace('{url}', encodeURIComponent(target));
  }
  if (proxy.endsWith('=')) return `${proxy}${encodeURIComponent(target)}`;
  if (proxy.endsWith('/')) return `${proxy}${target}`;
  const sep = proxy.includes('?') ? '&' : '?';
  return `${proxy}${sep}url=${encodeURIComponent(target)}`;
}
