/**
 * TT CDP 冒烟 · 第三步：关更新弹窗后在管理面板里逐条找本插件
 * 用法：node .trellis/tasks/10-25-tt-cdp-probe/research/cdp-find-plugin.cjs
 */
const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const CDP = 'http://127.0.0.1:9223';

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15_000 });
  const tt = browser.contexts().flatMap((c) => c.pages()).find((p) => /localhost:1430|tauri:/i.test(p.url()));
  if (!tt) throw new Error('TT 页面未找到');

  // 0. 关掉可能存在的更新弹窗（「稍后」）
  try {
    await tt.locator('text=/稍后|Later/i').first().click({ timeout: 3_000, force: true });
    await tt.waitForTimeout(600);
    console.log('[update-popup] 已关闭');
  } catch { console.log('[update-popup] 无'); }

  // 1. 打开扩展面板 + 管理视图
  try { await tt.locator('#extensions_menu_button').first().click({ timeout: 4_000 }); await tt.waitForTimeout(800); } catch { /* 已开 */ }
  try {
    const manage = tt.locator('text=/管理扩展|Manage [Ee]xtensions/i').first();
    await manage.click({ timeout: 4_000, force: true }).catch(() => manage.evaluate((el) => el.click()));
    await tt.waitForTimeout(1_200);
  } catch (e) { console.log('[manage] 打开异常（继续）:', String(e).slice(0, 80)); }

  // 2. 在管理视图的第三方扩展列表里滚动查找 st-zip-converter / 数据包互转
  const hits = [];
  for (let i = 0; i < 12; i++) {
    const found = await tt.evaluate(() => {
      const want = /st-zip-converter|数据包互转|zip.?converter/i;
      const out = [];
      document.querySelectorAll('.extension_container, .ext_div, [class*="extension_"]').forEach((el) => {
        if (want.test(el.textContent || '') || want.test(el.getAttribute('data-name') || '')) {
          out.push({ text: (el.textContent || '').trim().slice(0, 80), name: el.getAttribute('data-name') || '', display: el.querySelector('[class*="name"], h4, .menu_button')?.textContent?.trim().slice(0, 40) || '' });
        }
      });
      return { hits: out, total: document.querySelectorAll('.extension_container, .ext_div').length };
    });
    if (found.hits.length && JSON.stringify(found.hits) !== JSON.stringify(hits.at(-1)?.hits || [])) hits.push(found);
    if (found.hits.length) break;
    // 滚动扩展列表容器
    await tt.evaluate(() => {
      const sc = document.querySelector('#extensionsMenu, .extensions_content, [class*="extensions"] [class*="list"], #extensions_settings');
      if (sc) sc.scrollBy(0, 900); else window.scrollBy(0, 900);
    });
    await tt.waitForTimeout(400);
  }
  await tt.screenshot({ path: path.resolve(__dirname, 'tt-find-result.png') });
  console.log('[search]', JSON.stringify(hits.at(-1) || { hits: [], total: 'n/a' }, null, 1));

  await browser.close();
})().catch((e) => { console.error('失败:', String(e).slice(0, 300)); process.exit(1); });
