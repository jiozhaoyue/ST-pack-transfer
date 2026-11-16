import { describe, it, expect, beforeEach, vi } from 'vitest';

// db.js 在 Node 无 IndexedDB 会降级返回 null，镜像路径依赖 storedId，
// 这里 mock saveFile 固定返回成功 id 以驱动 stash/ensureStored 全路径。
vi.mock('../src/storage/db.js', () => ({
  saveFile: vi.fn(async () => 'stored-1'),
  deleteFile: vi.fn(async () => true),
  getFile: vi.fn(async () => null),
  ORIGINS: Object.freeze({
    UPLOAD: 'upload',
    HOST_EXPORT: 'host-export',
    CONVERTED: 'converted',
    DELTA: 'delta',
    SPLIT_PART: 'split-part',
  }),
}));

const { ExportQueue } = await import('../src/ui/export-queue.js');
const { putArtifact, __setAuthorityClientForTest } = await import('../src/storage/authority-store.js');

// fire-and-forget 镜像链为异步微任务，断言前用宏任务清空
const flushAsync = () => new Promise((r) => setTimeout(r, 10));

/**
 * 构造 mock Authority client：KV + blob 内存实现。
 *
 * ⚠️ 形状**逐条对齐真实 SDK**（`st-authority-sdk/client.js`）：`kv.set/get/delete` 是**位置参数**，
 * `kv.get` 返回**已解包**的值；`blob.put` 收对象、`blob.get/delete` 收 **id**。
 * 与 `test/authority-store.test.js` 的 mock 同源理由：形状漂移会让「对象调用」在单测里假绿
 * （2026-10-13 实测的 422 就是这样被掩盖的）。`_blobs` 仍按**名**索引，便于用例按名断言。
 */
function mockClient() {
  const kv = new Map();
  const blobs = new Map();          // name → { id, name, content, encoding, contentType }
  const blobsById = new Map();      // id → name
  let seq = 0;
  const needStr = (v, label) => {
    if (typeof v !== 'string') {
      throw new Error(`${label} 收到 ${typeof v}，真实 SDK 收字符串 —— 调用形状与 SDK 不一致`);
    }
  };
  return {
    storage: {
      kv: {
        set: async (key, value) => {
          needStr(key, 'kv.set(key, value) 的 key');
          if (value === undefined) throw new Error('kv.set 的 value 是 undefined —— 真实 SDK 是位置参数');
          kv.set(key, value);
        },
        get: async (key) => {
          needStr(key, 'kv.get(key) 的 key');
          return kv.has(key) ? kv.get(key) : null; // 已解包
        },
        delete: async (key) => { needStr(key, 'kv.delete(key) 的 key'); kv.delete(key); },
      },
      blob: {
        put: async (input) => {
          const id = `blob-${++seq}`;
          blobs.set(input.name, { id, ...input });
          blobsById.set(id, input.name);
          return { id, name: input.name, contentType: input.contentType, size: (input.content || '').length };
        },
        get: async (id) => {
          needStr(id, 'blob.get(id) 的 id');
          const name = blobsById.get(id);
          const rec = name ? blobs.get(name) : null;
          return rec ? { record: { id, name }, content: rec.content, encoding: rec.encoding || 'base64' } : null;
        },
        delete: async (id) => {
          needStr(id, 'blob.delete(id) 的 id');
          const name = blobsById.get(id);
          if (name) { blobsById.delete(id); blobs.delete(name); }
        },
      },
    },
    _kv: kv,
    _blobs: blobs,
  };
}

describe('export-queue 入库 → Authority 持久归档镜像', () => {
  beforeEach(() => __setAuthorityClientForTest(undefined));

  it('stash 入库成功时镜像产物到 Authority blob', async () => {
    const client = mockClient();
    __setAuthorityClientForTest(client);
    const queue = new ExportQueue();
    const item = queue.enqueue({
      blob: new Blob([new Uint8Array(2048)], { type: 'application/zip' }),
      name: 'out-l.zip',
      targetLayout: 'l',
    });

    await queue.stash(item.id);
    expect(item.storedId).toBe('stored-1');
    expect(item.ephemeral).toBe(false);
    await flushAsync();
    // 镜像落盘：blob part + KV 清单。
    // 断言走清单驱动（不绑死分块命名格式——命名含代际标识，属实现细节）。
    const manifest = client._kv.get('blob-manifest:out-l.zip');
    expect(manifest).toBeTruthy();
    expect(manifest.parts.length).toBeGreaterThan(0);
    for (const part of manifest.parts) {
      expect(client._blobs.has(part.name)).toBe(true);
    }
  });

  it('Authority 不可用时 stash 正常完成且不报错', async () => {
    __setAuthorityClientForTest(null);
    const queue = new ExportQueue();
    const item = queue.enqueue({ blob: new Blob(['x']), name: 'out.zip' });
    await queue.stash(item.id);
    expect(item.storedId).toBe('stored-1');
  });

  it('ensureStored 下载路径同样触发镜像', async () => {
    const client = mockClient();
    __setAuthorityClientForTest(client);
    const queue = new ExportQueue();
    const item = queue.enqueue({ blob: new Blob(['y']), name: 'quick.zip' });
    const id = await queue.ensureStored(item.id);
    expect(id).toBe('stored-1');
    await flushAsync();
    expect(client._kv.has('blob-manifest:quick.zip')).toBe(true);
  });

  it('已入库条目重复 stash 不重复镜像', async () => {
    const client = mockClient();
    __setAuthorityClientForTest(client);
    const queue = new ExportQueue();
    const item = queue.enqueue({ blob: new Blob(['z']), name: 'once.zip' });
    await queue.stash(item.id);
    await flushAsync();
    const manifestCount = () => [...client._kv.keys()].filter((k) => k.startsWith('blob-manifest:once')).length;
    await queue.stash(item.id);
    await queue.stashAll();
    await flushAsync();
    expect(manifestCount()).toBe(1);
  });

  it('putArtifact 直连：同名覆盖保留最新产物且清理旧代际分块', async () => {
    const client = mockClient();
    __setAuthorityClientForTest(client);
    await putArtifact('a.zip', new Blob(['v1']));
    const firstParts = client._kv.get('blob-manifest:a.zip').parts.map((p) => p.name);

    await putArtifact('a.zip', new Blob([new Uint8Array(1024)]));
    const manifest = client._kv.get('blob-manifest:a.zip');

    // 清单指向最新产物
    expect(manifest.size).toBe(1024);
    expect(manifest.gen).toBeTruthy();
    for (const part of manifest.parts) {
      expect(client._blobs.has(part.name)).toBe(true);
    }
    // 旧代际分块已清理（无孤儿块）
    for (const oldName of firstParts) {
      expect(client._blobs.has(oldName)).toBe(false);
    }
  });
});
