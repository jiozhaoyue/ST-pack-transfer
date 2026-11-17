'use strict';

/**
 * 本机 S3 兼容测试服务器（仅测试用）。
 *
 * 定位：给 src/core/s3-client.js 的真实 HTTP 通道做端到端验证。
 * 限制：
 *   1. 不做 SigV4 真校验，只要求 Authorization 头存在（缺失 → 403），
 *      借此确认客户端确实签名并带上头。
 *   2. 内存 Map 存储，进程退出即丢；无持久化、无鉴权、无 TLS。
 *   3. 仅实现客户端用得到的子集（见 README），不是通用 S3 实现。
 *   4. 默认监听端口 0（系统分配），避免占用 3040 / 酒馆实例端口。
 *
 * 响应格式遵循 S3：XML 无命名空间前缀（客户端用正则按裸标签解析），
 * ETag 带双引号，LastModified 为 ISO 8601，Range 命中返回 206 + Content-Range。
 */

const http = require('node:http');
const crypto = require('node:crypto');

/** 安全解码单段：坏百分号编码原样返回，不抛异常。 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** XML 文本转义，防止 key 中的 & < > 破坏结构。 */
function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 单段 MD5 作为 ETag（与 S3 单段上传一致）；真实多段 ETag 规则不同，测试无需。 */
function etagOf(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

/** 一次性读完请求体；测试服务器设 256 MiB 上限防止失控。 */
function readBody(req, limit = 256 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 从 URL 取 bucket 与 key：第一段是 bucket，其余按 '/' 拼回 key（key 可含 '/'）。 */
function splitUrl(url) {
  const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
  return { bucket: parts[0] || '', key: parts.slice(1).join('/') };
}

/**
 * 解析 `Range: bytes=a-b`，返回 {start,end} 或字符串 'unsatisfiable' / null。
 * 支持 a-b、a-（到末尾）、-n（末尾 n 字节）三种形式。
 */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return 'unsatisfiable';
  }
  return { start, end: Math.min(end, size - 1) };
}

/** 统一写响应头：CORS 便于浏览器直连测试，Expose-Headers 让客户端读到 ETag。 */
function baseHeaders(res, extra = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range,X-Amz-Date,X-Amz-Content-Sha256');
  res.setHeader('Access-Control-Expose-Headers', 'ETag,Content-Length,Content-Range,Last-Modified');
  for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
}

