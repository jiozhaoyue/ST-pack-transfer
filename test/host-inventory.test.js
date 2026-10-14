import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { fetchHostInventory } from '../src/ui/host-bridge.js';
import { lEntries } from '../fixtures/gen.js';

/**
 * `fetchHostInventory`（S3 执行层宿主接缝）单测。
 *
 * 契约（`.trellis/tasks/10-14-migration-target-inventory/design.md` §3）：
 * 宿主不支持 / 请求失败 / 用户取消 ⇒ `{manifest:null, file:null, reason}`，**不抛**（`L0-11`）。
 * 成功 ⇒ 只读中央目录得到归一后的 hub 路径清单。
 */

const realFetch = globalThis.fetch;
const realSt = globalThis.SillyTavern;

const tmpDirs = [];
const saved = [];

async function tmpDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-host-inventory-'));
  tmpDirs.push(dir);
  return dir;
}

/** 造一份真 zip 的字节（复用固件条目，与 detect 测试同一手法）。 */
async function zipBytes(entries) {
  const dir = await tmpDir();
  const outPath = path.join(dir, 'backup.zip');
  const writer = await zipIo.createWriter(outPath);
  for (const [name, data] of entries) await writer.add(name, data);
  await writer.close();
  return new Uint8Array(await readFile(outPath));
}

/** 让 `getCsrfToken()` 走宿主上下文路径，免去 `/csrf-token` 请求。 */
function stubHostContext() {
  globalThis.SillyTavern = {
    getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'test-token' }) }),
  };
}

/** 备份端点替身：返回给定字节的流式响应。 */
function backupFetch(bytes, { ok = true, status = 200 } = {}) {
  return vi.fn(async (url) => {
    if (url === '/api/users/me') {
      return { ok: true, status: 200, json: async () => ({ handle: 'default-user' }) };
    }
    if (url === '/api/users/backup') {
      if (!ok) return { ok, status, json: async () => ({ error: 'boom' }) };
      return {
        ok,
        status,
        headers: { get: (k) => (String(k).toLowerCase() === 'content-length' ? String(bytes.length) : null) },
        body: new ReadableStream({
          start(controller) { controller.enqueue(bytes); controller.close(); },
        }),
      };
    }
    throw new Error(`unexpected url: ${url}`);
  });
}

beforeEach(() => {
  stubHostContext();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realSt === undefined) delete globalThis.SillyTavern;
  else globalThis.SillyTavern = realSt;
});

describe('fetchHostInventory（宿主清单读取）', () => {
  it('宿主平台为空 ⇒ 直接降级，零请求', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    const r = await fetchHostInventory({ platform: '' });
    expect(r.manifest).toBeNull();
    expect(r.file).toBeNull();
    expect(r.reason).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('备份端点非 2xx ⇒ 降级不抛（调用方零分支）', async () => {
    globalThis.fetch = backupFetch(new Uint8Array(), { ok: false, status: 500 });
    const r = await fetchHostInventory({ platform: 'luker' });
    expect(r.manifest).toBeNull();
    expect(r.file).toBeNull();
    expect(r.reason).toContain('500');
  });

  it('网络异常 ⇒ 降级不抛', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url === '/api/users/me') return { ok: true, status: 200, json: async () => ({ handle: 'u' }) };
      throw new Error('network down');
    });
    const r = await fetchHostInventory({ platform: 'luker' });
    expect(r.manifest).toBeNull();
    expect(r.reason).toContain('network down');
  });

  it('用户取消（AbortError）⇒ 归一为 reason:cancelled，仍不抛', async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (url === '/api/users/me') return { ok: true, status: 200, json: async () => ({ handle: 'u' }) };
      // 与真实 fetch 语义一致：signal 已 abort 即 reject(AbortError)
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(init.signal?.aborted).toBe(true);
      throw err;
    });
    const controller = new AbortController();
    controller.abort();
    const r = await fetchHostInventory({ platform: 'luker', signal: controller.signal });
    expect(r.manifest).toBeNull();
    expect(r.reason).toBe('cancelled');
  });

  it('成功 ⇒ 只读中央目录得到归一后的 hub 路径清单（排序、去目录条目）', async () => {
    const bytes = await zipBytes(lEntries());
    globalThis.fetch = backupFetch(bytes);
    const r = await fetchHostInventory({ platform: 'luker' });
    expect(r.file).toBeTruthy();
    expect(r.manifest).not.toBeNull();
    expect(r.manifest.count).toBeGreaterThan(0);
    expect(r.manifest.truncated).toBe(false);
    // 归一：小写、正斜杠、无目录条目
    expect(r.manifest.paths).toEqual([...r.manifest.paths].sort());
    expect(r.manifest.paths.every((p) => p === p.toLowerCase() && !p.endsWith('/'))).toBe(true);
    // 固件里的 hub 条目确实进了清单（内容以 lEntries 为准，不写死条数）
    expect(r.manifest.paths.some((p) => p.startsWith('characters/'))).toBe(true);
  });

  it('截断上限透传到 manifest（调用方据此降级 unknown）', async () => {
    const bytes = await zipBytes(lEntries());
    globalThis.fetch = backupFetch(bytes);
    // buildTargetManifest 的默认上限远大于固件；此处只验证「上限存在且透传」这一点由纯模块保证，
    // 宿主接缝不额外改写 manifest 字段
    const r = await fetchHostInventory({ platform: 'luker' });
    expect(typeof r.manifest.truncated).toBe('boolean');
  });
});
