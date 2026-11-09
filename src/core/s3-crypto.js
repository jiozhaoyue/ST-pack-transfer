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

export function randomBytes(length, crypto = globalThis.crypto) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const text = String(hex || '');
  if (!text || text.length % 2 !== 0) throw new Error('bad-hex');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) throw new Error('bad-hex');
    out[i] = byte;
  }
  return out;
}

/**
 * 从口令与 salt 派生 AES-GCM 密钥。
 * 同一个 salt 只派生一次：PBKDF2 12 万轮，按对象重复派生会慢到不可用。
 */
export async function deriveKeyFromPassphrase(passphrase, salt, { crypto = globalThis.crypto } = {}) {
  if (!hasWebCrypto(crypto)) throw new Error('webcrypto-unavailable');
  if (!passphrase) throw new Error('passphrase-required');
  return deriveKey(crypto, passphrase, salt);
}

/** 用已派生密钥加密；每段自带随机 IV，salt 原样写入以便自描述。 */
export async function encryptWithKey(bytes, key, salt, { crypto = globalThis.crypto } = {}) {
  if (!hasWebCrypto(crypto)) throw new Error('webcrypto-unavailable');
  if (!key) throw new Error('key-required');
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(MAGIC.length + SALT_LEN + IV_LEN + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + SALT_LEN);
  out.set(cipher, MAGIC.length + SALT_LEN + IV_LEN);
  return out;
}

/** 用已派生密钥解密；salt 来自调用方（manifest / index），不重复跑 PBKDF2。 */
export async function decryptWithKey(payload, key, { crypto = globalThis.crypto } = {}) {
  if (!hasWebCrypto(crypto)) throw new Error('webcrypto-unavailable');
  if (!isEncrypted(payload)) throw new Error('not-encrypted');
  if (!key) throw new Error('key-required');
  const iv = payload.slice(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN);
  const cipher = payload.slice(MAGIC.length + SALT_LEN + IV_LEN);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new Uint8Array(plain);
}

/** @param {Uint8Array} bytes @param {string} passphrase */
export async function encryptBytes(bytes, passphrase, { crypto = globalThis.crypto } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key = await deriveKeyFromPassphrase(passphrase, salt, { crypto });
  return encryptWithKey(bytes, key, salt, { crypto });
}

/** @param {Uint8Array} payload @param {string} passphrase */
export async function decryptBytes(payload, passphrase, { crypto = globalThis.crypto } = {}) {
  if (!hasWebCrypto(crypto)) throw new Error('webcrypto-unavailable');
  if (!isEncrypted(payload)) throw new Error('not-encrypted');
  const salt = payload.slice(MAGIC.length, MAGIC.length + SALT_LEN);
  const key = await deriveKeyFromPassphrase(passphrase, salt, { crypto });
  return decryptWithKey(payload, key, { crypto });
}
