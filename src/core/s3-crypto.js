/**
 * 包体加密（可选）：PBKDF2-SHA256 派生 → AES-GCM。
 *
 * 文件格式：`SPT1`(4) + salt(16) + iv(12) + 密文（含 GCM tag）。
 * 只在浏览器/Node 的 WebCrypto 上实现；不可用时由调用方降级为「不加密上传」并明确告知。
 */

const MAGIC = new TextEncoder().encode('SPT1');
export const SALT_LEN = 16;
export const IV_LEN = 12;
export const ITERATIONS = 120000;

export function hasWebCrypto(crypto = globalThis.crypto) {
  return !!(crypto && crypto.subtle);
}

export function isEncrypted(bytes) {
  if (!bytes || bytes.length < MAGIC.length + SALT_LEN + IV_LEN) return false;
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}

async function deriveKey(crypto, passphrase, salt) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** @param {Uint8Array} bytes @param {string} passphrase */
export async function encryptBytes(bytes, passphrase, { crypto = globalThis.crypto } = {}) {
  if (!hasWebCrypto(crypto)) throw new Error('webcrypto-unavailable');
  if (!passphrase) throw new Error('passphrase-required');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(crypto, passphrase, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(MAGIC.length + SALT_LEN + IV_LEN + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + SALT_LEN);
  out.set(cipher, MAGIC.length + SALT_LEN + IV_LEN);
  return out;
}

/** @param {Uint8Array} payload @param {string} passphrase */
export async function decryptBytes(payload, passphrase, { crypto = globalThis.crypto } = {}) {
  if (!hasWebCrypto(crypto)) throw new Error('webcrypto-unavailable');
  if (!isEncrypted(payload)) throw new Error('not-encrypted');
  const salt = payload.slice(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = payload.slice(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN);
  const cipher = payload.slice(MAGIC.length + SALT_LEN + IV_LEN);
  const key = await deriveKey(crypto, passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new Uint8Array(plain);
}
