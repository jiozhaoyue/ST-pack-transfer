/**
 * 目标平台 UI 配色映射。
 *
 * 2026-11-17 用户改判：目标平台按钮必须按各自品牌色变化，禁止再好写死单一紫色。
 * 具体色值唯一真源是 `src/data/ui-tokens.js` 的 brand 令牌；
 * 本文件只把宿主码映射到对应的 CSS 变量名，供测试/文档核对。
 */
export const TARGET_UI = Object.freeze({
  byHost: Object.freeze({
    st: Object.freeze({ accent: 'var(--brand-st)', ink: 'var(--brand-st-ink)', ring: 'var(--brand-st-ring)', soft: 'var(--brand-st-soft)' }),
    luker: Object.freeze({ accent: 'var(--brand-luker)', ink: 'var(--brand-luker-ink)', ring: 'var(--brand-luker-ring)', soft: 'var(--brand-luker-soft)' }),
    tt: Object.freeze({ accent: 'var(--brand-tt)', ink: 'var(--brand-tt-ink)', ring: 'var(--brand-tt-ring)', soft: 'var(--brand-tt-soft)' }),
    pt: Object.freeze({ accent: 'var(--brand-pt)', ink: 'var(--brand-pt-ink)', ring: 'var(--brand-pt-ring)', soft: 'var(--brand-pt-soft)' }),
  }),
});

/**
 * 获取指定宿主/平台的品牌色变量集合（唯一真源出口）。
 * 统一管理所有与品牌色相关的角标、按钮、边框联动。
 */
export function brandTokensOf(host) {
  return TARGET_UI.byHost[host] || null;
}
