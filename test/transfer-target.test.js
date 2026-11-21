/**
 * 零覆盖模块补测 · transfer-target（src/core/transfer-target.js）
 *
 * 依据：docs/HANDOFF-2026-11-21-quality-pass.md:85 列为「零测试模块」次之项。
 * 本模块职责是把 S3 / WebDAV 两套底层 client 映射为统一接口
 * （head/put/get/list/remove/ensureCollection）。用 vi.mock 注入假底层 client，
 * 只锁定适配层自身的映射契约，不牵扯 S3 签名与 WebDAV XML 解析：
 *   ① 默认 s3 分支的接口形状与 ready 透传；
 *   ② s3 的 range 分流（有 start/end ⇒ getObjectRange，否则 getObject）与透传方法；
 *   ③ webdav 的 range 字符串拼装、方法改名映射、list 过滤/拼 key/错误映射；
 *   ④ 构造参数透传（config / fetchImpl / proxyUrl）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { s3Spy, davSpy } = vi.hoisted(() => ({
  s3Spy: vi.fn(),
  davSpy: vi.fn(),
}));

vi.mock('../src/core/s3-client.js', () => ({ createS3Client: (...args) => s3Spy(...args) }));
vi.mock('../src/core/webdav-client.js', () => ({ createWebdavClient: (...args) => davSpy(...args) }));

import { createTransferTarget } from '../src/core/transfer-target.js';

/** 造一个方法全是 vi.fn 的假底层 client */
function fakeClient(overrides = {}) {
  return {
    ready: true,
    headObject: vi.fn(async () => ({ ok: true })),
    putObject: vi.fn(async () => ({ ok: true })),
    getObject: vi.fn(async () => ({ ok: true, bytes: new Uint8Array([1]) })),
    getObjectRange: vi.fn(async () => ({ ok: true, bytes: new Uint8Array([2]) })),
    deleteObject: vi.fn(async () => ({ ok: true })),
    listObjects: vi.fn(async () => ({ ok: true, items: [] })),
    ensureCollection: vi.fn(async () => ({ ok: true, results: [] })),
    ...overrides,
  };
}

describe('transfer-target · s3 分支', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = fakeClient();
    s3Spy.mockReturnValue(client);
  });

  it('① 默认 kind 为 s3，统一接口六方法齐全，ready 透传', () => {
    const target = createTransferTarget();
    expect(target.kind).toBe('s3');
    expect(target.ready).toBe(true);
    for (const m of ['head', 'put', 'get', 'list', 'remove', 'ensureCollection']) {
      expect(typeof target[m]).toBe('function');
    }
  });

  it('④ 构造参数把 config / fetchImpl 透传给 createS3Client', () => {
    const config = { bucket: 'b' };
    const fetchImpl = vi.fn();
    createTransferTarget({ kind: 's3', config, fetchImpl });
    expect(s3Spy).toHaveBeenCalledWith({ config, fetchImpl });
    expect(davSpy).not.toHaveBeenCalled();
  });

  it('② head/put/remove 透传到底层对应方法（含 opts）', async () => {
    const target = createTransferTarget();
    await target.head('k');
    await target.put('k', new Uint8Array([9]), { contentType: 'application/zip' });
    await target.remove('k');
    expect(client.headObject).toHaveBeenCalledWith('k');
    expect(client.putObject).toHaveBeenCalledWith('k', new Uint8Array([9]), { contentType: 'application/zip' });
    expect(client.deleteObject).toHaveBeenCalledWith('k');
  });

  it('② get：start/end 均为有限数 ⇒ 走 getObjectRange', async () => {
    const target = createTransferTarget();
    await target.get('k', { start: 10, end: 20 });
    expect(client.getObjectRange).toHaveBeenCalledWith('k', { start: 10, end: 20 });
    expect(client.getObject).not.toHaveBeenCalled();
  });

  it('② get：无 range 或仅一端有限 ⇒ 走整包 getObject', async () => {
    const target = createTransferTarget();
    await target.get('k');
    await target.get('k', { start: 0 });
    await target.get('k', { end: 10 });
    expect(client.getObject).toHaveBeenCalledTimes(3);
    expect(client.getObjectRange).not.toHaveBeenCalled();
  });

  it('② list 直接透传底层 listObjects', async () => {
    const target = createTransferTarget();
    await target.list('pre/');
    expect(client.listObjects).toHaveBeenCalledWith('pre/');
  });

  it('② ensureCollection 在 s3 下恒返回 ok，不触碰底层', async () => {
    const target = createTransferTarget();
    expect(await target.ensureCollection('a/b')).toEqual({ ok: true, results: [] });
    expect(client.ensureCollection).not.toHaveBeenCalled();
  });
});

