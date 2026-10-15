/**
 * 顶部配额看板（2026-10-15 重定义：加「宿主数据分布」，并把不可用项改为**置灰**）：
 * ① 浏览器配额 —— `navigator.storage.estimate()`：本页面（含 IndexedDB / OPFS）已用 / 总配额。
 * ② 宿主配额   —— Luker 管理员分配给当前用户的配额
 *                 （`/api/users/storage/inspect` 的 `quota.usedBytes / quotaBytes`）。
 * ③ 宿主数据分布 —— 同端点的 `entries`（全 10 类各自占用），即用户口中的「像 Luker」。
 *
 * 与旧版的两处行为差异：
 *  · 旧版在宿主读数不可用时**整行撤掉** ⇒ 用户看到「什么都没有」，会以为本来就没这功能；
 *    新版**置灰**并写明原因（用户 2026-10-15：「独立模式就只有浏览器配额，宿主之类的是灰」）。
 *  · 旧版的「查询中...」在非 Luker 宿主会永久停留（2026-10-14 已修成撤行）；
 *    新版没有中间态——先画置灰骨架，读数到达后原地重画，任何时刻都不会卡在假进行态。
 */

import { detectHost } from './host-bridge.js';
import { escapeHtml, trustedStaticMarkup } from './escape.js';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 拉取宿主侧的存储读数：**配额 + 数据分布**。
 *
 * 端点事实（2026-10-15 读 Luker 源码取证，非臆测）：
 * `POST /api/users/storage/inspect` 走 `enumerateRoot()`，返回
 *   `{ target, quota: {usedBytes, quotaBytes, over}, path, breadcrumbs, isLeaf,
 *      entries: [{ key, label, icon, kind:'category', sizeBytes, childCount, canDrill, note }] }`
 * 其中 `entries` 就是「全 10 类 total」——即用户 2026-10-15 要的「宿主数据分布（像 Luker）」。
 * 来源：`Instance/Dev/Luker/src/storage/inspector.js:378`（`enumerateRoot`）与 `:28`（`CATEGORIES`）。
 *
 * 不可达 / 非 Luker 宿主一律返回 `null`——调用方据此**置灰**该区块（用户 2026-10-15：
 * 「独立模式就只有浏览器配额，宿主之类的是灰」）。**不再整行撤掉**：
 * 撤掉会让人以为「本来就没这东西」，置灰才说得清「有这个读数、只是当前环境没有」。
 *
 * @returns {Promise<{quota: object|null, entries: Array<object>}|null>}
 */
async function fetchHostStorage() {
  try {
    const host = detectHost();
    if (host.platform !== 'luker') return null;
    const token = (await (await fetch('/csrf-token', { credentials: 'same-origin' })).json()).token;
    const resp = await fetch('/api/users/storage/inspect', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ path: [] }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.quota || data.quota.usedBytes == null) return null;
    // entries 的字段逐条校验后再采用：宿主升级可能改形，缺字段的行宁可不画
    const entries = Array.isArray(data.entries)
      ? data.entries.filter((e) => e && typeof e.sizeBytes === 'number' && e.sizeBytes > 0)
      : [];
    return { quota: data.quota, entries };
  } catch {
    return null;
  }
}

/**
 * 宿主类目键 → 中文标签。
 *
 * 键取自 Luker `src/storage/inspector.js:28` 的 `CATEGORIES`（2026-10-15 读源码取证）：
 * chats / characters / worlds / images / attachments / presets / extensions / vectors / backups / other。
 * 宿主自己的 `label` 是英文（`Chats` / `Characters` / …），而本插件面向中文用户，
 * 故做一次映射；未登记的键回落到宿主给的 label，不硬造。
 */
const HOST_CATEGORY_LABELS = Object.freeze({
  chats: '聊天记录',
  characters: '角色卡',
  worlds: '世界书',
  images: '图片',
  attachments: '附件',
  presets: '预设与设置',
  extensions: '扩展',
  vectors: '向量库',
  backups: '备份',
  other: '其他',
});

/** 置灰时的说明（说清「有这个读数、只是当前环境没有」） */
const HOST_DISABLED_REASON = '当前环境无宿主存储读数';

