/**
 * S3 兼容对象存储客户端（AWS SigV4）。
 *
 * 纯逻辑 + 注入 `fetch` / `crypto`，浏览器与 Node 共用，可单测。
 * 不依赖任何后端：插件直连对象存储；凭据只留在本机浏览器。
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** URI 编码：S3 要求保留 '/' 的路径分段编码。 */
export function encodeSegment(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
export function encodePath(path) {
  return String(path).split('/').map(encodeSegment).join('/');
}

/** 前缀去掉首尾斜杠与反斜杠；其它保持原样。 */
export function normalizePrefix(prefix) {
  return String(prefix || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/** 拼接对象 key；前缀为空时直接用文件名。 */
export function objectKey(prefix, name) {
  const p = normalizePrefix(prefix);
  return p ? `${p}/${name}` : String(name);
}

/** `2026-11-05T10:20:30.000Z` → `{ amz:'20261105T102030Z', day:'20261105' }`。 */
export function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amz: iso, day: iso.slice(0, 8) };
}

async function sha256Hex(crypto, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmac(crypto, keyBytes, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

/**
 * 生成 SigV4 签名材料。
 * `headers` 需已含 `x-amz-date` 与 `x-amz-content-sha256`；`host` 由本函数补。
 */
export async function signRequest({
  method,
  url,
  headers,
  payloadHash,
  region,
  accessKeyId,
  secretAccessKey,
  crypto = globalThis.crypto,
  now = new Date(),
}) {
  const u = new URL(url);
  const canonicalUri = encodePath(u.pathname || '/');
  const query = [...u.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeSegment(k)}=${encodeSegment(v)}`)
    .join('&');
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v).trim();
  lower.host = u.host;
  const names = Object.keys(lower).sort();
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const { amz, day } = amzDates(now);
  const scope = `${day}/${region}/s3/aws4_request`;
  const stringToSign = [ALGORITHM, amz, scope, await sha256Hex(crypto, canonicalRequest)].join('\n');

  let signingKey = new TextEncoder().encode(`AWS4${secretAccessKey}`);
  for (const part of [day, region, 's3', 'aws4_request']) {
    signingKey = await hmac(crypto, signingKey, part);
  }
  const signature = toHex(await hmac(crypto, signingKey, stringToSign));
  const authorization = `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { canonicalRequest, stringToSign, signature, authorization, amz, signedHeaders };
}

/** 对象存储的基础地址（path-style 或 virtual-hosted）；无效端点返回 ''。 */
export function buildBaseUrl(config) {
  const endpoint = String(config.endpoint || '').replace(/\/+$/, '');
  const bucket = String(config.bucket || '');
  if (!endpoint || !bucket) return '';
  try {
    if (config.pathStyle) {
      new URL(endpoint);
      return `${endpoint}/${encodeSegment(bucket)}`;
    }
    const u = new URL(endpoint);
    const built = `${u.protocol}//${bucket}.${u.host}`;
    new URL(built); // 纯 IP 端点在虚拟主机风格下不是合法 URL，这里提前拒绝
    return built;
  } catch {
    return '';
  }
}

/** 解析 ListObjectsV2 的 XML（只取 key / size / 时间）。 */
export function parseListXml(xml) {
  const out = [];
  const blocks = String(xml || '').match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  const pick = (block, tag) => {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
    return m ? m[1] : '';
  };
  for (const block of blocks) {
    out.push({
      key: pick(block, 'Key'),
      size: Number(pick(block, 'Size')) || 0,
      lastModified: pick(block, 'LastModified'),
    });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(String(xml || ''));
  const tokenMatch = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(String(xml || ''));
  return { items: out, truncated, nextToken: tokenMatch ? tokenMatch[1] : '' };
}

/**
 * 创建客户端。所有方法返回 `{ ok, status, message }`（成功时带数据），不抛异常。
 * @param {{config: object, fetchImpl?: Function, crypto?: Crypto}} options
 */
export function createS3Client({ config, fetchImpl = globalThis.fetch, crypto = globalThis.crypto } = {}) {
  const base = buildBaseUrl(config);
  const region = config.region || 'us-east-1';
  const ready = !!(base && config.accessKeyId && config.secretAccessKey && fetchImpl && crypto?.subtle);

  async function request(method, key, { body, query = '', contentType, as = 'bytes' } = {}) {
    if (!ready) return { ok: false, status: 0, message: 'not-configured' };
    const url = `${base}/${key ? encodePath(key) : ''}${query}`;
    try {
      const payload = body || new Uint8Array(0);
      const payloadHash = await sha256Hex(crypto, payload);
      const { amz } = amzDates();
      const headers = { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz };
      if (contentType) headers['content-type'] = contentType;
      const { authorization } = await signRequest({
        method,
        url,
        headers,
        payloadHash,
        region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        crypto,
      });
      const res = await fetchImpl(url, {
        method,
        headers: { ...headers, Authorization: authorization },
        body: method === 'PUT' ? payload : undefined,
      });
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.text()).slice(0, 200);
        } catch {
          detail = '';
        }
        return { ok: false, status: res.status, message: detail || `http-${res.status}` };
      }
      if (method !== 'GET') return { ok: true, status: res.status };
      if (as === 'text') return { ok: true, status: res.status, text: await res.text() };
      return { ok: true, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
    } catch (error) {
      return { ok: false, status: 0, message: String(error?.message || error) };
    }
  }

  return {
    ready,
    async putObject(key, bytes, { contentType = 'application/octet-stream' } = {}) {
      return request('PUT', key, { body: bytes, contentType });
    },
    async getObject(key) {
      return request('GET', key, { as: 'bytes' });
    },
    async deleteObject(key) {
      return request('DELETE', key);
    },
    async listObjects(prefix = '', { maxPages = 5 } = {}) {
      if (!ready) return { ok: false, status: 0, message: 'not-configured' };
      const items = [];
      let token = '';
      for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({ 'list-type': '2' });
        if (prefix) params.set('prefix', prefix);
        if (token) params.set('continuation-token', token);
        const result = await request('GET', '', { query: `?${params.toString()}`, as: 'text' });
        if (!result.ok) return result;
        const parsed = parseListXml(result.text);
        items.push(...parsed.items);
        if (!parsed.truncated || !parsed.nextToken) break;
        token = parsed.nextToken;
      }
      return { ok: true, status: 200, items };
    },
  };
}
