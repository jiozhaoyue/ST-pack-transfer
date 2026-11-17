/**
 * 本插件更新日志（纯逻辑，无 DOM）。
 *
 * 数据源优先级：
 * 1. 构建期 `vite.config.js` 注入的 `__APP_CHANGELOG__`（完整 git 提交，最早→最新）；
 * 2. 宿主直装没有构建步骤时使用下面的发布摘要回退；仍可通过 GitHub API 补全。
 *
 * 用户 2026-11-17 裁定：
 * - 每次版本变化后自动弹更新说明，默认开启，可关闭「不再自动显示」；
 * - 设置页永远可以打开完整提交日志，**从新到旧**（最新在最上面）；
 * - 可切换「只看发布提交」。
 */

const FALLBACK_RELEASES = [
  {
    version: '0.6.0',
    date: '2026-11-18',
    title: '质量与正确性冲刺：分卷同源判定、续传修复、安全加固、全视口 UI 收口',
    notes: [
      '分卷阈值改按实测产物字节判定：可压缩内容不再过度切卷，分卷数更少更准。',
      '分卷改为懒描述符流水线：GB 级包转换峰值内存大幅下降，不再整包解压驻留。',
      '修复队列恢复路径丢失断点的问题：暂停后继续真的带着半成品，不再静默整包重做。',
      '修复云端全量快照同秒覆盖：同一秒内连续备份不再互相顶掉，快照不再静默丢失。',
      '局域网接收改批写 + 信用流控：弱盘快网下更稳，发送端消费 ACK 信用防积压。',
      '安全加固：包名、树节点、设置输入等多处用户可控内容补齐转义。',
      '删除失败不再静默报成功；Worker 加载失败有界兜底，不再永久挂死。',
      '扩展管理包侧「导出扩展清单」按钮修复：选中包后即可用，不再需要误触。',
      '云端列表渲染恢复：备份快照在界面可见、可一键恢复（此前渲染被误删）。',
      '计划预览与产物合成项一致化，新增预览↔产物一致性契约测试。',
      '全视口 UI 矩阵收口：页头控件高度同步、主题下拉可收缩、文案 107 处合规化。',
    ],
  },
  {
    version: '0.5.3',
    date: '2026-11-17',
    title: '双选完整/清单、智能建议、教程浮层修复、更新日志、队列与日志全量',
    notes: [
      '扩展完整 / 清单可同时点亮（双选），官方索引与私有清单同步记录 both。',
      '完整 / 清单建议更显眼：本插件与无远端/私有仓库建议完整，公开远端建议清单。',
      '移动端教程浮层改挂 document.body，不再被宿主滚动容器带到屏幕外。',
      '局域网互传二维码改用 ESM 编码器，不再依赖宿主全局 window.qrcode。',
      '新增更新日志自动弹窗与完整提交日志查看；日志默认 WARN，可切 DEBUG 全量。',
      '生成队列支持排队、暂停、继续、中断与排序。',
    ],
  },
  {
    version: '0.5.2',
    date: '2026-11-17',
    title: '逐扩展双模式、包内 Git 真提交与文档站样式',
    notes: ['逐扩展完整 / 清单模式；包内 .git 真实提交解析；文档站自定义模板。'],
  },
  {
    version: '0.5.1',
    date: '2026-11-16',
    title: '发布修补',
    notes: ['版本号与发布流程修补。'],
  },
  {
    version: '0.5.0',
    date: '2026-11-16',
    title: '正式版发布',
    notes: ['正式版发布、/docs 入口、教程文档跳转联动、CI 文档守卫。'],
  },
];

export const CHANGELOG_SEEN_KEY = 'st-pack-transfer:seen-version';

function parseCommitLine(line) {
  const text = String(line || '');
  const first = text.indexOf('|');
  const second = text.indexOf('|', first + 1);
  if (first <= 0 || second <= 0) return null;
  const sha = text.slice(0, first).trim();
  const date = text.slice(first + 1, second).trim();
  const subject = text.slice(second + 1).trim();
  if (!sha || !subject) return null;
  return { sha, date, subject };
}

/** 发布 tag（构建期 __APP_TAGS__ 注入；无构建环境返回空）。 */
function tagsOf(sha) {
  try {
    if (typeof __APP_TAGS__ !== 'undefined' && __APP_TAGS__ && sha) {
      const list = __APP_TAGS__[sha];
      return Array.isArray(list) ? [...list] : [];
    }
  } catch { /* 未注入 */ }
  return [];
}

/** 完整提交列表（最早→最新）。构建期注入优先。 */
export function changelogCommits() {
  if (typeof __APP_CHANGELOG__ !== 'undefined' && Array.isArray(__APP_CHANGELOG__)) {
    return __APP_CHANGELOG__
      .map(parseCommitLine)
      .filter(Boolean)
      .map((entry) => ({ ...entry, tags: tagsOf(entry.sha) }));
  }
  return [];
}

/** 更新说明：优先取最近提交，回退到发布摘要。 */
export function recentChangelog(limit = 30) {
  const commits = changelogCommits();
  if (commits.length) return commits.slice(-limit).reverse();
  const release = FALLBACK_RELEASES[0];
  return release.notes.map((subject, i) => ({
    sha: '', date: release.date, subject, release: release.version, index: i + 1,
  }));
}

/** 完整日志：构建期有注入就全量；**必须从新到旧**（2026-11-17 用户裁定）。 */
export function fullChangelog() {
  const commits = changelogCommits();
  if (commits.length) return commits.slice().reverse();
  return FALLBACK_RELEASES.flatMap((release) => release.notes.map((subject, index) => ({
    sha: '', date: release.date, subject: `v${release.version} · ${subject}`,
    release: index === 0 ? release.version : undefined,
    tags: index === 0 ? [`v${release.version}`] : [],
  })));
}

export function changelogReleases() {
  return FALLBACK_RELEASES.map((release) => ({ ...release, notes: [...release.notes] }));
}

/** 版本变化判定（纯函数，便于测试）。 */
export function shouldShowChangelog(seenVersion, currentVersion, enabled = true) {
  if (!enabled) return false;
  if (!currentVersion) return false;
  return String(seenVersion || '') !== String(currentVersion);
}

export function readSeenVersion(storage = null) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    return store?.getItem?.(CHANGELOG_SEEN_KEY) || '';
  } catch { return ''; }
}

export function markSeenVersion(version, storage = null) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    store?.setItem?.(CHANGELOG_SEEN_KEY, String(version || ''));
    return true;
  } catch { return false; }
}
