/** 本地取证：教程演示模式的进入 / 操作 / 退出隔离（不纳版本控制）。 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const URL = process.env.STPT_PREVIEW_URL || 'http://localhost:4173/';
const snap = (page) => page.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
  return o;
});

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container');
  await page.waitForTimeout(500);

  const demoOnLoad = {
    banner: await page.locator('#tutorial-banner').isVisible(),
    overlay: await page.locator('#tutorial-overlay').evaluate((el) => el.classList.contains('open')),
    goals: await page.locator('#tutorial-goals .tut-goal').count(),
    packages: await page.locator('#zone-body .pkg-card').count(),
    chartCards: await page.locator('#chart-stack .vol-card').count(),
    actionbar: (await page.locator('#zone-actions-bottom').innerText()).trim(),
  };

  await page.locator('#tutorial-banner-exit').click();
  await page.waitForTimeout(300);
  const afterExit = {
    banner: await page.locator('#tutorial-banner').isVisible(),
    overlay: await page.locator('#tutorial-overlay').evaluate((el) => el.classList.contains('open')),
    packages: await page.locator('#zone-body .pkg-card').count(),
    chartCards: await page.locator('#chart-stack .vol-card').count(),
  };

  await page.evaluate(() => localStorage.setItem('stpt.verify.sentinel', '1'));
  const storageBefore = await snap(page);
  await page.locator('#btn-guide').click();
  await page.waitForTimeout(400);
  const entered = {
    banner: await page.locator('#tutorial-banner').isVisible(),
    packages: await page.locator('#zone-body .pkg-card').count(),
    chartCards: await page.locator('#chart-stack .vol-card').count(),
    goals: await page.locator('#tutorial-goals .tut-goal').count(),
  };

  await page.locator('[data-tutgoal="convert"]').click();
  await page.waitForTimeout(150);
  const step1 = await page.locator('#tutorial-title').innerText();
  await page.locator('#tutorial-next').click();
  await page.waitForTimeout(150);
  const step2 = await page.locator('#tutorial-title').innerText();
  await page.locator('#tutorial-skip').click();
  await page.waitForTimeout(300);
  const afterSkip = {
    banner: await page.locator('#tutorial-banner').isVisible(),
    packages: await page.locator('#zone-body .pkg-card').count(),
  };

  await page.locator('#btn-guide').click();
  await page.waitForTimeout(350);
  let generated = false;
  const gen = page.locator('#btn-generate');
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(250); generated = true; }
  const pendingCount = await page.locator('#pending-exports .pending-row').count();
  let deleted = false;
  const del = page.locator('#btn-delete-selected');
  if (await del.count()) { await del.click(); await page.waitForTimeout(250); deleted = true; }
  const packagesAfterDelete = await page.locator('#zone-body .pkg-card').count();
  const storageDuring = await snap(page);

  await page.locator('#tutorial-banner-exit').click();
  await page.waitForTimeout(350);
  const restored = {
    banner: await page.locator('#tutorial-banner').isVisible(),
    packages: await page.locator('#zone-body .pkg-card').count(),
    chartCards: await page.locator('#chart-stack .vol-card').count(),
    pending: await page.locator('#pending-exports .pending-row').count(),
  };
  const storageAfter = await snap(page);

  console.log(JSON.stringify({
    demoOnLoad, afterExit, entered, step1, step2, afterSkip,
    generated, pendingCount, deleted, packagesAfterDelete, restored,
    storageSame: JSON.stringify(storageBefore) === JSON.stringify(storageAfter),
    storageUntouchedDuringDemo: JSON.stringify(storageBefore) === JSON.stringify(storageDuring),
    sentinel: storageAfter['stpt.verify.sentinel'] || null,
    errs,
  }, null, 2));
  await browser.close();

  const bad = [];
  if (!demoOnLoad.banner || !demoOnLoad.overlay) bad.push('进入后未显示演示横幅/教程');
  if (demoOnLoad.packages < 2 || demoOnLoad.chartCards < 1) bad.push('演示占位数据未出现');
  if (afterExit.banner || afterExit.overlay) bad.push('退出后横幅/教程未关闭');
  if (afterExit.packages !== 0 || afterExit.chartCards !== 0) bad.push('退出后未恢复真实空状态');
  if (!entered.banner || entered.packages < 2) bad.push('再次进入演示失败');
  if (!step1 || !step2) bad.push('教程步骤未推进');
  if (afterSkip.banner) bad.push('跳过未退出演示');
  if (!generated || pendingCount < 2) bad.push('演示中生成未模拟成功');
  if (!deleted || packagesAfterDelete >= entered.packages) bad.push('演示中删除未生效');
  if (restored.banner || restored.packages !== 0 || restored.pending !== 0) bad.push('退出后未完全还原');
  if (!storedSameCheck(storageBefore, storageAfter)) bad.push('演示模式改动了 localStorage');
  if (!storedSameCheck(storageBefore, storageDuring)) bad.push('演示操作期间写入了 localStorage');
  if (errs.length) bad.push('页面错误: ' + errs.join(';'));
  function storedSameCheck(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  if (bad.length) { console.error('ISSUES:', bad.join(' | ')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
