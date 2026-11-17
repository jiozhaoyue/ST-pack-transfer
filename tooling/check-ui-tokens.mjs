/**
 * UI 设计值单一真源守卫（2026-11-17）。
 *
 * 插件自有的尺寸 / 品牌色 / 图表色 / 状态色必须来自 `src/data/ui-tokens.js`；
 * style.css 里再次出现这些字面量即视为回退到硬编码，直接失败。
 * 宿主主题回退（`var(--SmartTheme*, ...)`）属于兼容层，不在本守卫范围。
 */
import { readFile } from 'node:fs/promises';
import { UI_TOKENS, uiTokenVars } from '../src/data/ui-tokens.js';

const css = await readFile('style.css', 'utf8');
const view = await readFile('src/ui/workbench-view.js', 'utf8');

const problems = [];

const vars = uiTokenVars();
const required = [
  '--ctl-h', '--font-xs', '--radius-sm', '--bg', '--ink-on-accent', '--qr-bg',
  '--brand-st', '--brand-luker', '--brand-tt', '--brand-pt',
  '--vc-c1', '--vc-c12', '--status-scan', '--status-ahead',
];
for (const name of required) {
  if (!(name in vars) || !vars[name]) problems.push(`UI_TOKENS 缺少令牌：${name}`);
}

/* 颜色令牌值不得再次出现在 style.css（尺寸值如 6px 允许在布局中复用）。 */
const tokenValues = new Set(Object.values(vars)
  .map((value) => String(value).trim().toLowerCase())
  .filter((value) => /^#[0-9a-f]{3,8}$/.test(value) || /^rgba?\(/.test(value)));
for (const value of tokenValues) {
  if (!value || value.startsWith('var(')) continue;
  const needle = value.toLowerCase();
  const lines = css.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes(needle)) {
      problems.push(`style.css:${i + 1} 重复硬编码 UI 令牌值 ${value}`);
    }
  }
}

if (!view.includes("from '../data/ui-tokens.js'") || !view.includes('applyUiTokens(')) {
  problems.push('workbench-view.js 未引入并调用 applyUiTokens()');
}

/* 图表序列色必须完整覆盖 12 个类目位，避免新增类目时静默回退到 accent。 */
const chartVars = Object.keys(vars).filter((name) => /^--vc-c\d+$/.test(name));
if (chartVars.length !== UI_TOKENS.chart.length) {
  problems.push(`图表色令牌数量不一致：${chartVars.length} vs ${UI_TOKENS.chart.length}`);
}

if (problems.length) {
  console.error(`UI 令牌守卫失败（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`UI 令牌守卫通过：${Object.keys(vars).length} 个令牌均来自 src/data/ui-tokens.js。`);