/** 浏览器配额区：恒渲染；`estimate` 不可用时置灰而非撤掉 */
async function buildBrowserSection() {
  const section = document.createElement('div');
  section.className = 'usage-quota-section';

  let usage = 0;
  let quota = 0;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est && est.quota > 0) {
        usage = est.usage || 0;
        quota = est.quota;
      }
    }
  } catch {
    // estimate 失败按「不可用」处理，落到下面的置灰分支
  }

  if (!quota) {
    section.classList.add('is-disabled');
    section.setAttribute('aria-disabled', 'true');
    section.innerHTML = `
      <div class="usage-quota-label">
        <span><i class="fa-solid fa-hard-drive"></i> 浏览器配额</span>
        <span>当前浏览器不提供存储读数</span>
      </div>
      <div class="usage-quota-bar"><div class="usage-quota-fill" style="width:0%"></div></div>
    `;
    return section;
  }

  const pct = Math.min(100, (usage / quota) * 100);
  section.innerHTML = `
    <div class="usage-quota-label">
      <span><i class="fa-solid fa-hard-drive"></i> 浏览器配额</span>
      <span>${escapeHtml(formatBytes(usage))} / ${escapeHtml(formatBytes(quota))} (${escapeHtml(pct.toFixed(1))}%)</span>
    </div>
    <div class="usage-quota-bar"><div class="usage-quota-fill" style="width:${escapeHtml(pct.toFixed(1))}%"></div></div>
  `;
  return section;
}

/** 宿主配额 + 数据分布区：读数到达前先挂置灰骨架，到达后原地重画 */
function buildHostSection() {
  const section = document.createElement('div');
  section.className = 'usage-quota-section usage-quota-host';
  paintHostSection(section, null);
  return section;
}

/**
 * 把宿主读数画进容器。`data` 为 `null` 即置灰。
 * @param {HTMLElement} section
 * @param {{quota: object, entries: Array<object>}|null} data
 */
function paintHostSection(section, data) {
  if (!data) {
    section.classList.add('is-disabled');
    section.setAttribute('aria-disabled', 'true');
    section.innerHTML = `
      <div class="usage-quota-label">
        <span><i class="fa-solid fa-user-shield"></i> 宿主配额</span>
        <span>${escapeHtml(HOST_DISABLED_REASON)}</span>
      </div>
      <div class="usage-quota-bar"><div class="usage-quota-fill" style="width:0%"></div></div>
    `;
    return;
  }

  const { quota, entries } = data;
  const { usedBytes, quotaBytes, over } = quota;
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
  const detail = quotaBytes == null
    ? `${formatBytes(usedBytes)} / 无限制`
    : `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)} (${pct.toFixed(1)}%)`;

  section.classList.remove('is-disabled');
  section.removeAttribute('aria-disabled');

  // 条形长度按**最大类目**归一，而不是按配额总量——否则小类目全部退化成一条细线
  const maxBytes = entries.reduce((m, e) => Math.max(m, e.sizeBytes), 0);
  const distRows = entries.map((e) => {
    const width = maxBytes > 0 ? (e.sizeBytes / maxBytes) * 100 : 0;
    const label = HOST_CATEGORY_LABELS[e.key] || e.label || e.key || '';
    return `
      <div class="usage-dist-row">
        <span class="usage-dist-label">${escapeHtml(label)}</span>
        <span class="usage-dist-bar"><span class="usage-dist-fill" style="width:${escapeHtml(width.toFixed(1))}%"></span></span>
        <span class="usage-dist-size">${escapeHtml(formatBytes(e.sizeBytes))}</span>
      </div>
    `;
  }).join('');

  section.innerHTML = `
    <div class="usage-quota-label">
      <span><i class="fa-solid fa-user-shield"></i> 宿主配额${escapeHtml(over ? '（已超限）' : '')}</span>
      <span>${escapeHtml(detail)}</span>
    </div>
    <div class="usage-quota-bar"><div class="usage-quota-fill ${escapeHtml(over ? 'usage-quota-fill-page' : '')}" style="width:${escapeHtml(over ? 100 : pct.toFixed(1))}%"></div></div>
    ${trustedStaticMarkup(distRows ? `<div class="usage-dist">${distRows}</div>` : '')}
  `;
}

/**
 * 渲染配额看板（每次数据变化后重入调用）。
 *
 * 结构（用户 2026-10-15 裁定：上方显示配额与宿主数据分布，像 Luker）：
 *   ① 浏览器配额   —— 本页面（含 IndexedDB / OPFS）用量
 *   ② 宿主配额     —— 宿主分配的配额
 *   ③ 宿主数据分布 —— 宿主各类目占用（10 类）
 *
 * ②③ 在无宿主读数的环境（独立 Web / ST / TT / PT）**置灰而不撤掉**——
 * 撤掉会让人以为「本来就没这东西」，置灰才说得清「有这个读数、只是当前环境没有」。
 *
 * @param {object} params
 * @param {HTMLElement} params.containerEl
 */
export async function renderUsageDashboard({ containerEl }) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  containerEl.appendChild(await buildBrowserSection());

  const hostSection = buildHostSection();
  containerEl.appendChild(hostSection);

  fetchHostStorage().then((data) => {
    // 渲染期间容器可能已被重建，校验仍在 DOM
    if (!containerEl.isConnected || !containerEl.contains(hostSection)) return;
    paintHostSection(hostSection, data);
  }).catch(() => {
    if (containerEl.isConnected && containerEl.contains(hostSection)) paintHostSection(hostSection, null);
  });
}
