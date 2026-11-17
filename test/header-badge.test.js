import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * 页头徽标回归（2026-11-17 用户裁定）：
 * - 徽标必须显示「宿主图标 + 当前用户名」，不得回退成宿主名；
 * - 四个宿主都有登录态，绝不允许出现「未登录 / 游客」文案；读不到只显示「正在读取」并继续重试；
 * - 用户名取 `handle`，为空再取 `name` 兜底；
 * - 窄屏不得把文字挤出胶囊：单行省略 + title 保留全名；
 * - 宿主图标（尤其 Luker 黑图标）必须有浅色底板。
 */
const viewJs = fs.readFileSync(new URL('../src/ui/workbench-view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const zh = fs.readFileSync(new URL('../src/i18n/locales/zh-CN.js', import.meta.url), 'utf8');
const en = fs.readFileSync(new URL('../src/i18n/locales/en-US.js', import.meta.url), 'utf8');

function ruleBody(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const start = css.indexOf('{', i);
  const end = css.indexOf('}', start);
  return css.slice(start + 1, end);
}

describe('页头徽标：图标 + 用户名，禁止宿主名回退', () => {
  it('renderHeader 的占位文案不是宿主名，也绝不是未登录', () => {
    const body = viewJs.slice(viewJs.indexOf('function renderHeader()'), viewJs.indexOf('function renderTargetPicker()'));
    expect(body).toContain("t('header.userLoading')");
    expect(body).not.toContain("t('header.noUser')");
    expect(body).not.toContain("t('header.hostOnly', { host: h.full })");
  });

  it('全仓不出现未登录 / 游客文案', () => {
    expect(viewJs).not.toMatch(/header\.noUser|未登录|游客|Not signed in/);
    expect(zh).not.toMatch(/header\.noUser|'未登录'|游客/);
    expect(en).not.toMatch(/header\.noUser|Not signed in|guest/i);
  });

  it('启动时读取宿主身份，handle 为空用 name 兜底，失败持续重试', () => {
    expect(viewJs).toContain('async function refreshHostIdentity()');
    expect(viewJs).toContain('void refreshHostIdentity();');
    expect(viewJs).toContain('state.extHostUser=identity.handle||identity.name');
    expect(viewJs).toContain('hostIdentityTimer=setTimeout');
  });

  it('徽标单行省略，不溢出胶囊', () => {
    const badge = ruleBody('#app.app-container .badge{');
    expect(badge).toContain('display:inline-flex');
    expect(badge).toContain('max-width:min(240px,42vw)');
    const text = ruleBody('#app.app-container .badge #host-badge-text{');
    expect(text).toContain('text-overflow:ellipsis');
    expect(text).toContain('overflow:hidden');
  });

  it('宿主图标有浅色底板且不再绝对定位', () => {
    const icon = (css.match(/\.badge \.host-icon,[\s\S]{0,240}?\{([^}]*)\}/) || [])[1] || '';
    expect(icon).toContain('position:static');
    const plate = (css.match(/\.badge \.host-icon\{([^}]*)\}/) || [])[1] || '';
    expect(plate).toContain('background:var(--icon-plate)');
  });
});
