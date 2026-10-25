/**
 * TT CDP 冒烟 · 终步：启用插件 → 打开工作台 → 零异常读数（PRD R4 完整链）
 * 前提：st-zip-converter 已被 TT 发现（cdp-find-plugin 实证）。
 * 用法：node .trellis/tasks/10-25-tt-cdp-probe/research/cdp-workbench.cjs
 */
const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const CDP = 'http://127.0.0.1:9223';

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15_000 });
  const tt = browser.contexts().flatMap((c) => c.pages()).find((p) => /localhost:1430|tauri:/i.test(p.url()));
  if (!tt) throw new Error('TT 页面未找到');

  const errors = [];
  tt.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 150)}`));
  tt.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 150)}`); });

  try { await tt.locator('text=/稍后|Later/i').first().click({ timeout: 2_000, force: true }); } catch { /* 无弹窗 */ }

  // 1. 扩展面板 → 管理视图 → 启用开关（若未启用）
  try { await tt.locator('#extensions_menu_button').first().click({ timeout: 4_000 }); await tt.waitForTimeout(800); } catch { /* 已开 */ }
  try {
    const manage = tt.locator('text=/管理扩展|Manage [Ee]xtensions/i').first();
    await manage.click({ timeout: 4_000, force: true }).catch(() => manage.evaluate((el) => el.click()));
    await tt.waitForTimeout(1_200);
  } catch { /* 已在管理视图 */ }

  // 找本插件的行：启用 checkbox + 「打开」按钮
  const rowState = await tt.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-name]')].filter((el) => /st-zip-converter/i.test(el.getAttribute('data-name') || ''));
    return rows.map((r) => {
      const cb = r.querySelector('input[type="checkbox"]');
      const btns = [...r.querySelectorAll('button')].map((b) => ({ t: (b.textContent || '').trim().slice(0, 12), id: b.id || '', cls: b.className.slice(0, 40) }));
      return { name: r.getAttribute('data-name'), checked: cb ? cb.checked : null, btns };
    });
  });
  console.log('[rows]', JSON.stringify(rowState, null, 1));

  // 启用（若未启用）
  const enabled = await tt.evaluate(() => {
    const row = [...document.querySelectorAll('[data-name]')].find((el) => /st-zip-converter/i.test(el.getAttribute('data-name') || ''));
    if (!row) return 'no-row';
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) { cb.click(); return 'clicked-enable'; }
    return cb ? 'already-enabled' : 'no-checkbox';
  });
  console.log('[enable]', enabled);
  await tt.waitForTimeout(2_500);

  // 2. 工作台痕迹（扩展启用后其 UI 挂载）
  const trace = await tt.evaluate(() => ({
    mentionsPlugin: /数据包互转/i.test(document.documentElement.innerHTML),
    hasDrawerApp: !!document.querySelector('[class*="st-converter"]'),
    hasAppContainer: !!document.querySelector('.app-container'),
  }));
  console.log('[trace]', JSON.stringify(trace));
  await tt.screenshot({ path: path.resolve(__dirname, 'tt-workbench.png') });

  console.log('[errors]', errors.length ? errors.slice(0, 8) : '零异常');
  console.log('[verdict]', trace.hasDrawerApp || trace.hasAppContainer ? '工作台挂载成功' : '插件已发现但 UI 未挂载（记录形态）');
  await browser.close();
})().catch((e) => { console.error('失败:', String(e).slice(0, 300)); process.exit(1); });
