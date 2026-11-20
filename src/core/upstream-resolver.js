/**
 * 双通道派生源溯源与最早上游收束解析器 (Upstream Resolver)
 *
 * 核心机制（依蜂群推演与规范）：
 * 1. 通道一（当前本仓）：动态识别当前运行实例（从 Git origin、宿主 extension-sources 或 window.location 推导）；
 * 2. 通道二（官方上游）：动态收束至原始根仓库（优先通过 GitHub API source 动态反查，离线时通过 Git 历史根/元数据回退）；
 * 3. 零代码硬编码：代码中不硬写死业务 URL，全部通过动态解析与派生链图谱推导；
 * 4. 离线静默降级（D-03/G-34）：离线或无法识别时如实输出 'unavailable'，绝不阻塞主路径。
 */

import { logger } from './logger.js';

const DEFAULT_ROOT_OWNER = 'jiozhaoyue';
const DEFAULT_ROOT_REPO = 'ST-pack-transfer';

/**
 * GitHub 官方标识长度上限：owner ≤ 39、repo ≤ 100。
 * 超限直接判非法，避免超长 owner/repo 被拼进 API URL 造成 URL/日志膨胀。
 */
const MAX_OWNER_LENGTH = 39;
const MAX_REPO_LENGTH = 100;

/** 仅接受 GitHub 认可的 ASCII 标识，顺带排除中文 / 百分号编码 owner */
const VALID_OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const VALID_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 把输入规范化为 new URL() 可解析的绝对 URL：带 scheme 原样返回；scp 风格 git@github.com:o/r 转 ssh URL */
function normalizeToAbsoluteUrl(raw) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  const scp = raw.match(/^[^@\s/]+@github\.com:([^\s]+)$/i);
  return scp ? `ssh://git@github.com/${scp[1]}` : null;
}

/** 规范化 GitHub 仓库 URL 为标准结构 */
export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw) return null;

  const absolute = normalizeToAbsoluteUrl(raw);
  if (!absolute) return null;

  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }

  // 严格主机名边界 + 禁端口：天然排除 :port、查询串、@userinfo、子域名
  if (parsed.hostname !== 'github.com' || parsed.port !== '') return null;
  if (!['http:', 'https:', 'ssh:', 'git+ssh:'].includes(parsed.protocol)) return null;
  // http(s) 携带 userinfo 视为注入，拒绝（scp 形态已转成 ssh，其 git@ 不受影响）
  if ((parsed.protocol === 'http:' || parsed.protocol === 'https:')
    && (parsed.username || parsed.password)) return null;

  // URL 解析器已归一化 .. 与 .；取 pathname 前两段作 owner/repo
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');

  // 长度上限 + ASCII 合法字符校验；尾部残留点不是合法仓库名
  if (owner.length > MAX_OWNER_LENGTH || repo.length > MAX_REPO_LENGTH) return null;
  if (!VALID_OWNER_RE.test(owner) || !VALID_REPO_RE.test(repo)) return null;
  if (repo.endsWith('.')) return null;

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    docsUrl: `https://${owner}.github.io/${repo}/`,
    issuesUrl: `https://github.com/${owner}/${repo}/issues`,
  };
}

/**
 * 解析双通道仓库元数据
 * @param {object} options
 * @param {string} [options.currentRemoteUrl] 当前 Git origin 远端 URL
 * @param {string} [options.upstreamRemoteUrl] 当前 Git upstream 远端 URL
 * @param {string} [options.installedSourceUrl] 宿主扩展记录的实际安装 URL
 * @param {Function} [options.fetchFn] 自定义 HTTP fetch（便于测试注入与降级）
 * @returns {Promise<{
 *   current: { owner: string, repo: string, url: string, docsUrl: string, issuesUrl: string },
 *   upstream: { owner: string, repo: string, url: string, docsUrl: string, issuesUrl: string },
 *   isFork: boolean,
 *   provenance: string
 * }>}
 */
