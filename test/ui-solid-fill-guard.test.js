import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * 2026-11-17 用户裁定：禁止「整块实色填充」。
 *
 * 本守卫只锁**大面积可交互块**与**手机滚动容器**两类最易回归的判据：
 *  - 强调按钮 / 目标平台按钮 / 次按钮 hover / 危险操作：必须是浅染底（*-soft / *-bg）。
 *  - 手机端 .app-main 不得被全局 overflow-y:hidden 关掉滚动（只在自带内滚的视图里禁外滚）。
 *
 * 微指示（≤16px 圆点、勾选标记、进度条、计数徽章）不受此限：它们不是“填充色块”，
 * 且需要实色才可辨识。
 */
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const viewJs = fs.readFileSync(new URL('../src/ui/workbench-view.js', import.meta.url), 'utf8');

/** 取某个选择器所在的规则体（到第一个右花括号） */
function ruleBody(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const start = css.indexOf('{', i);
  const end = css.indexOf('}', start);
  return css.slice(start + 1, end);
}

describe('实色填充与手机滚动防回归（2026-11-17 用户裁定）', () => {
  it('主操作按钮：浅染底 + 强调文字，禁止整块实色', () => {
    const body = ruleBody('#app.app-container .btn.accent{');
    expect(body).toContain('background:var(--accent-soft)');
    expect(body).toContain('color:var(--accent)');
    expect(body).not.toMatch(/background:var\(--accent\)(?!-)/);
  });

  it('目标平台按钮与选中项：品牌浅染 + 品牌描边，禁止整块品牌实色', () => {
    for (const host of ['st', 'luker', 'tt', 'pt']) {
      const btn = ruleBody(`#app.app-container .picker-btn[data-host="${host}"]{`);
      expect(btn, host).toContain(`background:var(--brand-${host}-soft)`);
      expect(btn, host).toContain(`color:var(--brand-${host}-ring)`);
      expect(btn, host).not.toMatch(new RegExp(`background:var\\(--brand-${host}\\)(?!-)`));

      const item = css.match(new RegExp(
        `\\.picker-item\\[data-host="${host}"\\]\\.is-host,[\\s\\S]*?\\{[^}]*\\}`,
      ))?.[0] || '';
      expect(item, host).toContain(`background:var(--brand-${host}-soft)`);
    }
  });

  it('次按钮 hover 不得铺满强调色', () => {
    const body = ruleBody('#app.app-container .mini:hover{');
    expect(body).toContain('background:var(--accent-soft)');
    expect(body).not.toMatch(/background:var\(--accent\)(?!-)/);
  });

  it('危险操作按钮不得整块实色（含内联样式）', () => {
    expect(viewJs).toContain("b.style.background='var(--drop-bg)'");
    expect(viewJs).not.toContain("b.style.background='var(--drop)'");
  });

  it('手机端 .app-main 不得被全局关闭纵向滚动', () => {
    // 全文件里不允许出现「mobile .app-main + overflow-y:hidden」的全局规则
    expect(css).not.toMatch(
      /\[data-view="mobile"\]\s+\.app-main\s*\{[^}]*overflow-y\s*:\s*hidden/,
    );
    // 自带内滚的视图仍应显式禁外滚（避免双滚动条）
    expect(css).toContain(':has(#extension-view:not([hidden])) .app-main{overflow:hidden}');
    expect(css).toContain(':has(#transfer-view:not([hidden])) .app-main{overflow:hidden}');
    // 数据包抽屉展开时冻结页面主体，避免 app-main + zone-body 双滚动
    expect(css).toContain('[data-zone-open="1"] .app-main{overflow:hidden}');
  });

  it('触屏走桌面布局时的小控件有可点尺寸兜底', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)\{[\s\S]*?\.tree-toggle\{width:24px;height:24px\}/);
  });
});
