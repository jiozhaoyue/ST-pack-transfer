/**
 * WebDAV 客户端（纯逻辑 + 注入 fetch）
 *
 * 设计前提（用户裁定 2026-11-09）：**任何单一方法被禁都不能让整体失败**。
 * 主路径只依赖 GET / PUT / HEAD / DELETE；PROPFIND / MKCOL / OPTIONS 全部可降级。
 * 不使用 PATCH / LOCK / MOVE 作为主路径。
 *
 * 分层约束：`src/core/`，禁止 DOM；浏览器与 Node 共用。
 *
 * 2026-11-12 真机实测（Apache 2.4 mod_dav 前置 Caddy）：
 *   `OPTIONS` 的 `Allow` **不含 PUT / MKCOL**，但 `PUT` 201、`MKCOL` 201 都正常。
 *   ⇒ `Allow` 只能当**参考**，不能据此判定「不可写」；能力以真实请求结果为准。
 */

import { applyProxy } from './net-proxy.js';

const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?>'
  + '<d:propfind xmlns:d="DAV:"><d:prop>'
  + '<d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/>'
  + '</d:prop></d:propfind>';

const DEFAULT_TIMEOUT_MS = 20_000;
/**
 * 数据面（PUT / GET）超时单独放宽。
 *
 * 依据：分片默认 8 MiB，20 秒内传完要求 ≈410 KB/s。远端酒馆、家宽上行经常达不到，
 * 于是**每一片都超时**、上传永远失败（20 秒对控制类请求够，对数据面不够）。
 * 120 秒对应 ≈70 KB/s 下限；更慢的链路仍会如实超时，不伪造成功。
 */
const DEFAULT_TRANSFER_TIMEOUT_MS = 120_000;

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

/** 取 URL 的路径（解码、去尾斜杠），用于比较「是不是同一个条目」。 */
function pathOfUrl(url, base) {
  const raw = String(url || '');
  if (!raw) return '';
  try {
    const resolved = base ? new URL(raw, base.endsWith('/') ? base : `${base}/`) : new URL(raw);
    return safeDecode(resolved.pathname).replace(/\/+$/, '');
  } catch {
    return '';
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
 *   transferTimeoutMs?: number,
 *   proxyUrl?: string,
 * }} options
 */
