/**
 * 把 data-i18n* 属性应用到 DOM。
 *
 * 支持：
 * - `data-i18n` → textContent
 * - `data-i18n-title` → title
 * - `data-i18n-placeholder` → placeholder
 * - `data-i18n-aria` → aria-label
 *
 * 模板里只保留 key，不保留中文兜底；语言切换时重新调用即可。
 */
import { t } from './index.js';

const ATTRS = [
  ['data-i18n', (el, value) => { el.textContent = value; }],
  ['data-i18n-title', (el, value) => { el.setAttribute('title', value); }],
  ['data-i18n-placeholder', (el, value) => { el.setAttribute('placeholder', value); }],
  ['data-i18n-aria', (el, value) => { el.setAttribute('aria-label', value); }],
];

export function applyI18n(root = typeof document !== 'undefined' ? document : null) {
  if (!root?.querySelectorAll) return;
  for (const [attr, apply] of ATTRS) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      const key = el.getAttribute(attr);
      if (key) apply(el, t(key));
    });
  }
}
