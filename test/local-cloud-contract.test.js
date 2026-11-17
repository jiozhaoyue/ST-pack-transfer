/**
 * 本地云存储契约测试（真实 HTTP 通道）。
 *
 * 与 s3-client.test.js / webdav-client.test.js 的 mock fetch 不同，
 * 本文件把客户端接到本机测试服务器，验证「客户端 ↔ 服务器」真实契约：
 *   tooling/local-cloud/s3-server.cjs     → startS3Server({port:0, host}) → {url, port, close(), objects}
 *   tooling/local-cloud/webdav-server.cjs → startWebdavServer({...})    → {url, port, close(), files}
 *
 * 约束：端口一律 0（服务器自行分配），每套单例 afterAll 必须 close()。
 * 数据：固定种子生成 256 KiB 递增字节，断言长度 + sha256，杜绝随机夹具。
 *
 * 依赖未就绪时（并行任务尚未产出服务器）在 beforeAll 抛清晰错误，
 * 绝不自行实现服务器、绝不伪造 HTTP 响应。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import { createS3Client, encodePath, objectKey } from '../src/core/s3-client.js';
import { createWebdavClient } from '../src/core/webdav-client.js';
import { sanitizeRelativePath } from '../src/core/path-safety.js';

const require = createRequire(import.meta.url);

function loadServers() {
  try {
    const s3 = require('../tooling/local-cloud/s3-server.cjs');
    const dav = require('../tooling/local-cloud/webdav-server.cjs');
    if (typeof s3.startS3Server !== 'function' || typeof dav.startWebdavServer !== 'function') {
      throw new Error('导出名不符：需要 startS3Server / startWebdavServer');
    }
    return { startS3Server: s3.startS3Server, startWebdavServer: dav.startWebdavServer };
  } catch (error) {
    throw new Error(
      '依赖未就绪：本机测试服务器不可用。'
      + '请确认并行任务已产出 tooling/local-cloud/s3-server.cjs 与 '
      + 'tooling/local-cloud/webdav-server.cjs，并导出 startS3Server / startWebdavServer。'
      + ` 原始错误：${error?.message || error}`,
    );
  }
}

/* 固定种子：线性同余 + 下标扰动，同一 size/seed 永远同字节。 */
function seededBytes(size = 256 * 1024, seed = 0x5a) {
  const out = new Uint8Array(size);
  let x = seed & 0xff;
  for (let i = 0; i < size; i += 1) {
    x = (x * 1103515245 + 12345 + i) & 0xff;
    out[i] = x;
  }
  return out;
}

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

const SIZE = 256 * 1024;