export function createWebdavClient({
  config = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  transferTimeoutMs = DEFAULT_TRANSFER_TIMEOUT_MS,
  proxyUrl = '',
} = {}) {
  const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
  const ready = Boolean(baseUrl && fetchImpl);
  const auth = config.username
    ? `Basic ${base64(`${config.username}:${config.password || ''}`)}`
    : '';

  async function request(method, name, { body, headers = {}, range, timeout } = {}) {
    if (!ready) return { ok: false, status: 0, code: 'not-configured', message: 'not-configured' };
    const url = applyProxy(joinDavUrl(baseUrl, name), proxyUrl);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const limit = Number.isFinite(timeout) && timeout > 0 ? timeout : timeoutMs;
    const timer = controller ? setTimeout(() => controller.abort(), limit) : null;
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

    /** OPTIONS 探测能力；405/501 也不算整体失败（degraded）。
     *  `Allow` 只是参考：实测 Apache 的 Allow 不含 PUT/MKCOL 却支持写入，
     *  因此能力一律按「可尝试」返回，真实结果由 PUT / MKCOL / PROPFIND 说话；
     *  声明值另放 `declared` 供展示，**不得**用它禁用上传按钮。 */
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
        canRead: true,
        /* 写入能力不按 Allow 判死：留 true，由真实 PUT / MKCOL 结果说话。 */
        canWrite: true,
        canList: true,
        canMakeCollection: true,
        declared: {
          read: !known || allow.has('GET') || allow.has('HEAD'),
          write: !known || allow.has('PUT'),
          list: !known || allow.has('PROPFIND'),
          makeCollection: !known || allow.has('MKCOL'),
          delete: !known || allow.has('DELETE'),
        },
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
      const result = await request('GET', name, { range, timeout: transferTimeoutMs });
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
        timeout: transferTimeoutMs,
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
      const items = parsePropfindXml(xml);
      /* 过滤「自身条目」：PROPFIND Depth:1 会把请求的集合本身也返回，
         直接喂给列表会多出一个与前缀同名的目录（部分服务器不报 resourcetype）。 */
      const selfUrl = joinDavUrl(baseUrl, name);
      const selfPath = pathOfUrl(selfUrl);
      return {
        ok: true,
        status: result.status,
        items: selfPath
          ? items.filter((item) => pathOfUrl(item.href, selfUrl) !== selfPath)
          : items,
      };
    },

    /**
     * 真实自检：OPTIONS → PROPFIND → MKCOL → PUT → GET 校验 → DELETE。
     *
     * 分级：`OPTIONS` / `PROPFIND` 是**参考项**（服务器可禁用 PROPFIND，上传下载仍可用，
     * 与「任一方法被禁不能让整体失败」的设计前提一致）；`MKCOL/PUT/GET/DELETE` 是必需项。
     * 只写一个临时小文件并删掉；必需项失败即停，如实返回该步，不伪造成功。
     * @param {{prefix?: string, dir?: string}} [options] 目录前缀（写入位置）与测试目录
     */
    async selfTest({ prefix = '', dir = '' } = {}) {
      const steps = [];
      if (!ready) return { ok: false, code: 'not-configured', steps, failedStep: 'config' };
      const cleanPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
      const testDir = String(dir || '').replace(/^\/+|\/+$/g, '')
        || (cleanPrefix ? `${cleanPrefix}/.stpt-selftest` : '.stpt-selftest');
      const push = (step, result, detail = '', advisory = false) => {
        const row = {
          step,
          ok: !!result?.ok,
          advisory,
          status: Number(result?.status) || 0,
          code: result?.code || '',
          detail,
        };
        steps.push(row);
        return row;
      };
      const stop = (row, code = '') => ({
        ok: false,
        steps,
        failedStep: row.step,
        code: code || row.code,
        advisoryFailed: steps.filter((s) => s.advisory && !s.ok).length,
      });

      push('OPTIONS', await this.probe(), 'Capability', true);
      const listed = await this.list(cleanPrefix);
      push('PROPFIND', listed, listed.ok ? `${listed.items.length} 项` : (listed.code || '目录不可列'), true);

      const made = await this.ensureCollection(testDir);
      const rowMk = push('MKCOL', made, testDir);
      if (!made.ok) return stop(rowMk);

      const name = `${testDir}/.probe-${Date.now().toString(36)}.txt`;
      const content = `webdav-probe-${Math.random().toString(36).slice(2)}`;
      const bytes = new TextEncoder().encode(content);
      const put = await this.putObject(name, bytes, { contentType: 'text/plain; charset=utf-8' });
      const rowPut = push('PUT', put, `${bytes.length} B`);
      if (!put.ok) return stop(rowPut);

      const got = await this.getObject(name);
      const gotText = got.ok ? new TextDecoder().decode(got.bytes) : '';
      const same = got.ok && gotText === content;
      const rowGet = push('GET', { ok: same, status: got.status, code: got.code }, same ? '内容一致' : `内容不一致（${got.bytes?.length || 0} B）`);
      if (!rowGet.ok) {
        await this.deleteObject(name);
        return stop(rowGet, got.code || 'content-mismatch');
      }

      const removed = await this.deleteObject(name);
      const rowDel = push('DELETE', removed, name);
      if (!removed.ok) return stop(rowDel);

      /* 临时目录尽力清理。**必须带尾斜杠**：实测不带斜杠会被服务器 301 到
         `http://…/<dir>/`，跨协议重定向让浏览器预检直接失败并刷红控制台。 */
      await request('DELETE', `${testDir}/`);
      return { ok: true, steps, advisoryFailed: steps.filter((s) => s.advisory && !s.ok).length };
    },
  };
}
