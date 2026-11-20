/**
 * 响应式 + 扩展管理打包页取证（本地专属，不纳版本控制）。
 * 前置：npm run build && 4173 预览服务器在跑。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');

const CASES = [
  { w: 1280, h: 900, name: 'desktop' },
  { w: 900, h: 800, name: 'near-breakpoint' },
  { w: 800, h: 800, name: 'stacked-800' },
  { w: 700, h: 700, name: 'stacked-700' },
  { w: 500, h: 780, name: 'narrow-500' },
  { w: 380, h: 700, name: 'phone-380' },
];

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const out = {};
  fs.mkdirSync('test-results', { recursive: true });
  for (const c of CASES) {
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(process.env.STPT_PREVIEW_URL || 'http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#app.app-container', { timeout: 10000 });
    const skip = page.locator('#tutorial-skip');
    if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(80); }

    const view = await page.locator('#app').getAttribute('data-view');
    const switchBtns = await page.locator('[data-view-switch]:visible .view-switch-btn').count();
    const switchTexts = await page.locator('[data-view-switch]:visible .view-switch-btn').allInnerTexts();
    // 数据包切页按钮必须存在（手机态 3 个其中之一）
    const hasZoneBtn = switchTexts.some((t) => t.includes('数据包'));
    let zoneVisible = await page.locator('#zone-card').isVisible();
    if (view === 'mobile' && hasZoneBtn) {
      await page.locator('.view-switch-btn:visible', { hasText: '数据包' }).first().click();
      await page.waitForTimeout(120);
      zoneVisible = await page.locator('#zone-card').isVisible();
    }
    // 扩展管理：4 个 tab，含「打包」
    await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
    await page.waitForTimeout(120);
    const extBtns = await page.locator('#extmgr-tabs .seg-btn').allInnerTexts();
    await page.locator('#extmgr-tabs .seg-btn', { hasText: '打包' }).click();
    await page.waitForTimeout(120);
    const packText = await page.locator('#extension-body').innerText();
    const overflowX = await page.evaluate(() => {
      const el = document.getElementById('app');
      return el ? el.scrollWidth - el.clientWidth : 0;
    });
    out[c.name] = {
      view, switchBtns, switchTexts, hasZoneBtn, zoneVisible,
      extTabs: extBtns, packHasGroups: packText.includes('已选'), packText: packText.slice(0, 120),
      overflowX, errors,
    };
    await page.screenshot({ path: `test-results/resp-${c.name}.png` });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
  const bad = Object.entries(out).filter(([, v]) =>
    v.errors.length || v.overflowX > 1 || !v.extTabs.includes('打包') || !v.zoneVisible
    || v.switchBtns !== (v.view === 'mobile' ? 4 : 3)
    || v.hasZoneBtn !== (v.view === 'mobile'));
  if (bad.length) { console.error('ISSUES:', bad.map(([k]) => k).join(', ')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