describe('本地云存储契约（真实 HTTP 通道）', () => {
  let startS3Server;
  let startWebdavServer;

  beforeAll(() => {
    ({ startS3Server, startWebdavServer } = loadServers());
  });

  describe('S3 客户端', () => {
    let server;
    let client;
    let config;

    beforeAll(async () => {
      server = await startS3Server({ port: 0, host: '127.0.0.1' });
      /* 服务器只校验 Authorization 是否存在（缺头返回 403），凭据可为固定测试值。
         若并行任务额外暴露了 bucket / credentials 字段，优先用其暴露值。 */
      config = {
        endpoint: server.endpoint || server.url,
        bucket: server.bucket || 'contract-bucket',
        pathStyle: server.pathStyle !== false,
        region: server.region || 'us-east-1',
        accessKeyId: server.accessKeyId || 'LOCALACCESSKEY',
        secretAccessKey: server.secretAccessKey || 'LOCALSECRETKEY',
      };
      client = createS3Client({ config, crypto: webcrypto });
      expect(client.ready).toBe(true);
    });

    afterAll(async () => {
      if (server?.close) await server.close();
    });

    it('putObject → headObject(Content-Length/ETag) → getObject 字节一致 → getObjectRange → listObjects → deleteObject 后 404', async () => {
      const key = 'contract/basic.bin';
      const data = seededBytes(SIZE);
      const expectedHash = sha256(data);

      const put = await client.putObject(key, data);
      expect(put.ok, `putObject 失败：${put.status} ${put.message}`).toBe(true);

      const head = await client.headObject(key);
      expect(head.ok).toBe(true);
      expect(head.size).toBe(SIZE);
      expect(typeof head.etag).toBe('string');
      expect(head.etag.length).toBeGreaterThan(0);

      const got = await client.getObject(key);
      expect(got.ok).toBe(true);
      expect(got.bytes).toHaveLength(SIZE);
      expect(sha256(got.bytes)).toBe(expectedHash);

      const start = 1024;
      const end = start + 127;
      const range = await client.getObjectRange(key, { start, end });
      expect(range.ok).toBe(true);
      expect([...range.bytes]).toEqual([...data.slice(start, end + 1)]);

      const listed = await client.listObjects('contract/');
      expect(listed.ok).toBe(true);
      expect(listed.items.some((item) => item.key === key && item.size === SIZE)).toBe(true);

      const del = await client.deleteObject(key);
      expect(del.ok).toBe(true);
      const after = await client.headObject(key);
      expect(after.ok).toBe(false);
      expect(after.status).toBe(404);
    });

    it('multipart：create → uploadPart×2 → complete 后字节一致；abort 后对象不存在', async () => {
      const key = 'contract/multipart.bin';
      const data = seededBytes(SIZE, 0xa5);

      const created = await client.createMultipart(key);
      expect(created.ok, `createMultipart 失败：${created.status} ${created.message}`).toBe(true);
      const uploadId = created.uploadId;
      expect(typeof uploadId).toBe('string');
      expect(uploadId.length).toBeGreaterThan(0);

      const half = Math.floor(SIZE / 2);
      const part1 = await client.uploadPart(key, uploadId, 1, data.slice(0, half));
      expect(part1.ok, `uploadPart#1 失败：${part1.status} ${part1.message}`).toBe(true);
      expect(part1.etag).toBeTruthy();
      const part2 = await client.uploadPart(key, uploadId, 2, data.slice(half));
      expect(part2.ok, `uploadPart#2 失败：${part2.status} ${part2.message}`).toBe(true);
      expect(part2.etag).toBeTruthy();

      const completed = await client.completeMultipart(key, uploadId, [
        { partNumber: 1, etag: part1.etag },
        { partNumber: 2, etag: part2.etag },
      ]);
      expect(completed.ok, `completeMultipart 失败：${completed.status} ${completed.message}`).toBe(true);

      const got = await client.getObject(key);
      expect(got.ok).toBe(true);
      expect(got.bytes).toHaveLength(SIZE);
      expect(sha256(got.bytes)).toBe(sha256(data));

      const abortKey = 'contract/aborted.bin';
      const created2 = await client.createMultipart(abortKey);
      expect(created2.ok).toBe(true);
      const abortedPart = await client.uploadPart(
        abortKey, created2.uploadId, 1, seededBytes(1024, 0x11),
      );
      expect(abortedPart.ok, `uploadPart(abort) 失败：${abortedPart.status}`).toBe(true);
      const aborted = await client.abortMultipart(abortKey, created2.uploadId);
      expect(aborted.ok, `abortMultipart 失败：${aborted.status} ${aborted.message}`).toBe(true);
      const afterAbort = await client.headObject(abortKey);
      expect(afterAbort.ok).toBe(false);
      expect(afterAbort.status).toBe(404);
    });

    it('prefix 含 ../ 时最终 key 不出现 .. 段（与 path-safety.js 一致）', async () => {
      const key = objectKey('../evil', 'leak.bin'); // '../evil/leak.bin'
      const data = seededBytes(2048, 0x33);
      const put = await client.putObject(key, data);
      expect(put.ok, `putObject(../) 失败：${put.status} ${put.message}`).toBe(true);

      /* 客户端净化后落点应是 _/evil/leak.bin，服务端看到的 key 不得含 .. 段。 */
      expect(sanitizeRelativePath(key)).toBe('_/evil/leak.bin');
      expect(encodePath(key).split('/')).not.toContain('..');

      const listed = await client.listObjects();
      expect(listed.ok).toBe(true);
      const keys = listed.items.map((item) => item.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.some((k) => k.split('/').includes('..'))).toBe(false);
      expect(keys.some((k) => k.includes('evil'))).toBe(true);

      /* 服务器暴露 objects(Map/对象)时复核物理 key，避免只信 list 的解析结果。 */
      if (server.objects) {
        const objectKeys = server.objects instanceof Map
          ? [...server.objects.keys()]
          : Object.keys(server.objects);
        expect(objectKeys.some((k) => String(k).split('/').includes('..'))).toBe(false);
      }

      await client.deleteObject(key);
    });

    it('所有 S3 请求带 Authorization；裸请求缺头被服务器 403 拒绝', async () => {
      const realFetch = globalThis.fetch;
      const seen = [];
      const capturingFetch = (url, init = {}) => {
        seen.push(init.headers?.Authorization ?? init.headers?.authorization);
        return realFetch(url, init);
      };
      const capturing = createS3Client({ config, fetchImpl: capturingFetch, crypto: webcrypto });
      const key = 'contract/auth.bin';
      const put = await capturing.putObject(key, seededBytes(512, 0x77));
      expect(put.ok, `putObject(auth) 失败：${put.status} ${put.message}`).toBe(true);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((value) => /^AWS4-HMAC-SHA256\s/.test(String(value || '')))).toBe(true);

      const base = String(config.endpoint).replace(/\/+$/, '');
      const bare = await realFetch(`${base}/${config.bucket}/contract/auth-probe`, { method: 'GET' });
      expect(bare.status).toBe(403);

      await capturing.deleteObject(key);
    });
  });

  describe('WebDAV 客户端', () => {
    let server;
    let client;
    let config;

    beforeAll(async () => {
      server = await startWebdavServer({ port: 0, host: '127.0.0.1' });
      config = {
        baseUrl: server.baseUrl || server.url,
        username: server.username || 'tester',
        password: server.password || 'password',
      };
      client = createWebdavClient({ config });
      expect(client.ready).toBe(true);
    });

    afterAll(async () => {
      if (server?.close) await server.close();
    });

    it('probe → ensureCollection → putObject → headObject/getObject → list 包含文件名 → deleteObject 后 404', async () => {
      const probe = await client.probe();
      expect(probe.ok).toBe(true);
      expect(probe.canRead).toBe(true);
      expect(probe.canWrite).toBe(true);
      expect(probe.canList).toBe(true);

      const dir = `contract/basic-${Date.now().toString(36)}`;
      const made = await client.ensureCollection(dir);
      expect(made.ok, `ensureCollection 失败：${JSON.stringify(made.results)}`).toBe(true);

      const name = `${dir}/payload.bin`;
      const data = seededBytes(SIZE, 0xc3);
      const put = await client.putObject(name, data);
      expect(put.ok, `putObject 失败：${put.status} ${put.message}`).toBe(true);

      const head = await client.headObject(name);
      expect(head.ok).toBe(true);
      expect(head.size).toBe(SIZE);

      const got = await client.getObject(name);
      expect(got.ok).toBe(true);
      expect(got.bytes).toHaveLength(SIZE);
      expect(sha256(got.bytes)).toBe(sha256(data));

      const listed = await client.list(dir);
      expect(listed.ok, `list 失败：${listed.status} ${listed.code}`).toBe(true);
      expect(listed.items.some((item) => item.name === 'payload.bin')).toBe(true);

      const del = await client.deleteObject(name);
      expect(del.ok, `deleteObject 失败：${del.status}`).toBe(true);
      const after = await client.headObject(name);
      expect(after.ok).toBe(false);
      expect(after.status).toBe(404);
    });

    it('父目录不存在时 PUT 返回 409/404；ensureCollection 后可写', async () => {
      const dir = `contract/orphan-${Date.now().toString(36)}`;
      const name = `${dir}/child.bin`;
      const data = seededBytes(1024, 0x99);

      const missing = await client.putObject(name, data);
      expect(missing.ok).toBe(false);
      expect([404, 409]).toContain(missing.status);

      const made = await client.ensureCollection(dir);
      expect(made.ok).toBe(true);
      const put = await client.putObject(name, data);
      expect(put.ok, `ensureCollection 后 PUT 仍失败：${put.status} ${put.message}`).toBe(true);
      const got = await client.getObject(name);
      expect(got.ok).toBe(true);
      expect(sha256(got.bytes)).toBe(sha256(data));
      await client.deleteObject(name);
    });

    it('所有 WebDAV 请求都带 Authorization（Basic）', async () => {
      /* 契约边界：本机 WebDAV 服务器只要求客户端带 Authorization，自身不校验、
         也不对裸请求返回 401/403；S3 服务器才做缺头 403 负向（见 S3 套件）。
         因此这里只验证客户端侧义务：每个请求都带 Basic 头。 */
      const realFetch = globalThis.fetch;
      const seen = [];
      const capturingFetch = (url, init = {}) => {
        seen.push(init.headers?.Authorization ?? init.headers?.authorization);
        return realFetch(url, init);
      };
      const capturing = createWebdavClient({ config, fetchImpl: capturingFetch });
      const dir = `contract/auth-${Date.now().toString(36)}`;
      expect((await capturing.ensureCollection(dir)).ok).toBe(true);
      const name = `${dir}/a.bin`;
      expect((await capturing.putObject(name, seededBytes(256, 0x44))).ok).toBe(true);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((value) => /^Basic\s+/i.test(String(value || '')))).toBe(true);

      await capturing.deleteObject(name);
    });
  });
});

/*
 * 契约记录 / 缺陷备注（运行验证后填写，禁止改产品代码）：
 * - 客户端缺陷：未发现。S3 与 WebDAV 客户端在上述 7 项真实 HTTP 契约中全部通过。
 * - 服务器侧观察（非客户端缺陷）：本地 WebDAV 测试服务器不校验 Authorization，
 *   裸请求缺头也不会返回 401/403；S3 服务器才强制缺头 403。故 WebDAV 负向断言
 *   只验证「客户端每次请求都带 Basic 头」，不假设服务器拒绝裸请求。
 */
