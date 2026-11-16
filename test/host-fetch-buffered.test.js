import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as zip from '../src/vendor/zip.js';
import { fetchHostBackup } from '../src/ui/host-bridge.js';

const CHUNK = 64 * 1024;
const BLOCK = 4 * 1024 * 1024;

async function makeZipBlob(size = 12 * 1024 * 1024) {
  const writer = new zip.ZipWriter(new zip.BlobWriter('application/zip'), { level: 0 });
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = i % 251;
  await writer.add('manifest.json', new zip.Uint8ArrayReader(new TextEncoder().encode('{"schemaVersion":1}')));
  await writer.add('blob.bin', new zip.Uint8ArrayReader(bytes));
  return new Blob([await writer.close()], { type: 'application/zip' });
}

function streamResponse(blob, chunks = []) {
  const bytes = new Uint8Array(blob.size);
  let offset = 0;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true, value: undefined };
      const end = Math.min(offset + CHUNK, bytes.length);
      const value = new Uint8Array(valueBuffer.slice(offset, end));
      offset = end;
      chunks.push(value.length);
      return { done: false, value };
    },
    async cancel() {},
  };
  // 提前把 blob 读成字节，避免 read() 里 await 造成时序噪声
  let valueBuffer = bytes;
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === 'content-length' ? String(blob.size) : null) },
    body: { getReader: () => reader },
    async blob() { return blob; },
    async json() { return {}; },
    _setBuffer(buf) { valueBuffer = buf; },
  };
}

describe('fetchHostBackup：OPFS 合并写', () => {
  let writes;

  beforeEach(() => {
    writes = [];
    vi.restoreAllMocks();
  });

  it('把 64KB 分块合并成 >=4MB 的写块，且总字节一致', async () => {
    const pack = await makeZipBlob();
    const packBytes = new Uint8Array(await pack.arrayBuffer());
    const response = streamResponse(pack);
    response._setBuffer(packBytes);

    const handle = {
      async createWritable() {
        return {
          async write(chunk) { writes.push(new Uint8Array(chunk)); },
          async truncate() {},
          async close() {},
          async abort() {},
        };
      },
      async getFile() { return new Blob(writes); },
    };
    const dir = {
      async getFileHandle() { return handle; },
      async removeEntry() {},
    };
    const root = { async getDirectoryHandle() { return dir; } };
    vi.stubGlobal('navigator', { storage: { async getDirectory() { return root; } } });

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url === '/csrf-token') return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ token: 't' }) };
      if (url === '/api/users/me') return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ handle: 'default-user' }) };
      return response;
    }));

    const result = await fetchHostBackup('luker', { characters: true }, {
      taskId: 'pkg-test',
      opfsDirName: 'packages',
      writeBlockBytes: BLOCK,
    });

    expect(result.kind).toBe('opfs');
    expect(result.dir).toBe('packages');
    expect(result.size).toBe(pack.size);

    const total = writes.reduce((n, w) => n + w.length, 0);
    expect(total).toBe(pack.size);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.length).toBeLessThan(Math.ceil(pack.size / CHUNK));
    // 除最后一块外，每块都达到合并阈值
    for (const w of writes.slice(0, -1)) {
      expect(w.length).toBeGreaterThanOrEqual(BLOCK);
    }
  });
});
