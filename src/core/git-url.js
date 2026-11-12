/**
 * Git 仓库地址归一（纯逻辑，无 DOM / 无 fetch）。
 *
 * 存在原因：宿主 `/api/extensions/install` 用 **URL 最后一段**做目录名，并把
 * `branch` 单独作为参数。直接粘贴 GitHub 的 `/tree/<ref>` 页面地址会被宿主装成
 * 名为 `<ref>` 的扩展目录；`/commit/<sha>` 同理。所以插件必须先把页面地址解析成
 * 「仓库根 URL + ref」再交给宿主（2026-11-11 核对宿主源码后确立）。
 *
 * 支持的输入：
 *   owner/repo                               → https://github.com/owner/repo
 *   gh:owner/repo · github: · gitee: · gitlab:
 *   github.com/owner/repo（无协议）
 *   https://host/o/r(.git)                   → 原样
 *   https://host/o/r/tree/<ref>              → 根 + ref
 *   https://host/o/r/blob/<ref>/<path>       → 根 + ref
 *   https://host/o/r/commit/<sha>            → 根 + ref（commit）
 *   https://host/o/r/releases/tag/<tag>      → 根 + ref
 *   https://host/o/r/tags/<tag>              → 根 + ref
 *   https://gitlab.com/g/sg/r/-/tree/<ref>   → 根（含子组）+ ref
 *   https://user:token@host/o/r              → 去掉用户信息，标记 hadCredentials
 */

export const SITES = Object.freeze({
  GITHUB: 'github',
  GITLAB: 'gitlab',
  GITEE: 'gitee',
  GITEA: 'gitea',
  CUSTOM: 'custom',
});

/** 站点识别：只认官方域名；其它一律 custom（自建 Gitea / GitLab 由用户显式选类型）。 */
export function siteOfHost(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'github.com' || h.endsWith('.github.com')) return SITES.GITHUB;
  if (h === 'gitlab.com' || h.endsWith('.gitlab.com')) return SITES.GITLAB;
  if (h === 'gitee.com' || h.endsWith('.gitee.com')) return SITES.GITEE;
  return SITES.CUSTOM;
}

