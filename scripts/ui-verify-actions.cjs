/**
 * 第三轮动作行改版取证（本地专属）。
 * 前提：npm run build 且 4173 预览在跑。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(process.env.STPT_PREVIEW_URL || 'http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container', { timeout: 10000 });
  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(120); }

  const out = { errors };
  out.topActions = await page.locator('#top-actions').count();
  out.refreshBtn = await page.locator('#btn-refresh-page').count();
  out.switchTexts = await page.locator('[data-view-switch]:visible .view-switch-btn').allInnerTexts();
  out.importFetchVisible = await page.locator('#btn-fetch').isVisible();
  out.importDeltaVisible = await page.locator('#delta-toggle').isVisible();

  await page.locator('#zone-tabs .zone-tab[data-zone="export"]').click();
  await page.waitForTimeout(150);
  out.exportFetchVisible = await page.locator('#btn-fetch').isVisible();
  out.exportDeltaVisible = await page.locator('#delta-toggle').isVisible();

  await page.locator('#zone-tabs .zone-tab[data-zone="import"]').click();
  await page.waitForTimeout(150);

  await page.locator('.view-switch-btn:visible', { hasText: '迁移与备份' }).first().click();
  await page.waitForTimeout(150);
  out.transferVisible = await page.locator('#transfer-view').isVisible();
  out.transferTabs = await page.locator('#transfer-tabs .seg-btn').allInnerTexts();
  out.transferActive = await page.locator('#transfer-view').getAttribute('hidden');
  await page.locator('#transfer-close-btn').click();
  await page.waitForTimeout(120);
  out.backToChart = await page.locator('#chart-card').isVisible();

  await page.screenshot({ path: 'test-results/actions-desktop.png' });
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
