'use strict';

/**
 * 本机 WebDAV 测试服务器（仅测试用）。
 *
 * 定位：给 src/core/webdav-client.js 的真实 HTTP 通道做端到端验证。
 * 限制：
 *   1. 内存目录树（files Map + dirs Set），进程退出即丢；无鉴权、无 TLS、无 LOCK/MOVE。
 *   2. 只实现客户端用得到的子集（见 README），不是通用 WebDAV 实现。
 *   3. PROPFIND 只支持 Depth 0/1（infinity 当作 1，防止无限展开）。
 *   4. PUT 要求父集合已存在，否则 409（与 Apache mod_dav 行为一致），
 *      由客户端 ensureCollection 逐级 MKCOL 补齐。
 *   5. 默认端口 0（系统分配），避免占用 3040 / 酒馆实例端口。
 *
 * 207 XML 用 d: 前缀 + xmlns:d="DAV:"，与客户端 PROPFIND_BODY 一致；
 * 客户端解析用宽松正则，带/不带前缀均可。
 */

const http = require('node:http');
const crypto = require('node:crypto');

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function etagOf(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

/** URL 路径 → 内部路径：逐段解码、去首尾空段、不保留尾斜杠。根为 ''。 */
function pathFromUrl(url) {
  return url.pathname.split('/').filter(Boolean).map(safeDecode).join('/');
}

/** 内部路径 → href：逐段编码、目录补尾斜杠（真实 WebDAV 惯例）。 */
function hrefOf(path, isDir) {
  const encoded = path.split('/').filter(Boolean).map((seg) => encodeURIComponent(seg)).join('/');
  return `/${encoded}${isDir && encoded ? '/' : ''}`;
}

function parentOf(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function nameOf(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? path : path.slice(index + 1);
}

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

function baseHeaders(res, extra = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET,HEAD,PUT,DELETE,PROPFIND,MKCOL');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range,Depth');
  res.setHeader('Access-Control-Expose-Headers', 'ETag,Content-Length,Content-Range,Last-Modified');
  for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
}

function sendWithBody(res, status, body, extra = {}) {
  baseHeaders(res, extra);
  res.writeHead(status);
  res.end(body);
}

function sendEmpty(res, status, extra = {}) {
  baseHeaders(res, { 'Content-Length': '0', ...extra });
  res.writeHead(status);
  res.end();
}

function sendText(res, status, text) {
  const body = Buffer.from(text, 'utf8');
  sendWithBody(res, status, body, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(body.length) });
}

/** 拼一个 <d:response> 条目；isDir 时输出 <d:collection/>。 */
function responseXml(path, { isDir, size, lastModified, etag, contentType }) {
  const resourceType = isDir ? '<d:collection/>' : '';
  const typeXml = contentType ? `<d:getcontenttype>${xmlEscape(contentType)}</d:getcontenttype>` : '';
  return '<d:response>'
    + `<d:href>${xmlEscape(hrefOf(path, isDir))}</d:href>`
    + '<d:propstat><d:prop>'
    + `<d:displayname>${xmlEscape(nameOf(path))}</d:displayname>`
    + `<d:getcontentlength>${size}</d:getcontentlength>`
    + `<d:getlastmodified>${xmlEscape(lastModified)}</d:getlastmodified>`
    + (etag ? `<d:getetag>"${etag}"</d:getetag>` : '')
    + typeXml
    + `<d:resourcetype>${resourceType}</d:resourcetype>`
    + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>'
    + '</d:response>';
}

/**
 * 启动服务器。
 * @param {{port?:number, host?:string}} options port 默认 0（系统分配）
 * @returns {Promise<{url:string, port:number, close:Function, files:Map, dirs:Set}>}
 */