/** 是否是系统 git 形态（插件无法用 HTTP 通道安装）。 */
export function isSystemGitUrl(input) {
  const raw = String(input || '').trim();
  if (/^file:\/\//i.test(raw)) return true;
  if (/^ssh:\/\//i.test(raw)) return true;
  if (/^git:\/\//i.test(raw)) return true;
  return /^[^@/]+@[^:/]+:.+$/.test(raw) && !/^https?:\/\//i.test(raw);
}

/** 形如 7–64 位十六进制的 ref 视为 commit（GitHub/GitLab/Gitea 全 SHA 与短 SHA）。 */
export function isCommitRef(ref) {
  return /^[0-9a-f]{7,64}$/i.test(String(ref || '').trim());
}

const SHORT_PREFIXES = Object.freeze({
  gh: 'github.com',
  github: 'github.com',
  gitee: 'gitee.com',
  gitlab: 'gitlab.com',
});

/** 页面地址里出现即代表「仓库根到此为止」的段。`-` 是 GitLab 的 `/-/tree/…`。 */
const PATH_MARKERS = Object.freeze([
  '-', 'tree', 'blob', 'commit', 'commits', 'releases', 'tags', 'branches',
  'compare', 'merge_requests', 'raw', 'archive', 'issues', 'pulls',
]);

/**
 * 解析仓库输入。
 * @param {string} input
 * @returns {{
 *   ok: boolean, error?: string,
 *   cloneUrl: string, webUrl: string, host: string, owner: string, repo: string,
 *   site: string, ref: string, refKind: 'commit'|'ref'|'' ,
 *   hadCredentials: boolean, changed: boolean, joinedPath: string
 * }}
 */
export function parseRepoUrl(input) {
  const empty = {
    ok: false, error: 'empty', cloneUrl: '', webUrl: '', host: '', owner: '', repo: '',
    site: SITES.CUSTOM, ref: '', refKind: '', hadCredentials: false, changed: false, joinedPath: '',
  };
  const raw = String(input || '').trim();
  if (!raw) return empty;
  if (isSystemGitUrl(raw)) return { ...empty, error: 'system-git' };

  let text = raw;

  // 前缀短写
  const prefix = /^(gh|github|gitee|gitlab):([^/\s].*)$/i.exec(text);
  if (prefix && !text.includes('@') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const host = SHORT_PREFIXES[prefix[1].toLowerCase()];
    const path = prefix[2].trim().replace(/\/+$/, '');
    if (/^[\w.-]+\/[\w.-]+$/.test(path)) text = `https://${host}/${path}`;
  }
  // 裸 owner/repo
  if (!text.includes('://') && !text.includes('@') && /^[\w.-]+\/[\w.-]+$/.test(text)) {
    text = `https://github.com/${text}`;
  }
  // 无协议 host/path
  if (!text.includes('://') && !text.includes('@') && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\/\S+$/i.test(text)) {
    text = `https://${text}`;
  }
  if (!/^https?:\/\//i.test(text)) return { ...empty, error: 'unsupported' };

  let parsed;
  try {
    parsed = new URL(text.replace(/\/+$/, ''));
  } catch {
    return { ...empty, error: 'invalid' };
  }

  let hadCredentials = false;
  if (parsed.username || parsed.password) {
    hadCredentials = true;
    parsed.username = '';
    parsed.password = '';
  }
  parsed.search = '';
  parsed.hash = '';

  let segments = parsed.pathname.split('/').filter(Boolean).map(safeDecode);
  if (segments.length && /\.git$/i.test(segments[segments.length - 1])) {
    segments[segments.length - 1] = segments[segments.length - 1].replace(/\.git$/i, '');
  }

  // GitLab 的子组路径（group/subgroup/repo）不切段：marker 之前的全部算仓库路径。
  let markerAt = -1;
  for (let i = 1; i < segments.length; i += 1) {
    if (PATH_MARKERS.includes(segments[i].toLowerCase())) { markerAt = i; break; }
  }
  const repoPath = markerAt >= 0 ? segments.slice(0, markerAt) : segments;
  if (repoPath.length < 2) return { ...empty, error: 'not-a-repo' };

  let ref = '';
  if (markerAt >= 0) {
    const marker = segments[markerAt].toLowerCase();
    let rest = segments.slice(markerAt + 1);
    if (marker === '-' && rest.length) {
      // GitLab: /-/tree/<ref>、/-/blob/<ref>/…、/-/commit/<sha>
      const sub = String(rest[0] || '').toLowerCase();
      if (['tree', 'blob', 'commit'].includes(sub)) rest = rest.slice(1);
    } else if (marker === 'releases' && String(rest[0] || '').toLowerCase() === 'tag') {
      rest = rest.slice(1);
    }
    // ref 只能取**第一段**：`/tree/<ref>/<仓库内路径>` 无法从 URL 区分 ref 里的斜杠，
    // 分支名含 `/` 时由 UI 在拿到分支列表后按最长前缀修正（见 refineRefWithBranches）。
    ref = String(rest[0] || '');
  }

  const host = parsed.host.toLowerCase();
  const clonePath = repoPath.join('/');
  const cloneUrl = `https://${host}/${clonePath}`;
  return {
    ok: true,
    cloneUrl,
    webUrl: cloneUrl,
    host,
    owner: repoPath.slice(0, -1).join('/'),
    repo: repoPath[repoPath.length - 1],
    site: siteOfHost(host),
    ref,
    refKind: ref ? (isCommitRef(ref) ? 'commit' : 'ref') : '',
    hadCredentials,
    changed: cloneUrl !== raw,
    joinedPath: clonePath,
  };
}

/**
 * 分支名含 `/` 时，用已知分支列表把 `/tree/a/b` 还原成 `a/b`。
 * 取**最长**匹配；无匹配返回原 ref。
 * @param {string} ref
 * @param {string[]} branches
 */
export function refineRefWithBranches(ref, branches) {
  const target = String(ref || '');
  const list = Array.isArray(branches) ? branches.filter(Boolean) : [];
  if (!target || list.length === 0) return target;
  if (list.includes(target)) return target;
  const hits = list.filter((b) => target === b || target.startsWith(`${b}/`));
  if (hits.length === 0) return target;
  return hits.sort((a, b) => b.length - a.length)[0];
}

function safeDecode(seg) {
  try { return decodeURIComponent(seg); } catch { return seg; }
}

/** 凭据 → 可交给宿主的 URL。token 型把 token 当用户名（GitHub/Gitee/Gitea 通用）；
 *  GitLab 的 token-only 需要 `oauth2:<token>`，否则克隆会 401。 */
export function buildAuthedUrl(url, credential) {
  const base = String(url || '').trim();
  const secret = credential && typeof credential.secret === 'string' ? credential.secret : '';
  if (!base || !secret) return { url: base, authed: false };
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { url: base, authed: false };
    if (credential.kind === 'basic' && credential.username) {
      u.username = credential.username;
      u.password = secret;
    } else if (String(credential.site || '').toLowerCase() === SITES.GITLAB) {
      u.username = 'oauth2';
      u.password = secret;
    } else {
      u.username = secret;
    }
    return { url: u.toString(), authed: true };
  } catch {
    return { url: base, authed: false };
  }
}

/** 脱敏：保留首尾各 4 位，中间省略。 */
export function maskSecret(secret) {
  const s = String(secret || '');
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * 把文本里可能出现的凭据抹掉：URL 用户信息段、常见 token 前缀。
 * 宿主报错常原样回传克隆地址（含 token），日志与界面展示前必须过这一层。
 */
export function scrubUrlCredentials(text) {
  return String(text || '')
    .replace(/(https?:\/\/)[^/@\s]+@/gi, '$1***@')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|glpat-[A-Za-z0-9_-]{10,})\b/g, '***');
}

/** 仓库唯一键（用于「同一作者/仓库只允许一个来源」的去重与登记）。 */
export function repoKey(repoOrUrl) {
  const p = typeof repoOrUrl === 'string' ? parseRepoUrl(repoOrUrl) : repoOrUrl;
  if (!p || !p.ok) return '';
  return `${p.host}/${p.owner}/${p.repo}`.toLowerCase();
}
