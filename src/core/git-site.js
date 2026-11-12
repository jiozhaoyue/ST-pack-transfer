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

/**
 * 用账号的站点类型修正「自建域名」的仓库。
 *
 * 背景：`siteOfHost` 只认官方域名，`git.example.com` 这类自建主机一律 `custom`；
 * 但它可能是 GitHub Enterprise / 自建 GitLab / Gitea，三者的 API 端点完全不同。
 * 账号里用户已经显式选过站点类型（site），带凭据请求时按账号类型解释仓库，
 * 否则自建 GitHub Enterprise 会被当成 Gitea 打 `/api/v1`，永远 404。
 */
export function resolveSite(repo, account) {
  if (!repo?.ok) return repo;
  if (repo.site !== SITES.CUSTOM) return repo;
  const site = String(account?.site || '').toLowerCase();
  if (site === SITES.GITHUB || site === SITES.GITLAB || site === SITES.GITEE || site === SITES.GITEA) {
    return { ...repo, site };
  }
  return repo;
}

/** GitHub.com 与 GitHub Enterprise 的 API 根不同：Enterprise 走 `<host>/api/v3`。 */
export function githubApiBase(host = '') {
  const h = String(host || '').toLowerCase();
  return !h || h === 'github.com' ? 'https://api.github.com' : `https://${h}/api/v3`;
}

function githubApi(repo) {
  return githubApiBase(repo?.host);
}

/** 账号验证端点（「测试」按钮）。 */
export function userEndpoint(site, host) {
  if (site === SITES.GITHUB) return `${githubApiBase(host)}/user`;
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
    return `${githubApi(repo)}/repos/${repo.owner}/${repo.repo}/branches?per_page=${perPage}`;
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
  if (repo.site === SITES.GITHUB) return `${githubApi(repo)}/repos/${repo.owner}/${repo.repo}`;
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
    return `${githubApi(repo)}/repos/${repo.owner}/${repo.repo}/commits?${sha}per_page=${perPage}`;
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

/**
 * 标签列表端点（Git 可视化只读：只取分支 / 标签 / 最近提交，不拉全量历史）。
 * @param {object} repo parseRepoUrl 产物
 * @param {{perPage?:number}} [options]
 */
export function tagsEndpoint(repo, { perPage = 50 } = {}) {
  if (!repo?.ok) return null;
  if (repo.site === SITES.GITHUB) {
    return `${githubApi(repo)}/repos/${repo.owner}/${repo.repo}/tags?per_page=${perPage}`;
  }
  if (repo.site === SITES.GITEE) {
    return `https://gitee.com/api/v5/repos/${repo.owner}/${repo.repo}/tags?per_page=${perPage}`;
  }
  if (repo.site === SITES.GITLAB) {
    const project = encodeURIComponent(`${repo.owner}/${repo.repo}`);
    return `https://${repo.host}/api/v4/projects/${project}/repository/tags?per_page=${perPage}`;
  }
  return `https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/tags?limit=${perPage}`;
}

/**
 * 单次提交详情端点（diff 面板）。
 * GitLab 用 `/repository/commits/<sha>/diff`（返回 diff 数组）；其余站点用 commits/<sha>（含 files）。
 * @param {object} repo parseRepoUrl 产物
 * @param {string} sha 提交 SHA
 */
export function commitDetailEndpoint(repo, sha) {
  if (!repo?.ok || !sha) return null;
  const id = encodeURIComponent(String(sha));
  if (repo.site === SITES.GITHUB) {
    return `${githubApi(repo)}/repos/${repo.owner}/${repo.repo}/commits/${id}`;
  }
  if (repo.site === SITES.GITEE) {
    return `https://gitee.com/api/v5/repos/${repo.owner}/${repo.repo}/commits/${id}`;
  }
  if (repo.site === SITES.GITLAB) {
    const project = encodeURIComponent(`${repo.owner}/${repo.repo}`);
    return `https://${repo.host}/api/v4/projects/${project}/repository/commits/${id}/diff`;
  }
  return `https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/commits/${id}`;
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
 * 提交列表归一（Git 可视化：只取最近 N 条，不拉全量历史）。
 * 同时带出 `parents`：泳道图靠它画分叉与合并；站点缺字段时为空数组，不猜。
 * @param {unknown} payload 站点 commits 接口响应
 * @returns {Array<{sha:string, shortSha:string, message:string, author:string, date:string, parents:string[]}>}
 */
export function normalizeCommitList(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const sha = String(row.sha || row.id || row.commit?.id || row.commit?.sha || '');
      const message = String(row.commit?.message || row.message || row.title || '').split('\n')[0];
      const author = String(row.commit?.author?.name || row.author_name || row.author?.name || row.author?.login || '');
      const date = String(
        row.commit?.committer?.date || row.commit?.author?.date
        || row.committed_date || row.created_at || row.authored_date || '',
      );
      /* GitHub / Gitee / Gitea: parents[].sha；GitLab: parent_ids。 */
      const parents = (Array.isArray(row.parents) ? row.parents : [])
        .map((parent) => String((parent && (parent.sha || parent.id)) || parent || ''))
        .filter(Boolean);
      if (!parents.length && Array.isArray(row.parent_ids)) {
        parents.push(...row.parent_ids.map((id) => String(id || '')).filter(Boolean));
      }
      return { sha, shortSha: sha.slice(0, 8), message, author, date, parents };
    })
    .filter((row) => row.sha);
}

/**
 * 标签列表归一：GitHub/Gitea/Gitee 用 `name`，GitLab 也用 `name`。
 * @param {unknown} payload
 * @returns {string[]}
 */
