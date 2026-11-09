/**
 * WebDAV 客户端（纯逻辑 + 注入 fetch）
 *
 * 设计前提（用户裁定 2026-11-09）：**任何单一方法被禁都不能让整体失败**。
 * 主路径只依赖 GET / PUT / HEAD / DELETE；PROPFIND / MKCOL / OPTIONS 全部可降级。
 * 不使用 PATCH / LOCK / MOVE 作为主路径。
 *
 * 分层约束：`src/core/`，禁止 DOM；浏览器与 Node 共用。
 */

const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?>'
  + '<d:propfind xmlns:d="DAV:"><d:prop>'
  + '<d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/>'
  + '</d:prop></d:propfind>';

const DEFAULT_TIMEOUT_MS = 20_000;

/** 路径段编码，保留 `/`。 */
export function encodeDavPath(path) {
  return String(path || '').split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

/** 拼接 WebDAV 对象地址；base 末尾斜杠归一。 */
export function joinDavUrl(baseUrl, name = '') {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const tail = String(name || '').replace(/^\/+/, '');
  if (!base) return '';
  return tail ? `${base}/${encodeDavPath(tail)}` : base;
}

/** `Allow: OPTIONS, GET, PUT` → Set('OPTIONS','GET','PUT')。 */
export function parseOptionsAllow(header) {
  return new Set(
    String(header || '')
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  );
}

function pickTag(block, tag) {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`,
    'i',
  );
  const match = re.exec(String(block || ''));
  return match ? match[1].trim() : '';
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 解析 PROPFIND 207 响应。
 * 不依赖 DOMParser（核心层禁止 DOM），用容错正则处理带/不带命名空间两种形状。
 * @param {string} xml
 * @returns {Array<{href:string,name:string,size:number,lastModified:string,isDir:boolean}>}
 */
export function parsePropfindXml(xml) {
  const blocks = String(xml || '').match(
    /<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/gi,
  ) || [];
  return blocks.map((block) => {
    const href = pickTag(block, 'href');
    if (!href) return null;
    const rawName = href.split('/').filter(Boolean).pop() || '';
    return {
      href,
      name: safeDecode(rawName),
      size: Number(pickTag(block, 'getcontentlength')) || 0,
      lastModified: pickTag(block, 'getlastmodified'),
      isDir: /<(?:[\w-]+:)?collection\b/i.test(block),
    };
  }).filter(Boolean);
}

/** 从 `<d:upload-id>` 之类的 XML 取一个标签值。 */
export function pickXmlTag(xml, tag) {
  return pickTag(xml, tag);
}

function base64(text) {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(unescape(encodeURIComponent(text)));
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf8').toString('base64');
  }
  return '';
}

/** 错误分类：调用方据此提示，不做无意义重试。 */
export function classifyDavError(status, error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (error?.name === 'AbortError') return 'timeout';
  if (status === 0) {
    return /failed to fetch|networkerror|load failed/.test(message) ? 'cors-blocked' : 'network';
  }
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 405 || status === 501) return 'method-not-allowed';
  if (status === 409) return 'conflict';
  if (status === 423) return 'locked';
  if (status >= 500) return 'server';
  return 'http';
}

/**
 * 创建 WebDAV 客户端。
 * @param {{
 *   config: {baseUrl:string, username?:string, password?:string},
 *   fetchImpl?: Function,
 *   timeoutMs?: number,
 * }} options
 */
export function createWebdavClient({
  config = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
  const ready = Boolean(baseUrl && fetchImpl);
  const auth = config.username
    ? `Basic ${base64(`${config.username}:${config.password || ''}`)}`
    : '';

  async function request(method, name, { body, headers = {}, range } = {}) {
    if (!ready) return { ok: false, status: 0, code: 'not-configured', message: 'not-configured' };
    const url = joinDavUrl(baseUrl, name);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const sendHeaders = { ...headers };
    if (auth) sendHeaders.Authorization = auth;
    if (range) sendHeaders.Range = range;
    try {
      const response = await fetchImpl(url, {
        method,
        headers: sendHeaders,
        body,
        signal: controller?.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          code: classifyDavError(response.status),
          message: `http-${response.status}`,
          headers: response.headers,
        };
      }
      return { ok: true, status: response.status, headers: response.headers, response };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        code: classifyDavError(0, error),
        message: String(error?.message || error),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    ready,
    baseUrl,

    /** OPTIONS 探测能力；405/501 也不算整体失败（degraded）。 */
    async probe() {
      const result = await request('OPTIONS', '');
      if (!result.ok && result.code !== 'method-not-allowed') return result;
      const allow = result.ok ? parseOptionsAllow(result.headers?.get?.('allow')) : new Set();
      const known = allow.size > 0;
      return {
        ok: true,
        status: result.status,
        allow,
        degraded: !result.ok || !known,
        canRead: known ? (allow.has('GET') || allow.has('HEAD')) : true,
        canWrite: known ? allow.has('PUT') : true,
        canList: known ? allow.has('PROPFIND') : true,
        canMakeCollection: known ? allow.has('MKCOL') : true,
        canDelete: known ? allow.has('DELETE') : true,
      };
    },

    async headObject(name) {
      const result = await request('HEAD', name);
      if (!result.ok) return result;
      return {
        ok: true,
        status: result.status,
        size: Number(result.headers?.get?.('content-length')) || 0,
        etag: String(result.headers?.get?.('etag') || '').replace(/^"|"$/g, ''),
        lastModified: String(result.headers?.get?.('last-modified') || ''),
      };
    },

    async getObject(name, { range } = {}) {
      const result = await request('GET', name, { range });
      if (!result.ok) return result;
      return {
        ok: true,
        status: result.status,
        bytes: new Uint8Array(await result.response.arrayBuffer()),
      };
    },

    async putObject(name, bytes, { contentType = 'application/octet-stream' } = {}) {
      return request('PUT', name, {
        body: bytes,
        headers: { 'Content-Type': contentType },
      });
    },

    async deleteObject(name) {
      const result = await request('DELETE', name);
      // 404 视为已经不存在；删除语义上等价成功。
      if (!result.ok && result.status === 404) return { ok: true, status: 404, alreadyMissing: true };
      return result;
    },

    /** MKCOL；405（已存在）/409（父级缺失）由调用方决定是否补父级。 */
    async makeCollection(name) {
      const result = await request('MKCOL', name);
      if (!result.ok && (result.status === 405 || result.status === 409)) {
        return { ok: true, status: result.status, alreadyExists: result.status === 405, parentMissing: result.status === 409 };
      }
      return result;
    },

    /**
     * 逐级创建集合；单级 405/409 不阻断，由最终 PUT 给出真实结果。
     * @param {string} path
     */
    async ensureCollection(path) {
      const segments = String(path || '').split('/').filter(Boolean);
      let current = '';
      const results = [];
      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        const result = await request('MKCOL', current);
        const normalized = (!result.ok && (result.status === 405 || result.status === 409))
          ? { ok: true, status: result.status, alreadyExists: result.status === 405, parentMissing: result.status === 409 }
          : result;
        results.push({ path: current, ...normalized });
        if (!normalized.ok) return { ok: false, results };
      }
      return { ok: true, results };
    },

    /** PROPFIND Depth:1；405/501 明确返回 `list-not-supported`。 */
    async list(name = '') {
      const result = await request('PROPFIND', name, {
        headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
        body: PROPFIND_BODY,
      });
      if (!result.ok) {
        if (result.status === 405 || result.status === 501) {
          return { ok: false, status: result.status, code: 'list-not-supported' };
        }
        return result;
      }
      const xml = await result.response.text();
      return { ok: true, status: result.status, items: parsePropfindXml(xml) };
    },
  };
}
