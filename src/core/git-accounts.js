/**
 * Git 账号库（纯逻辑：归一 / 增删 / 默认 / 按仓库匹配 / 脱敏）。
 *
 * 口径（用户 2026-11-11）：
 * - **单用户**——库里的账号全部属于当前酒馆用户，不存在「多酒馆用户」维度；
 * - 每站点可存多个账号，用 ☆ 指定该站点默认；
 * - 凭据默认随宿主 `extension_settings` 落服务端 settings.json，也可选择只存浏览器。
 */

import { SITES, siteOfHost } from './git-url.js';

export const ACCOUNT_SITES = Object.freeze([SITES.GITHUB, SITES.GITLAB, SITES.GITEE, SITES.GITEA]);

const DEFAULT_HOST = Object.freeze({
  [SITES.GITHUB]: 'github.com',
  [SITES.GITLAB]: 'gitlab.com',
  [SITES.GITEE]: 'gitee.com',
});

export function siteDefaultHost(site) {
  return DEFAULT_HOST[site] || '';
}

function hostOfBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * 归一单个账号。`secret` 必填；`site` 决定默认 host 与 API 形态。
 * @returns {object|null} 非法输入返回 null
 */
export function normalizeAccount(input) {
  if (!input || typeof input !== 'object') return null;
  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  if (!secret) return null;
  let site = String(input.site || '').toLowerCase();
  if (!ACCOUNT_SITES.includes(site)) site = SITES.CUSTOM;
  if (site === SITES.CUSTOM) site = SITES.GITEA; // 自建只支持 Gitea / GitLab 形态，默认按 Gitea
  const baseHost = hostOfBaseUrl(input.baseUrl);
  const host = baseHost || siteDefaultHost(site);
  if (!host) return null;
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const id = typeof input.id === 'string' && input.id.trim()
    ? input.id.trim()
    : `${site}:${host}:${username || 'token'}:${secret.slice(-4)}`;
  return {
    id,
    site,
    host,
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl.trim().replace(/\/+$/, '') : '',
    username,
    secret,
    label: typeof input.label === 'string' && input.label.trim() ? input.label.trim() : (username || host),
    authKind: input.authKind === 'oauth' ? 'oauth' : 'token',
    isDefault: !!input.isDefault,
    createdAt: Number(input.createdAt) || 0,
  };
}

/** 归一账号列表：去重、每组最多一个默认。 */
export function normalizeAccounts(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const acc = normalizeAccount(item);
    if (!acc || seen.has(acc.id)) continue;
    seen.add(acc.id);
    out.push(acc);
  }
  const groups = new Map();
  for (const acc of out) {
    const key = `${acc.site}::${acc.host}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(acc);
  }
  for (const group of groups.values()) {
    const defaults = group.filter((a) => a.isDefault);
    group.forEach((a, i) => { a.isDefault = defaults.length ? a === defaults[0] : i === 0; });
  }
  return out;
}

/** 新增/覆盖账号；同组第一个自动成为默认。 */
export function addAccount(list, account) {
  const acc = normalizeAccount(account);
  if (!acc) return normalizeAccounts(list);
  const out = normalizeAccounts(list).filter((a) => a.id !== acc.id);
  const sameGroup = out.filter((a) => a.site === acc.site && a.host === acc.host);
  if (sameGroup.length === 0) acc.isDefault = true;
  out.push(acc);
  return normalizeAccounts(out);
}

export function removeAccount(list, id) {
  return normalizeAccounts(normalizeAccounts(list).filter((a) => a.id !== id));
}

/** 设默认：同 site+host 组内互斥。 */
export function setDefaultAccount(list, id) {
  const all = normalizeAccounts(list);
  const target = all.find((a) => a.id === id);
  if (!target) return all;
  return normalizeAccounts(all.map((a) => (
    a.site === target.site && a.host === target.host ? { ...a, isDefault: a.id === id } : a
  )));
}

/** 按仓库匹配账号：同 host 优先，其次同 site 的默认账号。 */
export function findAccountFor(list, repo) {
  const all = normalizeAccounts(list);
  if (!all.length || !repo) return null;
  const host = String(repo.host || '').toLowerCase();
  const site = repo.site || siteOfHost(host);
  const sameHost = all.filter((a) => a.host === host);
  if (sameHost.length) return sameHost.find((a) => a.isDefault) || sameHost[0];
  const sameSite = all.filter((a) => a.site === site);
  return sameSite.find((a) => a.isDefault) || sameSite[0] || null;
}

export function credentialOf(account) {
  if (!account || !account.secret) return null;
  return account.username
    ? { kind: 'basic', username: account.username, secret: account.secret }
    : { kind: 'token', secret: account.secret };
}

/** 脱敏展示：任何 UI / 日志都只能拿到这个形态。 */
export function maskAccount(account) {
  if (!account) return null;
  const s = String(account.secret || '');
  return {
    ...account,
    secret: s ? `${s.slice(0, 4)}…${s.slice(-4)}` : '',
    hasSecret: !!s,
  };
}

export function maskAccounts(list) {
  return (Array.isArray(list) ? list : []).map(maskAccount);
}