export function normalizeTags(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return [...new Set(list.map((tag) => String(tag?.name || tag?.tag_name || '')).filter(Boolean))].sort();
}

/**
 * 单次提交的变更文件归一。兼容两种形状：
 * - GitHub / Gitee / Gitea：`{ files: [{ filename, additions, deletions, patch }] }`
 * - GitLab：`[{ old_path, new_path, diff }]`
 * @param {unknown} payload
 * @returns {Array<{path:string, additions:number|null, deletions:number|null, patch:string}>}
 */
export function normalizeCommitFiles(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.files) ? payload.files : []);
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const path = String(row.filename || row.new_path || row.old_path || '');
      const additions = Number.isFinite(Number(row.additions)) && row.additions !== undefined
        ? Number(row.additions) : null;
      const deletions = Number.isFinite(Number(row.deletions)) && row.deletions !== undefined
        ? Number(row.deletions) : null;
      return { path, additions, deletions, patch: String(row.patch || row.diff || '') };
    })
    .filter((row) => row.path);
}

/** GitHub.com 的 raw 在独立域名；Enterprise 用自己的 `/<o>/<r>/raw/<ref>/<path>`。 */
export function githubRawUrl(repo, ref, file) {
  const r = String(ref || repo.ref || 'main');
  const name = String(file || '').replace(/^\/+/, '');
  if (!name) return '';
  const path = `${repo.owner}/${repo.repo}`;
  const host = String(repo.host || '').toLowerCase();
  if (!host || host === 'github.com') {
    return `https://raw.githubusercontent.com/${path}/${r}/${encodeURI(name)}`;
  }
  return `https://${host}/${path}/raw/${encodeURIComponent(r)}/${encodeURI(name)}`;
}

/**
 * 鉴权可用的「取仓库内某个文件」的 API 端点。
 *
 * 为什么需要它：raw.githubusercontent.com 不接受 `Authorization` 头，
 * 私有仓库经 raw 域名永远 401/404；Gitee 的 raw 需要 `access_token` 查询参数。
 * 因此带凭据读取时统一走各站点的内容 API（GitHub 用 `Accept: raw`）。
 *
 * Gitee 返回 null：它的 raw + `access_token` 已能覆盖公开与私有，无需转 API。
 * @param {object} repo parseRepoUrl 产物
 * @param {string} ref 分支/标签
 * @param {string} file 仓库内相对路径
 * @returns {string|null} 不适用时返回 null
 */
export function contentEndpoint(repo, ref, file) {
  if (!repo?.ok) return null;
  const name = String(file || '').replace(/^\/+/, '');
  if (!name) return null;
  const r = String(ref || repo.ref || 'main');
  const path = `${repo.owner}/${repo.repo}`;
  if (repo.site === SITES.GITHUB) {
    return `${githubApi(repo)}/repos/${path}/contents/${name}?ref=${encodeURIComponent(r)}`;
  }
  if (repo.site === SITES.GITLAB) {
    const project = encodeURIComponent(path);
    return `https://${repo.host}/api/v4/projects/${project}/repository/files/${encodeURIComponent(name)}/raw?ref=${encodeURIComponent(r)}`;
  }
  if (repo.site === SITES.GITEE) return null;
  /* Gitea / 自建同形态 */
  return `https://${repo.host}/api/v1/repos/${path}/raw/${name}?ref=${encodeURIComponent(r)}`;
}

/** 内容 API 需要的 Accept 头（GitHub 必须显式要 raw，否则返回 JSON 包装）。 */
export function contentAcceptHeader(repo) {
  return repo?.site === SITES.GITHUB ? 'application/vnd.github.raw' : 'text/plain';
}

/**
 * 远端 manifest.json 的原始地址（用于更新检查比对版本）。
 * @param {object} repo parseRepoUrl 产物
 * @param {string} ref 分支/标签（空时用默认分支名）
 */
export function remoteManifestUrl(repo, ref) {
  if (!repo?.ok) return '';
  if (repo.site === SITES.GITHUB) return githubRawUrl(repo, ref, 'manifest.json');
  const r = String(ref || repo.ref || 'main');
  const path = `${repo.owner}/${repo.repo}`;
  if (repo.site === SITES.GITEE) return `https://gitee.com/${path}/raw/${r}/manifest.json`;
  if (repo.site === SITES.GITLAB) return `https://${repo.host}/${path}/-/raw/${r}/manifest.json`;
  return `https://${repo.host}/${path}/raw/branch/${r}/manifest.json`;
}

/**
 * 仓库内任意文件的原始地址（前后端插件类型识别、manifest 读取）。
 * @param {object} repo parseRepoUrl 产物
 * @param {string} ref 分支/标签（空时用默认分支名）
 * @param {string} file 仓库内相对路径，如 `manifest.json` / `package.json`
 */
export function remoteFileUrl(repo, ref, file) {
  if (!repo?.ok) return '';
  if (repo.site === SITES.GITHUB) return githubRawUrl(repo, ref, file);
  const r = String(ref || repo.ref || 'main');
  const name = String(file || '').replace(/^\/+/, '');
  if (!name) return '';
  const path = `${repo.owner}/${repo.repo}`;
  if (repo.site === SITES.GITEE) return `https://gitee.com/${path}/raw/${r}/${name}`;
  if (repo.site === SITES.GITLAB) return `https://${repo.host}/${path}/-/raw/${r}/${name}`;
  return `https://${repo.host}/${path}/raw/branch/${r}/${name}`;
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
