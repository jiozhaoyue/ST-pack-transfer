/**
 * 传输执行器（S3 / WebDAV 共用）
 *
 * 语义与用户裁定一致：
 * - 固定分片（默认 8 MB），分片对象名 `<name>.partNNN`，清单最后写；
 * - 断点续传：目标端 HEAD 命中即跳过；
 * - 同内容再次上传：全部分片命中 ⇒ 零字节上传（仍补写清单）；
 * - 下载：优先按清单拉分片，缺失清单时回退单对象 Range；
 * - 失败分类、可中止（`signal`），不吞异常。
 *
 * 分层约束：`src/core/`，只接受注入的 target / crypto / Blob。
 */

import {
  DEFAULT_CHUNK_SIZE,
  buildManifest,
  chunkKey,
  manifestKey,
  parseManifest,
  planChunks,
} from '../core/transfer-plan.js';
import {
  SALT_LEN,
  bytesToHex,
  decryptWithKey,
  deriveKeyFromPassphrase,
  encryptWithKey,
  hexToBytes,
  randomBytes,
} from '../core/s3-crypto.js';

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256；无 crypto.subtle 时返回空串（调用方据此跳过校验，不假装已验证）。 */
export async function sha256Hex(bytes, crypto = globalThis.crypto) {
  if (!crypto?.subtle) return '';
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

async function pool(items, limit, fn) {
  const size = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  let cursor = 0;
  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function withRetry(fn, retries = 1) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await fn();
    if (last?.ok) return last;
    const status = Number(last?.status) || 0;
    // 4xx（429 除外）是确定性失败，重试没有意义。
    if (status >= 400 && status < 500 && status !== 429) return last;
  }
  return last;
}

/**
 * @param {{
 *   target: object,
 *   chunkSize?: number,
 *   concurrency?: number,
 *   retries?: number,
 *   onProgress?: Function,
 *   signal?: AbortSignal,
 *   crypto?: Crypto,
 * }} options
 */
