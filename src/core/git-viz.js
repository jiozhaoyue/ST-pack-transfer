/**
 * Git 可视化模型（纯逻辑，不 fetch、不碰 DOM、不做 i18n）。
 *
 * 数据事实（2026-11-11 核对 Dev 实例端点）：
 * - 本地宿主 `.git`：`/api/extensions/version` → `{currentBranchName, currentCommitHash, isUpToDate, remoteUrl, remoteCommitHash}`；
 *   `/api/extensions/branches` → `[{name, commit, current, label}]`。
 * - 云端：仓库登记（`gitInstalls`）同源的站点 API，只取分支 / 标签 / 最近提交 / 单次 diff。
 *
 * 纪律：`currentCommitHash` 为空就是「历史已丢失 / 非 Git 仓库」，**不伪造提交**；
 * 宿主没有工作区状态端点时，状态由视图层显示「宿主未提供」。
 */

/** 工作区状态取值（视图层负责翻译）。 */
export const GIT_STATES = Object.freeze({
  historyLost: 'history-lost',
  upToDate: 'up-to-date',
  outOfDate: 'out-of-date',
  unknown: 'unknown',
});

/** 短 SHA（默认 8 位）。 */
export function shortSha(sha, length = 8) {
  const value = String(sha || '').trim();
  if (!value) return '';
  return value.slice(0, Math.max(4, Math.min(40, Number(length) || 8)));
}

/**
 * 归一宿主 `/api/extensions/version` 的响应。
 * @param {unknown} payload
 * @param {{name?:string}} [options]
 * @returns {{name:string, branch:string, commit:string, shortCommit:string, remoteCommit:string, remoteUrl:string, upToDate:boolean, hasHistory:boolean}}
 */
export function normalizeLocalGit(payload, { name = '' } = {}) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const commit = String(data.currentCommitHash || '').trim();
  return {
    name: String(name || ''),
    branch: String(data.currentBranchName || '').trim(),
    commit,
    shortCommit: shortSha(commit),
    remoteCommit: String(data.remoteCommitHash || '').trim(),
    remoteUrl: String(data.remoteUrl || '').trim(),
    upToDate: data.isUpToDate === true,
    hasHistory: !!commit,
  };
}

/**
 * 工作区状态码：无 HEAD ⇒ 历史已丢失；有 HEAD 才谈「是否最新」。
 * @param {{hasHistory?:boolean, upToDate?:boolean}|null} local
 * @returns {'history-lost'|'up-to-date'|'out-of-date'|'unknown'}
 */
export function gitStateOf(local) {
  if (!local) return GIT_STATES.unknown;
  if (!local.hasHistory) return GIT_STATES.historyLost;
  return local.upToDate ? GIT_STATES.upToDate : GIT_STATES.outOfDate;
}

/** `origin/main` → `main`（本地分支与远端分支对比用）。 */
export function stripRemotePrefix(name) {
  return String(name || '').replace(/^[^/]+\//, '');
}

/**
 * 合并本地分支与云端分支：本地优先（含 commit / current），云端只作补充。
 * @param {unknown} localBranches 宿主 `/api/extensions/branches` 响应
 * @param {unknown} cloudBranches 站点 branches 归一结果（字符串数组）
 * @returns {Array<{name:string, commit:string, current:boolean, source:'local'|'cloud'}>}
 */
export function mergeBranches(localBranches, cloudBranches = []) {
  const rows = [];
  const seen = new Set();
  const local = Array.isArray(localBranches) ? localBranches : [];
  for (const branch of local) {
    if (!branch || typeof branch !== 'object') continue;
    const name = String(branch.name || branch.label || '').trim();
    if (!name) continue;
    rows.push({
      name,
      commit: String(branch.commit || '').trim(),
      current: branch.current === true,
      source: 'local',
    });
    seen.add(stripRemotePrefix(name));
  }
  const cloud = Array.isArray(cloudBranches) ? cloudBranches : [];
  for (const name of cloud) {
    const clean = String(name || '').trim();
    if (!clean || seen.has(stripRemotePrefix(clean))) continue;
    rows.push({ name: clean, commit: '', current: false, source: 'cloud' });
    seen.add(stripRemotePrefix(clean));
  }
  /* 当前分支排最前，其余按名字稳定排序（避免每次重绘跳动）。 */
  return rows.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
}

/**
 * 视图用的总览：把「登记仓库 / 本地 .git / 云端只读信息」合成一份事实。
 * @param {{name?:string, install?:object|null, local?:object|null, cloud?:object|null}} [input]
 */
export function buildGitSummary({ name = '', install = null, local = null, cloud = null } = {}) {
  const state = gitStateOf(local);
  const registered = !!(install && install.url);
  return {
    name: String(name || ''),
    registered,
    hasHistory: !!(local && local.hasHistory),
    state,
    branch: (local && local.branch) || '',
    commit: (local && local.commit) || '',
    shortCommit: (local && local.shortCommit) || '',
    remoteUrl: (local && local.remoteUrl) || (install && install.url) || '',
    cloud: {
      branches: Array.isArray(cloud?.branches) ? cloud.branches : [],
      tags: Array.isArray(cloud?.tags) ? cloud.tags : [],
      commits: Array.isArray(cloud?.commits) ? cloud.commits : [],
      error: String(cloud?.error || ''),
    },
  };
}

/**
 * 列表行：已装扩展 + 本插件的安装登记（`gitInstalls`），同名合并。
 * @param {Array<object>} installed 宿主已装扩展（`listHostExtensions().items`）
 * @param {Array<object>} installs `settings.gitInstalls`
 */
export function selectGitTargets(installed = [], installs = []) {
  const registry = new Map();
  for (const item of Array.isArray(installs) ? installs : []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    registry.set(name, item);
  }
  const rows = [];
  for (const item of Array.isArray(installed) ? installed : []) {
    const name = String(item?.id || item?.folder || item?.name || '').trim();
    if (!name) continue;
    const install = registry.get(name) || null;
    rows.push({
      name,
      version: String(item?.version || ''),
      sourceType: String(item?.sourceType || 'local'),
      url: String(install?.url || ''),
      ref: String(install?.ref || ''),
      registered: !!install,
    });
  }
  /* 登记了但当前未装的条目也列出：卸载后仍能看「登记仓库」的只读信息。 */
  const listed = new Set(rows.map((row) => row.name));
  for (const [name, install] of registry) {
    if (listed.has(name)) continue;
    rows.push({
      name,
      version: '',
      sourceType: '',
      url: String(install?.url || ''),
      ref: String(install?.ref || ''),
      registered: true,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** diff 摘要（单次提交的文件级增删行数）。 */
export function diffStat(files = []) {
  let additions = 0;
  let deletions = 0;
  let known = false;
  for (const file of Array.isArray(files) ? files : []) {
    if (Number.isFinite(file?.additions)) { additions += file.additions; known = true; }
    if (Number.isFinite(file?.deletions)) { deletions += file.deletions; known = true; }
  }
  return { files: Array.isArray(files) ? files.length : 0, additions, deletions, known };
}
