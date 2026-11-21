/**
 * 凭证检测共享正则（PEM 私钥载体）
 *
 * 唯一真源：logger.redact 与 sanitize-share.containsCredential 共用本模块，
 * 消除历史上两处各写一份正则导致的漂移——
 * 旧 logger.js:110 用枚举前缀（ENCRYPTED/RSA/EC/DSA/OPENSSH/PGP），
 * 旧 sanitize-share.js:121 用 [A-Z0-9 ]+ 通配，两者覆盖不一致。
 *
 * 模式：前缀用 [A-Z0-9 ]+ 通配，兼容常见厂商扩展头（字母/数字/空格组合），检测不漏报；
 * 存在配对 END 行时惰性匹配 BEGIN→END 整块（含 Base64 主体），
 * 否则退化为只匹配头行至行尾，供脱敏/检测两种路径共用。
 */

/** PEM 私钥模式唯一真源（不带 g 标志）。正则字面量全模块仅此一份。 */
export const PEM_PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\r\n]*|[^\n]*)/;

/**
 * 全局替换用正则：供 logger.redact 把整块 PEM 掩成 [REDACTED]。
 * 由唯一真源 .source 派生，不另写正则字面量，保证两处模式严格一致。
 */
export const PEM_PRIVATE_KEY_GLOBAL = new RegExp(PEM_PRIVATE_KEY.source, 'g');

/**
 * 是否含 PEM 私钥载体（无状态检测，供 sanitize-share.containsCredential）。
 * 直接用不带 g 的真源 test，lastIndex 不会被推进，连续调用不漏检。
 * @param {unknown} text
 * @returns {boolean}
 */
export function containsPemPrivateKey(text) {
  if (typeof text !== 'string' || !text) return false;
  return PEM_PRIVATE_KEY.test(text);
}