export function createTransferRunner({
  target,
  chunkSize = DEFAULT_CHUNK_SIZE,
  concurrency = 3,
  retries = 1,
  onProgress,
  signal,
  passphrase = '',
  crypto = globalThis.crypto,
} = {}) {
  const aborted = () => Boolean(signal?.aborted);

  async function readManifest(name) {
    const result = await target.get(manifestKey(name));
    if (!result?.ok || !result.bytes) return null;
    try {
      return parseManifest(new TextDecoder().decode(result.bytes));
    } catch {
      return null;
    }
  }

  async function headChunks(name, chunks) {
    const present = new Set();
    await pool(chunks, concurrency, async (chunk) => {
      const head = await target.head(chunkKey(name, chunk.index));
      if (head?.ok) present.add(chunk.index);
    });
    return present;
  }

  async function upload({ blob, name, sha256 = '', contentType = 'application/zip', entryCount = null } = {}) {
    if (!target?.ready) return { ok: false, code: 'not-configured' };
    if (!blob || typeof blob.slice !== 'function') return { ok: false, code: 'bad-input' };
    if (aborted()) return { ok: false, code: 'aborted' };

    const size = Number(blob.size) || 0;
    const chunks = planChunks(size, chunkSize);
    const existing = await readManifest(name);
    const encrypted = Boolean(passphrase);
    // 加密模式必须与已有分片一致：旧分片用哪把钥匙加密的，续传只能沿用。
    if (existing?.encrypted && !passphrase) return { ok: false, code: 'passphrase-required' };
    if (existing && !existing.encrypted && passphrase) return { ok: false, code: 'encryption-mismatch' };
    let salt = null;
    let key = null;
    if (encrypted) {
      try {
        salt = existing?.salt ? hexToBytes(existing.salt) : randomBytes(SALT_LEN, crypto);
        key = await deriveKeyFromPassphrase(passphrase, salt, { crypto });
      } catch (error) {
        return { ok: false, code: error?.message || 'crypto-unavailable' };
      }
    }
    if (encrypted && !existing) {
      // 先落一张临时清单把 salt 固定下来：否则中断后旧分片会失去 salt，
      // 续传用新 salt 派生出的钥匙解不开旧分片。
      const provisional = buildManifest({
        name,
        size,
        chunkSize,
        chunks: [],
        sha256,
        entryCount,
        encrypted,
        salt: bytesToHex(salt),
        provisional: true,
      });
      const written = await withRetry(
        () => target.put(manifestKey(name), jsonBytes(provisional), { contentType: 'application/json' }),
        retries,
      );
      if (!written.ok) return { ok: false, ...written };
    }
    const present = await headChunks(name, chunks);
    const missing = chunks.filter((chunk) => !present.has(chunk.index));
    const totalBytes = size;
    let uploadedBytes = 0;
    let uploadedChunks = 0;

    if (missing.length === 0) {
      // 全部分片命中：只补写清单，保持「零字节上传」的事实。
      const manifest = buildManifest({
        name, size, chunkSize, chunks, sha256, entryCount,
        encrypted, salt: encrypted ? bytesToHex(salt) : '',
      });
      const written = await withRetry(
        () => target.put(manifestKey(name), jsonBytes(manifest), { contentType: 'application/json' }),
        retries,
      );
      if (!written.ok) return { ok: false, ...written };
      onProgress?.({
        phase: 'done', uploadedChunks: 0, totalChunks: chunks.length, uploadedBytes: 0, totalBytes,
      });
      return {
        ok: true,
        skipped: true,
        encrypted,
        totalChunks: chunks.length,
        uploadedChunks: 0,
        skippedChunks: present.size,
        uploadedBytes: 0,
        totalBytes,
      };
    }

    let failure = null;
    await pool(missing, concurrency, async (chunk) => {
      if (aborted() || failure) return;
      const plain = new Uint8Array(await blob.slice(chunk.start, chunk.end).arrayBuffer());
      const bytes = encrypted ? await encryptWithKey(plain, key, salt, { crypto }) : plain;
      const result = await withRetry(
        () => target.put(chunkKey(name, chunk.index), bytes, { contentType: 'application/octet-stream' }),
        retries,
      );
      if (!result.ok) {
        failure = result;
        return;
      }
      uploadedBytes += chunk.size;
      uploadedChunks += 1;
      onProgress?.({
        phase: 'uploading',
        chunkIndex: chunk.index,
        uploadedChunks,
        totalChunks: chunks.length,
        uploadedBytes,
        totalBytes,
      });
    });

    if (failure) return { ok: false, ...failure };
    if (aborted()) {
      return {
        ok: false,
        code: 'aborted',
        uploadedChunks,
        totalChunks: chunks.length,
        uploadedBytes,
        totalBytes,
      };
    }

    const manifest = buildManifest({
      name, size, chunkSize, chunks, sha256, entryCount,
      encrypted, salt: encrypted ? bytesToHex(salt) : '',
    });
    const finished = await withRetry(
      () => target.put(manifestKey(name), jsonBytes(manifest), { contentType: 'application/json' }),
      retries,
    );
    if (!finished.ok) return { ok: false, ...finished };

    onProgress?.({
      phase: 'done', uploadedChunks, totalChunks: chunks.length, uploadedBytes, totalBytes,
    });
    return {
      ok: true,
      encrypted,
      totalChunks: chunks.length,
      uploadedChunks,
      skippedChunks: present.size,
      uploadedBytes,
      totalBytes,
    };
  }

  async function download({ name, expectedSha256 = '' } = {}) {
    if (!target?.ready) return { ok: false, code: 'not-configured' };
    if (aborted()) return { ok: false, code: 'aborted' };

    const manifestResult = await target.get(manifestKey(name));
    const manifest = manifestResult?.ok && manifestResult.bytes
      ? parseManifest(new TextDecoder().decode(manifestResult.bytes))
      : null;

    if (manifest) {
      if (manifest.encrypted && !passphrase) return { ok: false, code: 'passphrase-required' };
      let key = null;
      if (manifest.encrypted) {
        try {
          key = await deriveKeyFromPassphrase(passphrase, hexToBytes(manifest.salt), { crypto });
        } catch {
          return { ok: false, code: 'bad-passphrase' };
        }
      }
      return downloadByManifest(name, manifest, expectedSha256, key);
    }

    const head = await target.head(name);
    if (!head?.ok) return { ok: false, ...head };
    const chunks = planChunks(head.size, chunkSize);
    const out = new Uint8Array(head.size);
    let failure = null;
    let downloadedBytes = 0;
    await pool(chunks, concurrency, async (chunk) => {
      if (aborted() || failure) return;
      const result = await target.get(name, { start: chunk.start, end: chunk.end - 1 });
      if (!result.ok) {
        failure = result;
        return;
      }
      out.set(result.bytes, chunk.start);
      downloadedBytes += chunk.size;
      onProgress?.({
        phase: 'downloading',
        chunkIndex: chunk.index,
        downloadedBytes,
        totalBytes: head.size,
      });
    });
    if (failure) return { ok: false, ...failure };
    if (aborted()) return { ok: false, code: 'aborted' };
    if (expectedSha256) {
      const actual = await sha256Hex(out, crypto);
      if (actual && actual !== expectedSha256) {
        return { ok: false, code: 'sha256-mismatch', expected: expectedSha256, actual };
      }
      return { ok: true, bytes: out, size: out.length, fromManifest: false, verified: Boolean(actual) };
    }
    return { ok: true, bytes: out, size: out.length, fromManifest: false };
  }

  async function downloadByManifest(name, manifest, expectedSha256, key = null) {
    const out = new Uint8Array(manifest.size);
    const chunks = manifest.chunks.map((chunk) => ({
      index: chunk.index,
      size: chunk.size,
      start: chunk.index * manifest.chunkSize,
      end: Math.min(manifest.size, (chunk.index + 1) * manifest.chunkSize),
    }));
    let failure = null;
    let downloadedBytes = 0;
    await pool(chunks, concurrency, async (chunk) => {
      if (aborted() || failure) return;
      const result = await target.get(chunkKey(name, chunk.index));
      if (!result.ok) {
        failure = result;
        return;
      }
      let bytes = result.bytes;
      if (key) {
        try {
          bytes = await decryptWithKey(bytes, key, { crypto });
        } catch {
          failure = { ok: false, code: 'bad-passphrase' };
          return;
        }
      }
      if (bytes.length !== chunk.size) {
        failure = { ok: false, code: 'chunk-size-mismatch', chunk: chunk.index };
        return;
      }
      out.set(bytes, chunk.start);
      downloadedBytes += chunk.size;
      onProgress?.({
        phase: 'downloading',
        chunkIndex: chunk.index,
        downloadedBytes,
        totalBytes: manifest.size,
      });
    });
    if (failure) return { ok: false, ...failure };
    if (aborted()) return { ok: false, code: 'aborted' };

    const expected = expectedSha256 || manifest.sha256;
    if (expected && !manifest.encrypted) {
      const actual = await sha256Hex(out, crypto);
      if (!actual) return { ok: true, bytes: out, size: out.length, fromManifest: true, verified: false };
      if (actual !== expected) {
        return { ok: false, code: 'sha256-mismatch', expected, actual };
      }
    }
    return {
      ok: true,
      bytes: out,
      size: out.length,
      fromManifest: true,
      verified: Boolean(expected) && !manifest.encrypted,
      encrypted: Boolean(manifest.encrypted),
      entryCount: manifest.entryCount,
    };
  }

  return { upload, download };
}
