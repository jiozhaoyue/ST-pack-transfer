/**
 * i18n（扁平 key）
 *
 * 设计：
 * - locale 文件是**扁平 key → 文案**的可读对象，便于逐条评审与键一致性校验；
 * - `t(key, params)` 解析 `{param}` 插值；缺 key 回退 zh-CN 并告警；
 * - 语言优先级：`?lang=` > localStorage > navigator.language > zh-CN；
 * - 语言切换通过 onLocaleChange 通知视图重渲染。
 */
import enUS from './locales/en-US.js';
import zhCN from './locales/zh-CN.js';

export const SUPPORTED = Object.freeze(['zh-CN', 'en-US']);
export const FALLBACK = 'zh-CN';
const LOCALES = Object.freeze({ 'zh-CN': zhCN, 'en-US': enUS });
const STORAGE_KEY = 'st-pack-transfer:locale';

let current = null;
const listeners = new Set();

function readStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStorage(locale) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* 隐私模式 */
  }
}

export function normalizeLocale(value) {
  const v = String(value || '').replace('_', '-').toLowerCase();
  if (v.startsWith('zh')) return 'zh-CN';
  if (v.startsWith('en')) return 'en-US';
  return FALLBACK;
}

export function resolveLocale(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const q = new URLSearchParams(search || '').get('lang');
    if (q) return normalizeLocale(q);
  } catch {
    /* 非法 query */
  }
  const stored = readStorage();
  if (stored) return normalizeLocale(stored);
  const nav = (typeof navigator !== 'undefined' && navigator.language) || FALLBACK;
  return normalizeLocale(nav);
}

export function getLocale() {
  if (!current) current = resolveLocale();
  return current;
}

export function setLocale(locale) {
  const next = normalizeLocale(locale);
  current = next;
  writeStorage(next);
  for (const fn of listeners) {
    try { fn(next); } catch { /* 单个监听器失败不影响其它 */ }
  }
  return next;
}

export function onLocaleChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, params = {}) {
  const dict = LOCALES[getLocale()] || LOCALES[FALLBACK];
  let value = dict[key];
  if (typeof value !== 'string') value = LOCALES[FALLBACK][key];
  if (typeof value !== 'string') {
    if (typeof console !== 'undefined') console.warn(`[i18n] missing key: ${key}`);
    return String(key);
  }
  return value.replace(/\{(\w+)\}/g, (_, name) => (
    params[name] != null ? String(params[name]) : `{${name}}`
  ));
}

/** 供测试/校验：返回某语言的全部 key。 */
export function keysOf(locale = getLocale()) {
  return Object.keys(LOCALES[locale] || {});
}

export function localeOf(locale) {
  return LOCALES[locale] || null;
}
