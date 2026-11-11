/**
 * Git 站点 API（纯逻辑：端点构造 + 响应归一，不在此处 fetch）。
 *
 * CORS 事实：GitHub / GitLab / Gitee 的公开 API 允许浏览器跨域；自建 Gitea 视实例配置，
 * 失败一律由调用方降级为「未提供」，不伪造数据（数据正确性铁律）。
 *
 * 鉴权惯例：
 *   GitHub / GitLab → `Authorization: Bearer <token>`
 *   Gitea          → `Authorization: token <token>`
 *   Gitee          → `?access_token=<token>`（官方 v5 约定）
 */

import { SITES } from './git-url.js';

/** 账号验证端点（「测试」按钮）。 */
export function userEndpoint(site, host) {
  if (site === SITES.GITHUB) return 'https://api.github.com/user';
  if (site === SITES.GITEE) return 'https://gitee.com/api/v5/user';
  if (site === SITES.GITLAB) return `https://${host}/api/v4/user`;
  return `https://${host}/api/v1/user`;
}

export function normalizeUser(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return { login: String(p.login || p.username || p.name || '') };
}

/** 分支列表/仓库信息端点。`repo` 为 `parseRepoUrl` 的产物。 */
export function branchesEndpoint(repo, { perPage = 100 } = {}) {
  if (!repo?.ok) return null;
  if (repo.site === SITES.GITHUB) {
    return `https://api.github.com/repos/${repo.owner}/${repo.repo}/branches?per_page=${perPage}`;
  }
  if (repo.site === SITES.GITEE) {
    return `https://gitee.com/api/v5/repos/${repo.owner}/${repo.repo}/branches?per_page=${perPage}`;
  }
  if (repo.site === SITES.GITLAB) {
    const project = encodeURIComponent(`${repo.owner}/${repo.repo}`);
    return `https://${repo.host}/api/v4/projects/${project}/repository/branches?per_page=${perPage}`;
  }
  return `https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/branches`;
}

export function repoInfoEndpoint(repo) {
  if (!repo?.ok) return null;
  if (repo.site === SITES.GITHUB) return `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  if (repo.site === SITES.GITEE) return `https://gitee.com/api/v5/repos/${repo.owner}/${repo.repo}`;
  if (repo.site === SITES.GITLAB) {
    const project = encodeURIComponent(`${repo.owner}/${repo.repo}`);
    return `https://${repo.host}/api/v4/projects/${project}`;
  }
  return `https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}`;
}

export function commitsEndpoint(repo, ref, { perPage = 1 } = {}) {
  if (!repo?.ok) return null;
  const sha = ref ? `sha=${encodeURIComponent(ref)}&` : '';
  if (repo.site === SITES.GITHUB) {
    return `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?${sha}per_page=${perPage}`;
  }
  if (repo.site === SITES.GITEE) {
    return `https://gitee.com/api/v5/repos/${repo.owner}/${repo.repo}/commits?${sha}per_page=${perPage}`;
  }
  if (repo.site === SITES.GITLAB) {
    const project = encodeURIComponent(`${repo.owner}/${repo.repo}`);
    const refName = ref ? `ref_name=${encodeURIComponent(ref)}&` : '';
    return `https://${repo.host}/api/v4/projects/${project}/repository/commits?${refName}per_page=${perPage}`;
  }
  const refName = ref ? `sha=${encodeURIComponent(ref)}&` : '';
  return `https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/commits?${refName}limit=${perPage}`;
}

/** 鉴权头（Gitee 走 query，故此处返回空对象）。 */
export function authHeaders(site, token) {
  const t = String(token || '');
  if (!t) return {};
  if (site === SITES.GITHUB || site === SITES.GITLAB) {
    return { Authorization: `Bearer ${t}` };
  }
  if (site === SITES.GITEA || site === SITES.CUSTOM) {
    return { Authorization: `token ${t}` };
  }
  return {};
}

/** 把 token 拼进 URL（Gitee 专用）；其它站点原样返回。 */
export function withTokenQuery(site, url, token) {
  if (site !== SITES.GITEE || !token || !url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(String(token))}`;
}

/** 分支列表归一：GitHub/Gitee/Gitea 用 `name`，GitLab 用 `name`（同一字段）。 */
export function normalizeBranches(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return [...new Set(list.map((b) => String(b?.name || b?.branch || '')).filter(Boolean))].sort();
}

/**
 * 仓库信息归一。
 * @returns {{description:string, defaultBranch:string, stars:number|null, pushedAt:string, visibility:string}}
 */
export function normalizeRepoInfo(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const stars = Number(p.stargazers_count ?? p.star_count ?? p.stars_count);
  return {
    description: typeof p.description === 'string' ? p.description : '',
    defaultBranch: String(p.default_branch || p.default_branch_name || ''),
    stars: Number.isFinite(stars) ? stars : null,
    pushedAt: String(p.pushed_at || p.last_activity_at || p.updated_at || ''),
    visibility: String(p.visibility || (p.private === true ? 'private' : p.private === false ? 'public' : '')),
  };
}

/** 最新提交归一（短 SHA + 时间）。 */
export function normalizeLatestCommit(payload) {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== 'object') return { sha: '', date: '' };
  const sha = String(row.sha || row.id || row.commit?.id || row.commit?.sha || '');
  const date = String(row.commit?.committer?.date || row.commit?.author?.date || row.created_at || row.timestamp || '');
  return { sha: sha.slice(0, 12), date };
}

/**
 * 远端 manifest.json 的原始地址（用于更新检查比对版本）。
 * @param {object} repo parseRepoUrl 产物
 * @param {string} ref 分支/标签（空时用默认分支名）
 */
export function remoteManifestUrl(repo, ref) {
  if (!repo?.ok) return '';
  const r = String(ref || repo.ref || 'main');
  const path = `${repo.owner}/${repo.repo}`;
  if (repo.site === SITES.GITHUB) return `https://raw.githubusercontent.com/${path}/${r}/manifest.json`;
  if (repo.site === SITES.GITEE) return `https://gitee.com/${path}/raw/${r}/manifest.json`;
  if (repo.site === SITES.GITLAB) return `https://${repo.host}/${path}/-/raw/${r}/manifest.json`;
  return `https://${repo.host}/${path}/raw/branch/${r}/manifest.json`;
}

/** 语义化版本比较：a>b 返回 1，相等 0，a<b 返回 -1。非法输入按 0 段处理。 */
export function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
