import { describe, expect, it } from 'vitest';
import { createTransferRunner } from '../src/app/transfer-runner.js';
import { chunkKey, manifestKey } from '../src/core/transfer-plan.js';

const MB = 1024 * 1024;

function sampleBytes(size) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = i % 251;
  return bytes;
}

function blobOf(bytes) {
  return new Blob([new Uint8Array(bytes)]);
}

function fakeTarget() {
  const store = new Map();
  return {
    ready: true,
    store,
    async head(key) {
      if (!store.has(key)) return { ok: false, status: 404 };
      return { ok: true, size: store.get(key).length };
    },
    async put(key, bytes) {
      store.set(key, new Uint8Array(bytes));
      return { ok: true, status: 200 };
    },
    async get(key, { start, end } = {}) {
      if (!store.has(key)) return { ok: false, status: 404 };
      const bytes = store.get(key);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return { ok: true, bytes: bytes.slice(start, end + 1) };
      }
      return { ok: true, bytes };
    },
    async remove(key) {
      store.delete(key);
      return { ok: true, status: 204 };
    },
  };
}

describe('transfer-runner 分片 / 断点 / 清单', () => {
  it('按分片上传并在最后写清单', async () => {
    const target = fakeTarget();
    const runner = createTransferRunner({ target, chunkSize: MB, concurrency: 2 });
    const result = await runner.upload({ blob: blobOf(sampleBytes(2 * MB + 1)), name: 'a.zip' });
    expect(result).toMatchObject({ ok: true, totalChunks: 3, uploadedChunks: 3, skippedChunks: 0 });
    expect(target.store.has(chunkKey('a.zip', 0))).toBe(true);
    expect(target.store.has(chunkKey('a.zip', 2))).toBe(true);
    expect(target.store.has(manifestKey('a.zip'))).toBe(true);
  });

  it('再次上传全部分片命中 ⇒ 零字节上传', async () => {
    const target = fakeTarget();
    const runner = createTransferRunner({ target, chunkSize: MB, concurrency: 2 });
    const blob = blobOf(sampleBytes(2 * MB + 1));
    await runner.upload({ blob, name: 'a.zip' });
    const second = await runner.upload({ blob, name: 'a.zip' });
    expect(second).toMatchObject({ ok: true, skipped: true, uploadedChunks: 0, skippedChunks: 3 });
  });

  it('下载按清单合并分片', async () => {
    const target = fakeTarget();
    const runner = createTransferRunner({ target, chunkSize: MB, concurrency: 2 });
    const bytes = sampleBytes(2 * MB + 1);
    await runner.upload({ blob: blobOf(bytes), name: 'a.zip' });
    const result = await runner.download({ name: 'a.zip' });
    expect(result.ok).toBe(true);
    expect(result.fromManifest).toBe(true);
    expect(result.bytes.length).toBe(bytes.length);
    expect(result.bytes[0]).toBe(bytes[0]);
    expect(result.bytes[result.bytes.length - 1]).toBe(bytes[bytes.length - 1]);
  });

  it('无清单时回退单对象 Range 下载', async () => {
    const target = fakeTarget();
    const bytes = sampleBytes(2 * MB + 1);
    target.store.set('legacy.zip', bytes);
    const runner = createTransferRunner({ target, chunkSize: MB, concurrency: 2 });
    const result = await runner.download({ name: 'legacy.zip' });
    expect(result.ok).toBe(true);
    expect(result.fromManifest).toBe(false);
    expect(result.bytes.length).toBe(bytes.length);
    expect(result.bytes[0]).toBe(bytes[0]);
    expect(result.bytes[result.bytes.length - 1]).toBe(bytes[bytes.length - 1]);
  });

  it('预中止时不上传任何分片', async () => {
    const target = fakeTarget();
    const controller = new AbortController();
    controller.abort();
    const runner = createTransferRunner({ target, signal: controller.signal });
    const result = await runner.upload({ blob: blobOf(sampleBytes(MB)), name: 'a.zip' });
    expect(result).toMatchObject({ ok: false, code: 'aborted' });
    expect(target.store.size).toBe(0);
  });

  it('清单 sha256 不匹配时如实失败', async () => {
    const target = fakeTarget();
    const runner = createTransferRunner({ target, chunkSize: MB, concurrency: 2 });
    await runner.upload({
      blob: blobOf(sampleBytes(MB + 1)),
      name: 'a.zip',
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    });
    const result = await runner.download({ name: 'a.zip' });
    expect(result).toMatchObject({ ok: false, code: 'sha256-mismatch' });
  });
});

