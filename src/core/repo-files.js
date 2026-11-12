import {
  resolveSite, authHeaders, withTokenQuery, contentEndpoint, contentAcceptHeader, remoteFileUrl,
} from './git-site.js';

/**
 * 仓库文件抓取（纯 IO）——给「Web 形态把扩展装进数据包」用。
 *
 * 为什么不用归档包：浏览器端下载归档会跨域失败。
 * - GitHub `api.github.com/.../zipball` 302 到 `codeload.github.com`，后者
 *   只给 `render.githubusercontent.com` 放行，浏览器读不到响应；
 * - Gitee 的 zipball 端点对同类请求返回 404。
 * 因此改为「先列树，再逐个取文件」：两条都走各站点 API，CORS 可用，且私有仓天然带凭据。
 *
 * 内存纪律：逐条串行取，超过上限即中止并如实报错，不静默截断。
 */

/** 单次安装最多取多少个文件（扩展通常几十个；超过说明选错仓库了） */
export const MAX_FILES = 1200;
/** 单次安装最多取多少字节 */
export const MAX_BYTES = 80 * 1024 * 1024;

/** 单个请求的超时（毫秒）——没有上限时一个卡住的连接会让整次安装永远 pending */
export const REQUEST_TIMEOUT_MS = 20000;

function withTimeout(fetchImpl, timeoutMs) {
  return (url, init = {}) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const merged = controller ? { ...init, signal: controller.signal } : init;
    return Promise.resolve(fetchImpl(url, merged)).finally(() => { if (timer) clearTimeout(timer); });
  };
}

function joinQuery(url, params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? `${url}${url.includes('?') ? '&' : '?'}${q}` : url;
}

/**
 * 列仓库树的端点。
 * @param {object} repo parseRepoUrl 产物
 * @param {string} ref 分支 / 标签 / commit
 * @returns {string} 端点；不支持的站点返回空串
 */
export function treeEndpoint(repo, ref) {
  if (!repo?.ok) return '';
  const path = `${repo.owner}/${repo.repo}`;
  /* 空 ref = 用仓库默认分支：GitHub/Gitea/GitLab 都接受 HEAD，直接拼空串会 404。 */
  const r = String(ref || repo.ref || 'HEAD');
  if (repo.site === 'github') {
    const api = /github\.com$/i.test(repo.host || '') ? 'https://api.github.com' : `https://${repo.host}/api/v3`;
    return joinQuery(`${api}/repos/${path}/git/trees/${r}`, { recursive: 1 });
  }
  if (repo.site === 'gitee') {
    return joinQuery(`https://gitee.com/api/v5/repos/${path}/git/trees/${r}`, { recursive: 1 });
  }
  if (repo.site === 'gitlab') {
    return joinQuery(`https://${repo.host}/api/v4/projects/${encodeURIComponent(path)}/repository/tree`, {
      recursive: true, per_page: 100, ref: r,
    });
  }
  return joinQuery(`https://${repo.host}/api/v1/repos/${path}/git/trees/${r}`, { recursive: 1, per_page: 1000 });
}

/**
 * 归一化树形响应。
 * @param {any} payload 各站点响应体
 * @returns {Array<{path:string,type:string}>}
 */
export function normalizeTree(payload) {
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(payload?.tree) ? payload.tree
      : [];
  return rows
    .map((row) => ({ path: String(row?.path || '').replace(/^\/+/, ''), type: String(row?.type || 'blob') }))
    .filter((row) => row.path && row.type !== 'tree');
}

/**
 * 取单个文件。Gitee 没有内容 API（`contentEndpoint` 返回 null），走 raw + access_token。
 * @returns {Promise<{ok:boolean, data:Uint8Array|null, status:number, reason:string}>}
 */
async function fetchOneFile(repo, ref, file, account, fetchImpl) {
  const secret = account?.secret || '';
  const api = contentEndpoint(repo, ref, file);
  const url = api || remoteFileUrl(repo, ref, file);
  const finalUrl = api ? url : withTokenQuery(repo.site, url, secret);
  const headers = api ? { Accept: contentAcceptHeader(repo), ...authHeaders(repo.site, secret) } : {};
  try {
    const response = await fetchImpl(finalUrl, { headers, credentials: 'omit' });
    if (!response.ok) return { ok: false, data: null, status: response.status, reason: `http-${response.status}` };
    const buffer = await response.arrayBuffer();
    return { ok: true, data: new Uint8Array(buffer), status: response.status, reason: '' };
  } catch {
    return { ok: false, data: null, status: 0, reason: 'network' };
  }
}

/**
 * 下载仓库全部文件（不含目录）。
 * @param {object} opts
 * @param {object} opts.repo parseRepoUrl 产物
 * @param {string} opts.ref 分支 / 标签
 * @param {object|null} opts.account Git 账号
 * @param {Function} [opts.fetchImpl]
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.onProgress] `({done,total})`
 * @returns {Promise<{ok:boolean, files:Array<{path:string,data:Uint8Array}>, reason:string, skipped:string[]}>}
 */
export async function downloadRepoFiles({
  repo, ref, account = null, fetchImpl = globalThis.fetch, signal = null, onProgress = null,
} = {}) {
  const site = resolveSite(repo, account);
  if (!repo?.ok || !site) return { ok: false, files: [], reason: 'unsupported', skipped: [] };
  if (typeof fetchImpl !== 'function') return { ok: false, files: [], reason: 'unsupported', skipped: [] };
  const timedFetch = withTimeout(fetchImpl, REQUEST_TIMEOUT_MS);

  const treeUrl = withTokenQuery(site.site || repo.site, treeEndpoint(repo, ref), account?.secret || '');
  let payload;
  try {
    const response = await timedFetch(treeUrl, {
      headers: authHeaders(site.site || repo.site, account?.secret || ''),
      credentials: 'omit',
    });
    if (!response.ok) {
      return { ok: false, files: [], reason: `tree-http-${response.status}`, skipped: [] };
    }
    payload = await response.json();
  } catch {
    return { ok: false, files: [], reason: 'network', skipped: [] };
  }

  const rows = normalizeTree(payload);
  if (!rows.length) return { ok: false, files: [], reason: 'empty-repo', skipped: [] };
  if (rows.length > MAX_FILES) return { ok: false, files: [], reason: 'too-many-files', skipped: [] };

  const files = [];
  const skipped = [];
  let bytes = 0;
  let done = 0;
  const CONCURRENCY = 6; // 浏览器对同一主机约 6 条并发连接；再多只会排队
  let cursor = 0;

  /**
   * 取一个文件并累加。并发池按 cursor 抢槽，保证进度与上限检查都是单点写入。
   * @returns {Promise<boolean>} false 表示整体应中止（超限 / aborted）
   */
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= rows.length) return true;
      if (signal?.aborted) return false;
      const row = rows[index];
      // eslint-disable-next-line no-await-in-loop —— 每个 worker 顺序处理自己的槽位
      const one = await fetchOneFile(repo, ref, row.path, account, timedFetch);
      if (one.ok) {
        bytes += one.data.byteLength;
        if (bytes > MAX_BYTES) return false;
        files.push({ path: row.path, data: one.data });
      } else {
        skipped.push(row.path);
      }
      done += 1;
      onProgress?.({ done, total: rows.length });
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker());
  const finished = await Promise.all(workers);
  if (finished.some((ok) => ok === false)) {
    return { ok: false, files: [], reason: signal?.aborted ? 'aborted' : 'too-large', skipped };
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, files, reason: '', skipped };
}