async function startWebdavServer({ port = 0, host = '127.0.0.1' } = {}) {
  /** path -> { body: Buffer, etag: string, lastModified: string, contentType: string } */
  const files = new Map();
  /** 已创建的集合路径集合；根 '' 恒存在，不显式存入。 */
  const dirs = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || host}`);
      const path = pathFromUrl(url);
      const method = req.method || 'GET';

      // OPTIONS：声明能力。Allow 只作参考，真实能力以 PUT/MKCOL 结果为准。
      if (method === 'OPTIONS') {
        sendEmpty(res, 200, {
          Allow: 'OPTIONS,GET,HEAD,PUT,DELETE,PROPFIND,MKCOL',
          DAV: '1,2',
          'MS-Author-Via': 'DAV',
        });
        return;
      }

      // PROPFIND：Depth 0 只报自身，Depth 1 报自身 + 直接子项；207 Multi-Status。
      if (method === 'PROPFIND') {
        await readBody(req); // 忽略请求体里的属性清单，固定返回客户端需要的属性。
        const depth = String(req.headers.depth || '1');
        const entities = [];

        const isDir = dirs.has(path) || path === '';
        const isFile = files.has(path);
        // 自身条目：根（''）不返回，否则客户端 list('') 无法过滤这个条目。
        if (path && (isDir || isFile)) {
          const obj = files.get(path);
          entities.push(responseXml(path, {
            isDir,
            size: obj ? obj.body.length : 0,
            lastModified: obj ? obj.lastModified : nowIso(),
            etag: obj ? obj.etag : '',
            contentType: obj ? obj.contentType : '',
          }));
        }

        if (depth !== '0' && isDir) {
          for (const dir of dirs) {
            if (parentOf(dir) === path) {
              entities.push(responseXml(dir, { isDir: true, size: 0, lastModified: nowIso(), etag: '', contentType: '' }));
            }
          }
          for (const [file, obj] of files) {
            if (parentOf(file) === path) {
              entities.push(responseXml(file, {
                isDir: false,
                size: obj.body.length,
                lastModified: obj.lastModified,
                etag: obj.etag,
                contentType: obj.contentType,
              }));
            }
          }
        }

        const xml = '<?xml version="1.0" encoding="utf-8"?>\n'
          + '<d:multistatus xmlns:d="DAV:">' + entities.join('') + '</d:multistatus>';
        sendWithBody(res, 207, Buffer.from(xml, 'utf8'), {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Length': String(Buffer.byteLength(xml, 'utf8')),
        });
        return;
      }

      // MKCOL：父级不存在 → 409；已存在 → 405（客户端把 405 当 alreadyExists）。
      if (method === 'MKCOL') {
        if (!path) {
          sendText(res, 403, 'cannot create root collection');
          return;
        }
        if (dirs.has(path) || files.has(path)) {
          sendText(res, 405, 'collection already exists');
          return;
        }
        const parent = parentOf(path);
        if (parent && !dirs.has(parent)) {
          sendText(res, 409, 'parent collection missing');
          return;
        }
        dirs.add(path);
        sendEmpty(res, 201);
        return;
      }

      // PUT：父级必须已存在（否则 409）；目标是目录 → 405。覆盖返回 204，新建返回 201。
      if (method === 'PUT') {
        if (!path || dirs.has(path)) {
          sendText(res, path ? 405 : 403, 'invalid target');
          return;
        }
        const parent = parentOf(path);
        if (parent && !dirs.has(parent)) {
          sendText(res, 409, 'parent collection missing');
          return;
        }
        const body = await readBody(req);
        const existed = files.has(path);
        files.set(path, {
          body,
          etag: etagOf(body),
          lastModified: nowIso(),
          contentType: String(req.headers['content-type'] || 'application/octet-stream'),
        });
        sendEmpty(res, existed ? 204 : 201, { ETag: `"${etagOf(body)}"` });
        return;
      }

      if (method === 'HEAD' || method === 'GET') {
        const obj = files.get(path);
        if (!obj) {
          if (method === 'HEAD') sendEmpty(res, 404);
          else sendText(res, 404, 'not found');
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
          sendText(res, 416, 'range not satisfiable');
          return;
        }
        if (range) {
          const slice = obj.body.subarray(range.start, range.end + 1);
          sendWithBody(res, 206, slice, {
            ...common,
            'Content-Length': String(slice.length),
            'Content-Range': `bytes ${range.start}-${range.end}/${obj.body.length}`,
          });
          return;
        }
        sendWithBody(res, 200, obj.body, { ...common, 'Content-Length': String(obj.body.length) });
        return;
      }

      // DELETE：删文件返回 204；删空集合返回 204，非空返回 409；不存在返回 404。
      if (method === 'DELETE') {
        if (files.has(path)) {
          files.delete(path);
          sendEmpty(res, 204);
          return;
        }
        if (dirs.has(path)) {
          const hasChildren = [...dirs, ...files.keys()].some((child) => parentOf(child) === path);
          if (hasChildren) {
            sendText(res, 409, 'collection not empty');
            return;
          }
          dirs.delete(path);
          sendEmpty(res, 204);
          return;
        }
        sendText(res, 404, 'not found');
        return;
      }

      sendText(res, 405, `unsupported method ${method}`);
    } catch (error) {
      if (!res.headersSent) sendText(res, 500, String(error?.message || error));
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
    files,
    dirs,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections?.();
      });
    },
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 0;
  startWebdavServer({ port }).then(({ url, port: actualPort, close }) => {
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

module.exports = { startWebdavServer };