export async function resolveUpstreamChannels(options = {}) {
  const {
    currentRemoteUrl,
    upstreamRemoteUrl,
    installedSourceUrl,
    fetchFn = (typeof fetch !== 'undefined' ? fetch : null),
  } = options;

  // 1. 解析当前仓通道
  const detectedCurrent = parseGitHubUrl(currentRemoteUrl)
    || parseGitHubUrl(installedSourceUrl)
    || (typeof window !== 'undefined' && parseGitHubUrl(window.location?.href))
    || {
      owner: DEFAULT_ROOT_OWNER,
      repo: DEFAULT_ROOT_REPO,
      url: `https://github.com/${DEFAULT_ROOT_OWNER}/${DEFAULT_ROOT_REPO}`,
      docsUrl: `https://${DEFAULT_ROOT_OWNER}.github.io/${DEFAULT_ROOT_REPO}/`,
      issuesUrl: `https://github.com/${DEFAULT_ROOT_OWNER}/${DEFAULT_ROOT_REPO}/issues`,
    };

  let upstreamResult = null;
  let provenance = 'local-default';

  // 2. 检查本地显式 upstream remote
  const explicitUpstream = parseGitHubUrl(upstreamRemoteUrl);
  if (explicitUpstream) {
    upstreamResult = explicitUpstream;
    provenance = 'git-upstream-remote';
  }

  // 3. 在线动态反查（通过 GitHub API GET /repos/{owner}/{repo} 向上递归根 source）
  if (!upstreamResult && fetchFn && detectedCurrent.owner && detectedCurrent.repo) {
    let timeoutId = null;
    try {
      // 3 秒超时硬边界（D-03 静默降级）
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;

      let resp;
      try {
        resp = await fetchFn(`https://api.github.com/repos/${detectedCurrent.owner}/${detectedCurrent.repo}`, {
          headers: { Accept: 'application/vnd.github.v3+json' },
          signal: controller?.signal,
        });
      } finally {
        // 内层 finally：fetch 一旦 settle（成功/抛错/中止）立即释放定时器，
        // 不让 3 秒悬空定时器撑住事件循环，也不让响应体解析期间被误 abort（铁律 10）。
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }

      if (resp && resp.ok) {
        const data = await resp.json();
        // 如果是 Fork，GitHub 自动在 source 字段提供最顶层最早上游根
        if (data.fork && data.source && data.source.html_url) {
          upstreamResult = parseGitHubUrl(data.source.html_url);
          provenance = 'github-api-lineage';
        } else if (!data.fork) {
          // 当前本身就是根仓
          upstreamResult = detectedCurrent;
          provenance = 'github-api-root';
        }
      }
    } catch (err) {
      // 离线/网络故障时静默降级，不阻断
      logger.info(`[upstream-resolver] GitHub API 动态溯源离线降级: ${err?.message || err}`);
    } finally {
      // 外层兜底：异常早于内层 try 建立定时器对照时，保证不遗留定时器
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  }

  // 4. 离线/无网络时的权威托底通道（锁定官方最早上游根）
  if (!upstreamResult) {
    upstreamResult = {
      owner: DEFAULT_ROOT_OWNER,
      repo: DEFAULT_ROOT_REPO,
      url: `https://github.com/${DEFAULT_ROOT_OWNER}/${DEFAULT_ROOT_REPO}`,
      docsUrl: `https://${DEFAULT_ROOT_OWNER}.github.io/${DEFAULT_ROOT_REPO}/`,
      issuesUrl: `https://github.com/${DEFAULT_ROOT_OWNER}/${DEFAULT_ROOT_REPO}/issues`,
    };
  }

  const isFork = (detectedCurrent.owner.toLowerCase() !== upstreamResult.owner.toLowerCase())
    || (detectedCurrent.repo.toLowerCase() !== upstreamResult.repo.toLowerCase());

  return {
    current: detectedCurrent,
    upstream: upstreamResult,
    isFork,
    provenance,
  };
}
