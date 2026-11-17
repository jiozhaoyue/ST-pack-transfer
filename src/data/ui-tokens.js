/**
 * 插件自有 UI 设计值（唯一真源）。
 *
 * 用户 2026-11-17 要求：目标平台颜色只是第一步，**整个项目**可调样式/配置都要数据化。
 * 本文件管理插件自有的尺寸、品牌色、图表色与状态色；
 * 宿主主题色（`--SmartTheme*` 及其回退）属于兼容层，仍留在 style.css。
 *
 * 修改这里即可整体调整；禁止在 style.css 再写这些具体色值。
 */

export const UI_TOKENS = Object.freeze({
  sizes: Object.freeze({
    'ctl-h': '28px',
    'font-xs': '10.5px',
    'radius-sm': '6px',
  }),
  base: Object.freeze({
    bg: '#0b0b0d',
    'ink-on-accent': '#fff',
    'qr-bg': '#fff',
    'icon-plate': '#eceef2',
    'video-bg': '#000',
  }),
  brand: Object.freeze({
    st: '#d32f2f',
    'st-ink': '#fff6f5',
    'st-ring': '#ff5a4f',
    'st-soft': 'rgba(255, 90, 79, 0.18)',
    luker: '#1a1a20',
    'luker-ink': '#e6e7ec',
    'luker-ring': '#b9c8df',
    'luker-soft': 'rgba(185, 200, 223, 0.16)',
    tt: '#ffd633',
    'tt-ink': '#2b2100',
    'tt-ring': '#ffd633',
    'tt-soft': 'rgba(255, 214, 51, 0.18)',
    pt: '#8a5cf6',
    'pt-ink': '#f7f3ff',
    'pt-ring': '#b388ff',
    'pt-soft': 'rgba(179, 136, 255, 0.18)',
  }),
  /* 图表/图例序列色（顺序即 .vc-c1..c12）。 */
  chart: Object.freeze([
    '#4c8dff',
    '#ff7a45',
    '#2ed47a',
    '#ffd43b',
    '#b37feb',
    '#ff5c8a',
    '#13c2c2',
    '#a0d911',
    '#fa8c16',
    '#7252d9',
    '#36cfc9',
    '#f759ab',
  ]),
  status: Object.freeze({
    scan: '#00bcd4',
    ahead: '#ab47bc',
  }),
});

/** 把 UI_TOKENS 展开成 `--name: value` 声明表。 */
export function uiTokenVars() {
  const vars = {};
  for (const [key, value] of Object.entries(UI_TOKENS.sizes)) vars[`--${key}`] = value;
  for (const [key, value] of Object.entries(UI_TOKENS.base)) vars[`--${key}`] = value;
  for (const [key, value] of Object.entries(UI_TOKENS.brand)) vars[`--brand-${key}`] = value;
  UI_TOKENS.chart.forEach((value, index) => {
    vars[`--vc-c${index + 1}`] = value;
  });
  vars['--status-scan'] = UI_TOKENS.status.scan;
  vars['--status-ahead'] = UI_TOKENS.status.ahead;
  return vars;
}

/** 把令牌写到容器行内样式（行内优先级高于样式表）。 */
export function applyUiTokens(root) {
  const target = root || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (!target || !target.style || typeof target.style.setProperty !== 'function') return;
  for (const [name, value] of Object.entries(uiTokenVars())) {
    target.style.setProperty(name, value);
  }
}
