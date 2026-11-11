/**
 * Git 站点网络层（唯一 fetch 落点；核心层保持纯逻辑）。
 *
 * 有界等待：每个请求都带 AbortController + 超时，失败返回原因码而不是抛错；
 * 调用方一律按「未提供」降级，不伪造数据。
 */
import {
  branchesEndpoint,
  commitsEndpoint,
  repoInfoEndpoint,
  remoteManifestUrl,
  authHeaders,
  withTokenQuery,
  normalizeBranches,
  normalizeRepoInfo,
  normalizeLatestCommit,
  userEndpoint,
  normalizeUser,
} from '../core/git-site.js';

export const GIT_REMOTE_TIMEOUT_MS = 8000;

function reasonOf(status, network) {
  if (network) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'http';
}

export function createGitRemote({ fetchImpl = null, timeoutMs = GIT_REMOTE_TIMEOUT_MS } = {}) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);

  async function request(url, { headers = {}, as = 'json' } = {}) {
    if (!f) return { ok: false, reason: 'unsupported', status: 0, data: null };
    const controller = new AbortController();
    let timer = 0;
    try {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await f(url, {
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
      const base = branchesEndpoint(repo);
      if (!base) return { ok: false, reason: 'unsupported', branches: [] };
      const { url, headers } = authed(base, repo, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, branches: [] };
      return { ok: true, branches: normalizeBranches(r.data), status: r.status };
    },

    /** 仓库摘要。 */
    async repoInfo(repo, account = null) {
      const base = repoInfoEndpoint(repo);
      if (!base) return { ok: false, reason: 'unsupported', info: null };
      const { url, headers } = authed(base, repo, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, info: null };
      const info = normalizeRepoInfo(r.data);
      return { ok: true, info, status: r.status };
    },

    /** 远端最新提交（更新检查用）。 */
    async latestCommit(repo, ref = '', account = null) {
      const base = commitsEndpoint(repo, ref);
      if (!base) return { ok: false, reason: 'unsupported', commit: null };
      const { url, headers } = authed(base, repo, account);
      const r = await request(url, { headers });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, commit: null };
      return { ok: true, commit: normalizeLatestCommit(r.data), status: r.status };
    },

    /** 取远端 manifest.json 文本（版本比对用；raw 域名的 CORS 视站点而定）。 */
    async remoteManifest(repo, ref = '', account = null) {
      const url = remoteManifestUrl(repo, ref);
      if (!url) return { ok: false, reason: 'unsupported', text: '' };
      const { headers } = authed(url, repo, account);
      const r = await request(url, { headers, as: 'text' });
      if (!r.ok) return { ok: false, reason: r.reason || reasonOf(r.status, false), status: r.status, text: '' };
      return { ok: true, text: String(r.data || ''), status: r.status };
    },
  };
}
