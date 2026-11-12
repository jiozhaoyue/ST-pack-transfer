/**
 * Git 站点网络层（唯一 fetch 落点；核心层保持纯逻辑）。
 *
 * 有界等待：每个请求都带 AbortController + 超时，失败返回原因码而不是抛错；
 * 调用方一律按「未提供」降级，不伪造数据。
 */
import {
  branchesEndpoint,
  commitsEndpoint,
  commitDetailEndpoint,
  tagsEndpoint,
  repoInfoEndpoint,
  remoteFileUrl,
  contentEndpoint,
  contentAcceptHeader,
  resolveSite,
  authHeaders,
  withTokenQuery,
  normalizeBranches,
  normalizeRepoInfo,
  normalizeLatestCommit,
  normalizeCommitList,
  normalizeTags,
  normalizeCommitFiles,
  userEndpoint,
  normalizeUser,
} from '../core/git-site.js';
import { applyProxy } from '../core/net-proxy.js';

export const GIT_REMOTE_TIMEOUT_MS = 8000;

function reasonOf(status, network) {
  if (network) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'http';
}

export function createGitRemote({
  fetchImpl = null,
  timeoutMs = GIT_REMOTE_TIMEOUT_MS,
  getProxyUrl = null,
} = {}) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const proxyOf = () => (typeof getProxyUrl === 'function' ? getProxyUrl() : '');

  async function request(url, { headers = {}, as = 'json' } = {}) {
    if (!f) return { ok: false, reason: 'unsupported', status: 0, data: null };
    const controller = new AbortController();
    let timer = 0;
    try {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await f(applyProxy(url, proxyOf()), {
        headers: { Accept: as === 'json' ? 'application/json' : 'text/plain', ...headers },
        signal: controller.signal,
        credentials: 'omit',
      });
      const data = as === 'json'
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '');
      return { ok: response.ok, status: response.status, data };
    } catch {
      return { ok: false, reason: 'network', status: 0, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function authed(url, repo, account) {
    const headers = account?.secret ? authHeaders(repo.site, account.secret) : {};
    return { url: withTokenQuery(repo.site, url, account?.secret), headers };
  }

  /**
   * 读仓库内某个文件的文本。
   * 带凭据时优先走各站点的**内容 API**（GitHub 私有 raw 域名不接受 Authorization）；
   * 失败且不是鉴权/不存在类错误时，再退回 raw 地址一次。
   */
  async function readFile(repo, ref, file, account = null) {
    if (!repo?.ok) return { ok: false, reason: 'unsupported', text: '' };
    const target = resolveSite(repo, account);
    const api = account?.secret ? contentEndpoint(target, ref, file) : null;
    if (api) {
      const headers = { ...authHeaders(target.site, account.secret), Accept: contentAcceptHeader(target) };
      const r = await request(api, { headers, as: 'text' });
      if (r.ok) return { ok: true, text: String(r.data || ''), status: r.status, via: 'api' };
      if (![401, 403, 404].includes(r.status)) {
        return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, text: '' };
      }
    }
    const raw = remoteFileUrl(target, ref, file);
    if (!raw) return { ok: false, reason: 'unsupported', text: '' };
    const { url, headers } = authed(raw, target, account);
    const r = await request(url, { headers, as: 'text' });
    if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, text: '' };
    return { ok: true, text: String(r.data || ''), status: r.status, via: 'raw' };
  }

  return {
    /** 验证账号（PAT / 账密）。CORS 拦截与凭据错误要区分开。 */
    async testAccount(account) {
      if (!account?.secret) return { ok: false, reason: 'unauthorized', login: '' };
      const url = withTokenQuery(account.site, userEndpoint(account.site, account.host), account.secret);
      const headers = authHeaders(account.site, account.secret);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, login: '' };
      return { ok: true, login: normalizeUser(r.data).login, status: r.status };
    },

    /** 列举远端分支。 */
    async listBranches(repo, account = null) {
      const target = resolveSite(repo, account);
      const base = branchesEndpoint(target);
      if (!base) return { ok: false, reason: 'unsupported', branches: [] };
      const { url, headers } = authed(base, target, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, branches: [] };
      return { ok: true, branches: normalizeBranches(r.data), status: r.status };
    },

    /** 仓库摘要。 */
    async repoInfo(repo, account = null) {
      const target = resolveSite(repo, account);
      const base = repoInfoEndpoint(target);
      if (!base) return { ok: false, reason: 'unsupported', info: null };
      const { url, headers } = authed(base, target, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, info: null };
      const info = normalizeRepoInfo(r.data);
      return { ok: true, info, status: r.status };
    },

    /** 远端最新提交（更新检查用）。 */
    async latestCommit(repo, ref = '', account = null) {
      const target = resolveSite(repo, account);
      const base = commitsEndpoint(target, ref);
      if (!base) return { ok: false, reason: 'unsupported', commit: null };
      const { url, headers } = authed(base, target, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, commit: null };
      return { ok: true, commit: normalizeLatestCommit(r.data), status: r.status };
    },

    /** 取远端 manifest.json 文本（版本比对用）。 */
    async remoteManifest(repo, ref = '', account = null) {
      return readFile(repo, ref, 'manifest.json', account);
    },


    /** 标签列表（只取最近 N 个，不拉全量历史）。 */
    async listTags(repo, account = null) {
      const target = resolveSite(repo, account);
      const base = tagsEndpoint(target);
      if (!base) return { ok: false, reason: 'unsupported', tags: [] };
      const { url, headers } = authed(base, target, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, tags: [] };
      return { ok: true, tags: normalizeTags(r.data), status: r.status };
    },

    /** 最近提交（分页上限由调用方给，默认 20 条）。 */
    async listCommits(repo, ref = '', account = null, { perPage = 20 } = {}) {
      const target = resolveSite(repo, account);
      const base = commitsEndpoint(target, ref, { perPage });
      if (!base) return { ok: false, reason: 'unsupported', commits: [] };
      const { url, headers } = authed(base, target, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, commits: [] };
      return { ok: true, commits: normalizeCommitList(r.data), status: r.status };
    },

    /** 单次提交的文件级 diff。 */
    async commitDetail(repo, sha, account = null) {
      const target = resolveSite(repo, account);
      const base = commitDetailEndpoint(target, sha);
      if (!base) return { ok: false, reason: 'unsupported', files: [] };
      const { url, headers } = authed(base, target, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, files: [] };
      return { ok: true, files: normalizeCommitFiles(r.data), status: r.status };
    },

    /** 仓库内任意文件的原始文本（插件类型识别用）。 */
    async rawFile(repo, ref, file, account = null) {
      return readFile(repo, ref, file, account);
    },
  };
}
