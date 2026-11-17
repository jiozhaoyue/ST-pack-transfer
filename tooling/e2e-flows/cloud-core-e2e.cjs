/**
 * 核心全流程 E2E：真实数据包 → 本机 S3/WebDAV → 下载回读 → 哈希校验 → 结构化结果。
 *
 * 运行：node tooling/e2e-flows/cloud-core-e2e.cjs
 * 可选参数/环境变量：
 *   CLOUD_E2E_FIXTURE      指定 fixture 路径（默认取 fixtures/ 内最小 zip）
 *   CLOUD_E2E_BUCKET       S3 bucket（默认 e2e-bucket）
 *   CLOUD_E2E_AK/SK        S3 凭据（默认测试占位值）
 *   CLOUD_E2E_DAV_USER/PASS WebDAV 凭据（默认无鉴权）
 *
 * 服务器由并行任务产出，固定路径：
 *   tooling/local-cloud/s3-server.cjs     → startS3Server({port:0})    → {url, close()}
 *   tooling/local-cloud/webdav-server.cjs → startWebdavServer({port:0}) → {url, close()}
 * 缺失时明确报「依赖未就绪」并写失败证据，不自行实现服务器。
 *
 * 只用 Node 内置模块 + 仓内模块；不装依赖；不占用 3040；端口一律 0。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../..');
const S3_SERVER = path.join(ROOT, 'tooling', 'local-cloud', 's3-server.cjs');
const DAV_SERVER = path.join(ROOT, 'tooling', 'local-cloud', 'webdav-server.cjs');
const RESULT_ROOT = path.join(ROOT, 'test-results', 'e2e-flows');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function writeResult(result) {
  const dir = path.join(RESULT_ROOT, `cloud-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'result.json');
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return rel(file);
}

function pickFixture() {
  const explicit = process.env.CLOUD_E2E_FIXTURE || process.argv[2];
  if (explicit) {
    const abs = path.resolve(explicit);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`fixture 不存在：${explicit}`);
    }
    return abs;
  }
  const dir = path.join(ROOT, 'fixtures');
  if (!fs.existsSync(dir)) throw new Error('fixtures/ 目录不存在，请先 npm run gen-fixtures');
  const zips = fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .map((name) => {
      const file = path.join(dir, name);
      return { file, bytes: fs.statSync(file).size };
    })
    .sort((a, b) => a.bytes - b.bytes);
  if (!zips.length) throw new Error('fixtures/ 内无 zip，请先 npm run gen-fixtures');
  return zips[0].file; // 默认取最小真实包，保证可重复、快速
}

function mkChannel(name) {
  return {
    name,
    ok: false,
    failedStep: '',
    steps: [],
    putMs: 0,
    getMs: 0,
    upMBps: 0,
    downMBps: 0,
    headSize: 0,
    headSizeOk: false,
    downloadedSha256: '',
    sha256Ok: false,
    listFound: false,
    key: '',
  };
}

function step(ch, id, ok, detail) {
  ch.steps.push({ step: id, ok: !!ok, detail: String(detail || '') });
  if (!ok && !ch.failedStep) ch.failedStep = id;
  return ok;
}

function finish(ch) {
  ch.ok = !ch.failedStep && ch.sha256Ok && ch.headSizeOk && ch.listFound;
}

function loadServer(file, exportName) {
  const mod = require(file);
  const start = mod?.[exportName] || mod?.default?.[exportName] || mod?.default;
  if (typeof start !== 'function') throw new Error(`${rel(file)} 未导出 ${exportName}()`);
  return start;
}

async function runS3({ url, fileBuf, originalSha, key, prefix }) {
  const ch = mkChannel('s3');
  ch.key = key;
  try {
    const { createS3Client } = await import(pathToFileURL(path.join(ROOT, 'src', 'core', 's3-client.js')).href);
    const client = createS3Client({
      config: {
        endpoint: url,
        bucket: process.env.CLOUD_E2E_BUCKET || 'e2e-bucket',
        region: 'us-east-1',
        accessKeyId: process.env.CLOUD_E2E_AK || 'e2e',
        secretAccessKey: process.env.CLOUD_E2E_SK || 'e2e',
        pathStyle: true,
      },
      fetchImpl: globalThis.fetch,
      crypto: globalThis.crypto,
    });
    if (!step(ch, 'config', client.ready, 'client.ready')) return ch;

    const tPut = now();
    const put = await client.putObject(key, fileBuf, { contentType: 'application/zip' });
    ch.putMs = +(now() - tPut).toFixed(3);
    if (!step(ch, 'put', put.ok, put.message || `http-${put.status}`)) return ch;
    ch.upMBps = +(fileBuf.length / 1e6 / (ch.putMs / 1000)).toFixed(3);

    const head = await client.headObject(key);
    ch.headSize = head.size || 0;
    ch.headSizeOk = head.ok && head.size === fileBuf.length;
    if (!step(ch, 'head', ch.headSizeOk, `size=${head.size}/${fileBuf.length}`)) return ch;

    const tGet = now();
    const got = await client.getObject(key);
    ch.getMs = +(now() - tGet).toFixed(3);
    if (!step(ch, 'get', got.ok, got.message || `http-${got.status}`)) return ch;
    ch.downMBps = +(got.bytes.length / 1e6 / (ch.getMs / 1000)).toFixed(3);
    ch.downloadedSha256 = sha256(Buffer.from(got.bytes));
    ch.sha256Ok = ch.downloadedSha256 === originalSha;
    step(ch, 'sha256', ch.sha256Ok, ch.sha256Ok ? originalSha : `${ch.downloadedSha256} != ${originalSha}`);

    const list = await client.listObjects(prefix);
    ch.listFound = list.ok && list.items.some((it) => it.key === key);
    step(ch, 'list', ch.listFound, list.ok ? `${list.items.length} 项` : (list.message || `http-${list.status}`));
  } catch (error) {
    step(ch, 'exception', false, String(error?.message || error));
  }
  finish(ch);
  return ch;
}

async function runWebdav({ url, fileBuf, originalSha, dir, name }) {
  const ch = mkChannel('webdav');
  const objName = `${dir}/${name}`;
  ch.key = objName;
  try {
    const { createWebdavClient } = await import(pathToFileURL(path.join(ROOT, 'src', 'core', 'webdav-client.js')).href);
    const client = createWebdavClient({
      config: {
        baseUrl: url,
        username: process.env.CLOUD_E2E_DAV_USER || '',
        password: process.env.CLOUD_E2E_DAV_PASS || '',
      },
      fetchImpl: globalThis.fetch,
    });
    if (!step(ch, 'config', client.ready, 'client.ready')) return ch;

    const ensured = await client.ensureCollection(dir);
    if (!step(ch, 'ensureCollection', ensured.ok, `MKCOL ${dir}`)) return ch;

    const tPut = now();
    const put = await client.putObject(objName, fileBuf, { contentType: 'application/zip' });
    ch.putMs = +(now() - tPut).toFixed(3);
    if (!step(ch, 'put', put.ok, put.message || `http-${put.status}`)) return ch;
    ch.upMBps = +(fileBuf.length / 1e6 / (ch.putMs / 1000)).toFixed(3);

    const head = await client.headObject(objName);
    ch.headSize = head.size || 0;
    ch.headSizeOk = head.ok && head.size === fileBuf.length;
    if (!step(ch, 'head', ch.headSizeOk, `size=${head.size}/${fileBuf.length}`)) return ch;

    const tGet = now();
    const got = await client.getObject(objName);
    ch.getMs = +(now() - tGet).toFixed(3);
    if (!step(ch, 'get', got.ok, got.message || `http-${got.status}`)) return ch;
    ch.downMBps = +(got.bytes.length / 1e6 / (ch.getMs / 1000)).toFixed(3);
    ch.downloadedSha256 = sha256(Buffer.from(got.bytes));
    ch.sha256Ok = ch.downloadedSha256 === originalSha;
    step(ch, 'sha256', ch.sha256Ok, ch.sha256Ok ? originalSha : `${ch.downloadedSha256} != ${originalSha}`);

    const list = await client.list(dir);
    ch.listFound = list.ok && list.items.some((it) => it.name === name);
    step(ch, 'list', ch.listFound, list.ok ? `${list.items.length} 项` : (list.code || list.message || `http-${list.status}`));
  } catch (error) {
    step(ch, 'exception', false, String(error?.message || error));
  }
  finish(ch);
  return ch;
}

async function main() {
  const startedAt = new Date().toISOString();
  const tStart = now();

  const missing = [S3_SERVER, DAV_SERVER].filter((p) => !fs.existsSync(p));
  if (missing.length) {
    const result = {
      stamp,
      startedAt,
      status: 'dependency-not-ready',
      passed: false,
      failures: [`依赖未就绪：缺少 ${missing.map(rel).join(', ')}`],
      note: '服务器由并行任务产出；本脚本不自行实现服务器。',
    };
    const file = writeResult(result);
    console.log(`[cloud-e2e] 依赖未就绪：缺少 ${missing.map(rel).join(', ')}`);
    console.log(`[cloud-e2e] FAIL result=${file}`);
    process.exitCode = 1;
    return;
  }

  let s3Server;
  let davServer;
  const fixture = pickFixture();
  const fileBuf = fs.readFileSync(fixture);
  const originalSha = sha256(fileBuf);
  const name = path.basename(fixture);
  const prefix = `e2e/${stamp}`;

  console.log(`[cloud-e2e] fixture=${rel(fixture)} bytes=${fileBuf.length} sha256=${originalSha.slice(0, 12)}…`);

  let s3;
  let dav;
  const failures = [];
  try {
    const startS3 = loadServer(S3_SERVER, 'startS3Server');
    const startWebdav = loadServer(DAV_SERVER, 'startWebdavServer');
    s3Server = await startS3({ port: 0 });
    davServer = await startWebdav({ port: 0 });

    s3 = await runS3({ url: s3Server.url, fileBuf, originalSha, key: `${prefix}/${name}`, prefix });
    dav = await runWebdav({ url: davServer.url, fileBuf, originalSha, dir: prefix, name });

    if (!s3.ok) failures.push(`s3:${s3.failedStep || 'unknown'}`);
    if (!dav.ok) failures.push(`webdav:${dav.failedStep || 'unknown'}`);

    const line = (ch) => `[cloud-e2e] ${ch.name} put=${ch.putMs}ms get=${ch.getMs}ms up=${ch.upMBps}MB/s down=${ch.downMBps}MB/s sha256=${ch.sha256Ok ? 'OK' : 'MISMATCH'} head=${ch.headSizeOk ? 'OK' : 'FAIL'} list=${ch.listFound ? 'OK' : 'FAIL'}${ch.failedStep ? ` failedStep=${ch.failedStep}` : ''}`;
    console.log(line(s3));
    console.log(line(dav));
  } catch (error) {
    failures.push(`runtime:${String(error?.message || error)}`);
    console.log(`[cloud-e2e] runtime error: ${String(error?.message || error)}`);
    s3 = s3 || mkChannel('s3');
    dav = dav || mkChannel('webdav');
  } finally {
    for (const srv of [davServer, s3Server]) {
      try {
        if (srv && typeof srv.close === 'function') await srv.close();
      } catch {
        /* 内存态服务器退出即释放，关闭失败不影响结论 */
      }
    }
  }

  const durationMs = +(now() - tStart).toFixed(3);
  const passed = failures.length === 0;
  const result = {
    stamp,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    passed,
    failures,
    fixture: { path: rel(fixture), bytes: fileBuf.length, sha256: originalSha },
    endpoint: { s3: s3Server?.url || '', webdav: davServer?.url || '' },
    s3,
    webdav: dav,
  };
  const file = writeResult(result);
  console.log(`[cloud-e2e] ${passed ? 'PASS' : 'FAIL'} result=${file}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.log(`[cloud-e2e] fatal: ${String(error?.message || error)}`);
  process.exitCode = 1;
});