function sendXml(res, status, xml, extra = {}) {
  const body = Buffer.from(xml, 'utf8');
  baseHeaders(res, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Length': String(body.length), ...extra });
  res.writeHead(status);
  res.end(body);
}

function sendEmpty(res, status, extra = {}) {
  baseHeaders(res, { 'Content-Length': '0', ...extra });
  res.writeHead(status);
  res.end();
}

function sendError(res, status, code, message) {
  sendXml(res, status, `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${xmlEscape(message)}</Message></Error>`);
}

/**
 * 启动服务器。
 * @param {{port?:number, host?:string}} options port 默认 0（系统分配）
 * @returns {Promise<{url:string, port:number, close:Function, objects:Map, uploads:Map}>}
 */
async function startS3Server({ port = 0, host = '127.0.0.1' } = {}) {
  /** key -> { body: Buffer, etag: string, lastModified: string, contentType: string } */
  const objects = new Map();
  /** uploadId -> { key, parts: Map<number,Buffer>, createdAt: string } */
  const uploads = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      // 浏览器跨域预检不带 Authorization，必须放行；显式 Allow 头供调试。
      if (req.method === 'OPTIONS') {
        sendEmpty(res, 204, { Allow: 'GET,HEAD,PUT,POST,DELETE,OPTIONS' });
        return;
      }

      // 不做签名验算，但强制要求头存在：缺头即 403，证明客户端没签名。
      if (!req.headers.authorization) {
        sendError(res, 403, 'AccessDenied', 'Authorization header required');
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || host}`);
      const { bucket, key } = splitUrl(url);
      const params = url.searchParams;
      const method = req.method || 'GET';

      // ---- ListObjectsV2：GET /{bucket}/?list-type=2&prefix=... ----
      if (method === 'GET' && params.get('list-type') === '2') {
        const prefix = params.get('prefix') || '';
        const maxKeys = Math.max(1, Number(params.get('max-keys')) || 1000);
        const token = params.get('continuation-token') || '';
        const after = token ? safeDecode(Buffer.from(token, 'base64').toString('utf8')) : '';
        const keys = [...objects.keys()]
          .filter((k) => k.startsWith(prefix) && (!after || k > after))
          .sort();
        const page = keys.slice(0, maxKeys);
        const truncated = keys.length > maxKeys;
        const nextToken = truncated ? Buffer.from(page[page.length - 1]).toString('base64') : '';
        const contents = page.map((k) => {
          const obj = objects.get(k);
          return '<Contents>'
            + `<Key>${xmlEscape(k)}</Key>`
            + `<LastModified>${obj.lastModified}</LastModified>`
            + `<ETag>"${obj.etag}"</ETag>`
            + `<Size>${obj.body.length}</Size>`
            + '<StorageClass>STANDARD</StorageClass>'
            + '</Contents>';
        }).join('');
        sendXml(res, 200, '<?xml version="1.0" encoding="UTF-8"?>\n'
          + '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
          + `<Name>${xmlEscape(bucket)}</Name><Prefix>${xmlEscape(prefix)}</Prefix>`
          + `<KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys>`
          + `<IsTruncated>${truncated ? 'true' : 'false'}</IsTruncated>`
          + (nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : '')
          + contents
          + '</ListBucketResult>');
        return;
      }

      // ---- 分片上传：Initiate / UploadPart / Complete / Abort ----
      if (method === 'POST' && params.has('uploads')) {
        const uploadId = crypto.randomUUID();
        uploads.set(uploadId, { key, parts: new Map(), createdAt: nowIso() });
        sendXml(res, 200, '<?xml version="1.0" encoding="UTF-8"?>\n'
          + '<InitiateMultipartUploadResult>'
          + `<Bucket>${xmlEscape(bucket)}</Bucket><Key>${xmlEscape(key)}</Key>`
          + `<UploadId>${uploadId}</UploadId>`
          + '</InitiateMultipartUploadResult>');
        return;
      }

      if (params.has('uploadId')) {
        const uploadId = params.get('uploadId');
        const upload = uploads.get(uploadId);

        // PUT ?partNumber=N&uploadId=...：按分片号存内存，ETag 为分片内容 MD5。
        if (method === 'PUT' && params.has('partNumber')) {
          if (!upload) {
            sendError(res, 404, 'NoSuchUpload', 'unknown uploadId');
            return;
          }
          const partNumber = Math.trunc(Number(params.get('partNumber')));
          if (!Number.isFinite(partNumber) || partNumber < 1) {
            sendError(res, 400, 'InvalidArgument', 'invalid partNumber');
            return;
          }
          const body = await readBody(req);
          upload.parts.set(partNumber, body);
          sendEmpty(res, 200, { ETag: `"${etagOf(body)}"` });
          return;
        }

        // POST ?uploadId=...：按 PartNumber 升序拼接所有分片，落为正式对象。
        if (method === 'POST') {
          if (!upload) {
            sendError(res, 404, 'NoSuchUpload', 'unknown uploadId');
            return;
          }
          await readBody(req); // 客户端发 CompleteMultipartUpload XML；本服务器按已存分片拼装，忽略其 ETag 声明。
          const numbers = [...upload.parts.keys()].sort((a, b) => a - b);
          if (!numbers.length) {
            sendError(res, 400, 'InvalidRequest', 'no parts uploaded');
            return;
          }
          const body = Buffer.concat(numbers.map((n) => upload.parts.get(n)));
          const etag = etagOf(body);
          objects.set(upload.key, {
            body,
            etag,
            lastModified: nowIso(),
            contentType: 'application/octet-stream',
          });
          uploads.delete(uploadId);
          sendXml(res, 200, '<?xml version="1.0" encoding="UTF-8"?>\n'
            + '<CompleteMultipartUploadResult>'
            + `<Location>${xmlEscape(url.origin + url.pathname)}</Location>`
            + `<Bucket>${xmlEscape(bucket)}</Bucket><Key>${xmlEscape(upload.key)}</Key>`
            + `<ETag>"${etag}"</ETag>`
            + '</CompleteMultipartUploadResult>');
          return;
        }

        // DELETE ?uploadId=...：放弃上传；不存在视作已删除（与客户端 abort 语义一致）。
        if (method === 'DELETE') {
          if (!upload) {
            sendError(res, 404, 'NoSuchUpload', 'unknown uploadId');
            return;
          }
          uploads.delete(uploadId);
          sendEmpty(res, 204);
          return;
        }
      }

      if (!key) {
        sendError(res, 400, 'InvalidRequest', 'missing key');
        return;
      }

      // ---- 对象级操作 ----
      if (method === 'PUT') {
        const body = await readBody(req);
        const etag = etagOf(body);
        objects.set(key, {
          body,
          etag,
          lastModified: nowIso(),
          contentType: String(req.headers['content-type'] || 'application/octet-stream'),
        });
        sendEmpty(res, 200, { ETag: `"${etag}"` });
        return;
      }

      if (method === 'HEAD' || method === 'GET') {
        const obj = objects.get(key);
        if (!obj) {
          if (method === 'HEAD') sendEmpty(res, 404);
          else sendError(res, 404, 'NoSuchKey', 'not found');
          return;
        }
        const common = {
          ETag: `"${obj.etag}"`,
          'Last-Modified': obj.lastModified,
          'Content-Type': obj.contentType,
          'Accept-Ranges': 'bytes',
        };
        if (method === 'HEAD') {
          sendEmpty(res, 200, { ...common, 'Content-Length': String(obj.body.length) });
          return;
        }
        const range = parseRange(req.headers.range, obj.body.length);
        if (range === 'unsatisfiable') {
          sendError(res, 416, 'InvalidRange', 'range not satisfiable');
          return;
        }
        if (range) {
          const slice = obj.body.subarray(range.start, range.end + 1);
          sendEmptyWithBody(res, 206, slice, {
            ...common,
            'Content-Length': String(slice.length),
            'Content-Range': `bytes ${range.start}-${range.end}/${obj.body.length}`,
          });
          return;
        }
        sendEmptyWithBody(res, 200, obj.body, { ...common, 'Content-Length': String(obj.body.length) });
        return;
      }

      if (method === 'DELETE') {
        if (!objects.has(key)) {
          sendError(res, 404, 'NoSuchKey', 'not found');
          return;
        }
        objects.delete(key);
        sendEmpty(res, 204);
        return;
      }

      sendError(res, 405, 'MethodNotAllowed', `unsupported method ${method}`);
    } catch (error) {
      if (!res.headersSent) sendError(res, 500, 'InternalError', String(error?.message || error));
    }
  });

  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const actualPort = server.address().port;
  return {
    url: `http://${host}:${actualPort}`,
    port: actualPort,
    objects,
    uploads,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections?.(); // 掐掉 keep-alive，避免 close 挂住。
      });
    },
  };
}

/** 带响应体的发送（HEAD 绝不能走这里）。 */
function sendEmptyWithBody(res, status, body, extra) {
  baseHeaders(res, extra);
  res.writeHead(status);
  res.end(body);
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 0;
  startS3Server({ port }).then(({ url, port: actualPort, close }) => {
    console.log(JSON.stringify({ url, port: actualPort }));
    const stop = async () => {
      try { await close(); } finally { process.exit(0); }
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { startS3Server };