describe('transfer-target · webdav 分支', () => {
  let dav;

  beforeEach(() => {
    vi.clearAllMocks();
    dav = fakeClient();
    davSpy.mockReturnValue(dav);
  });

  it('① 返回 kind 为 webdav，ready 透传', () => {
    const target = createTransferTarget({ kind: 'webdav' });
    expect(target.kind).toBe('webdav');
    expect(target.ready).toBe(true);
  });

  it('④ config / fetchImpl / proxyUrl 全部透传给 createWebdavClient', () => {
    const config = { baseUrl: 'https://dav' };
    const fetchImpl = vi.fn();
    createTransferTarget({ kind: 'webdav', config, fetchImpl, proxyUrl: 'https://proxy' });
    expect(davSpy).toHaveBeenCalledWith({ config, fetchImpl, proxyUrl: 'https://proxy' });
    expect(s3Spy).not.toHaveBeenCalled();
  });

  it('③ get：两端有限 ⇒ 拼出 bytes=start-end 的 range 字符串', async () => {
    const target = createTransferTarget({ kind: 'webdav' });
    await target.get('k', { start: 5, end: 9 });
    expect(dav.getObject).toHaveBeenCalledWith('k', { range: 'bytes=5-9' });
  });

  it('③ get：无完整 range ⇒ range 为 undefined', async () => {
    const target = createTransferTarget({ kind: 'webdav' });
    await target.get('k');
    expect(dav.getObject).toHaveBeenCalledWith('k', { range: undefined });
  });

  it('③ head/put/remove/ensureCollection 改名映射', async () => {
    const target = createTransferTarget({ kind: 'webdav' });
    await target.head('k');
    await target.put('k', new Uint8Array([1]), { contentType: 'text/plain' });
    await target.remove('k');
    await target.ensureCollection('a/b');
    expect(dav.headObject).toHaveBeenCalledWith('k');
    expect(dav.putObject).toHaveBeenCalledWith('k', new Uint8Array([1]), { contentType: 'text/plain' });
    expect(dav.deleteObject).toHaveBeenCalledWith('k');
    expect(dav.ensureCollection).toHaveBeenCalledWith('a/b');
  });

  it('③ list 成功：过滤目录项与无名项，key 拼上 base 前缀', async () => {
    dav.list = vi.fn(async () => ({
      ok: true,
      status: 207,
      items: [
        { name: 'a.txt', isDir: false, size: 10, lastModified: 't1' },
        { name: 'sub', isDir: true, size: 0 },
        { name: '', isDir: false, size: 1 },
        null,
      ],
    }));
    const target = createTransferTarget({ kind: 'webdav' });
    expect(await target.list('folder')).toEqual({
      ok: true,
      status: 207,
      items: [{ key: 'folder/a.txt', size: 10, lastModified: 't1' }],
    });
    expect(dav.list).toHaveBeenCalledWith('folder');
  });

  it('③ list 无前缀时不给 key 加多余斜杠', async () => {
    dav.list = vi.fn(async () => ({
      ok: true,
      status: 207,
      items: [{ name: 'root.txt', isDir: false, size: 3, lastModified: 't2' }],
    }));
    const target = createTransferTarget({ kind: 'webdav' });
    expect((await target.list()).items[0].key).toBe('root.txt');
  });

  it('③ list 失败：映射 code/message 为统一 message', async () => {
    dav.list = vi.fn(async () => ({ ok: false, status: 501, code: 'list-not-supported' }));
    const target = createTransferTarget({ kind: 'webdav' });
    expect(await target.list()).toEqual({
      ok: false, status: 501, message: 'list-not-supported',
    });
  });

  it('③ list 失败且无 code 时回退到 message', async () => {
    dav.list = vi.fn(async () => ({ ok: false, status: 500, message: 'boom' }));
    const target = createTransferTarget({ kind: 'webdav' });
    expect((await target.list()).message).toBe('boom');
  });
});
