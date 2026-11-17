/**
 * 远程路径安全（S3 / WebDAV 共用）。
 *
 * 背景：`encodeURIComponent('..')` 仍是 `..`，而备份集名可由用户自由输入；
 * 若直接按 `/` 分段拼接，WebDAV 服务端可能把 `..` 解释为上级目录，
 * 从而写到用户填写的前缀目录之外（2026-11-17 功能审计 F-03）。
 *
 * 约束：只做**段级**净化，保留合法的多级相对路径；不做 URL 编码。
 */

/** 仅由点组成的段（`.` / `..` / `...`）一律替换为 `_`。 */
function sanitizeSegment(seg) {
  const s = String(seg ?? '');
  // 控制字符与 NUL 直接剔除，避免请求头/文件系统异常
  const cleaned = s.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!cleaned) return '_';
  if (/^\.+$/.test(cleaned)) return '_';
  return cleaned;
}

/**
 * 净化相对路径：统一分隔符、丢弃空段、消解 `.`/`..`。
 * `a/../b` → `a/_/b`；`/x//y/` → `x/y`。
 * @param {string} value
 * @returns {string}
 */
export function sanitizeRelativePath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg !== '')
    .map(sanitizeSegment)
    .join('/');
}