describe('transfer-runner 逐片加密（可选）', () => {
  it('加密上传后可对口令解密下载', async () => {
    const target = fakeTarget();
    const bytes = sampleBytes(2 * MB + 1);
    const uploader = createTransferRunner({ target, chunkSize: MB, concurrency: 2, passphrase: 'pw' });
    const uploaded = await uploader.upload({ blob: blobOf(bytes), name: 'e.zip' });
    expect(uploaded).toMatchObject({ ok: true, encrypted: true });

    const manifest = JSON.parse(new TextDecoder().decode(target.store.get(manifestKey('e.zip'))));
    expect(manifest.encrypted).toBe(true);
    expect(manifest.salt).toMatch(/^[0-9a-f]+$/);

    const downloader = createTransferRunner({ target, chunkSize: MB, concurrency: 2, passphrase: 'pw' });
    const result = await downloader.download({ name: 'e.zip' });
    expect(result.ok).toBe(true);
    expect(Buffer.from(result.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it('缺口令 / 错口令如实失败，不返回半包', async () => {
    const target = fakeTarget();
    const bytes = sampleBytes(MB + 1);
    const uploader = createTransferRunner({ target, chunkSize: MB, passphrase: 'pw' });
    await uploader.upload({ blob: blobOf(bytes), name: 'e.zip' });

    const noPass = createTransferRunner({ target, chunkSize: MB });
    expect(await noPass.download({ name: 'e.zip' }))
      .toMatchObject({ ok: false, code: 'passphrase-required' });

    const wrong = createTransferRunner({ target, chunkSize: MB, passphrase: 'bad' });
    expect(await wrong.download({ name: 'e.zip' }))
      .toMatchObject({ ok: false, code: 'bad-passphrase' });
  });

  it('同内容重传仍零字节，并沿用原 salt 保证旧分片可解', async () => {
    const target = fakeTarget();
    const bytes = sampleBytes(MB + 1);
    const runner = createTransferRunner({ target, chunkSize: MB, passphrase: 'pw' });
    await runner.upload({ blob: blobOf(bytes), name: 'e.zip' });
    const first = JSON.parse(new TextDecoder().decode(target.store.get(manifestKey('e.zip'))));

    const second = await runner.upload({ blob: blobOf(bytes), name: 'e.zip' });
    expect(second).toMatchObject({ ok: true, skipped: true, uploadedChunks: 0 });

    const again = JSON.parse(new TextDecoder().decode(target.store.get(manifestKey('e.zip'))));
    expect(again.salt).toBe(first.salt);

    const result = await createTransferRunner({ target, chunkSize: MB, passphrase: 'pw' })
      .download({ name: 'e.zip' });
    expect(Buffer.from(result.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it('加密上传中断后重跑沿用原 salt，旧分片仍可解', async () => {
    const target = fakeTarget();
    const originalPut = target.put.bind(target);
    let failOnce = true;
    target.put = async (key, bytes, opts) => {
      if (failOnce && /\.part001$/.test(key)) {
        failOnce = false;
        return { ok: false, status: 500 };
      }
      return originalPut(key, bytes, opts);
    };

    const bytes = sampleBytes(2 * MB + 1);
    const first = await createTransferRunner({
      target, chunkSize: MB, passphrase: 'pw', retries: 0,
    }).upload({ blob: blobOf(bytes), name: 'e.zip' });
    expect(first.ok).toBe(false);

    const provisional = JSON.parse(new TextDecoder().decode(target.store.get(manifestKey('e.zip'))));
    expect(provisional.provisional).toBe(true);
    expect(provisional.salt).toMatch(/^[0-9a-f]+$/);

    target.put = originalPut;
    const second = await createTransferRunner({ target, chunkSize: MB, passphrase: 'pw' })
      .upload({ blob: blobOf(bytes), name: 'e.zip' });
    expect(second.ok).toBe(true);

    const final = JSON.parse(new TextDecoder().decode(target.store.get(manifestKey('e.zip'))));
    expect(final.provisional).toBe(false);
    expect(final.salt).toBe(provisional.salt);

    const down = await createTransferRunner({ target, chunkSize: MB, passphrase: 'pw' })
      .download({ name: 'e.zip' });
    expect(Buffer.from(down.bytes).equals(Buffer.from(bytes))).toBe(true);
  });
});
