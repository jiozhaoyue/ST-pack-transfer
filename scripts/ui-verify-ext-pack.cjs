/**
 * 扩展管理「打包」页取证：载入真实 fixture 包，验证勾选与图表树双向同步、每包 git。
 * 本地专属，不纳版本控制。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const URL = process.env.STPT_PREVIEW_URL || 'http://localhost:4173/';
const EXT_GROUP_ID = 'group:extensions';

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container');
  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(80); }

  await page.setInputFiles('#file-input', 'fixtures/fixture-l.zip');
  await page.waitForSelector('[data-pkgcheck]', { timeout: 15000 });
  await page.waitForTimeout(400);

  // 进入扩展管理 → 打包
  await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('#extmgr-tabs .seg-btn', { hasText: '打包' }).click();
  await page.waitForTimeout(150);

  const rows = page.locator('#extension-body [data-packext]');
  const rowCount = await rows.count();
  const firstName = rowCount ? await rows.first().getAttribute('data-packext') : '';
  const firstChecked = rowCount ? await rows.first().isChecked() : null;
  const headText = await page.locator('#extension-body .pack-head').first().innerText().catch(() => '');

  // 打包页取消 → 图表树该扩展目录应变为未勾选
  if (rowCount) await rows.first().uncheck();
  await page.waitForTimeout(200);
  await page.locator('.view-switch-btn:visible', { hasText: '存储图表' }).first().click();
  await page.waitForTimeout(200);
  const chartDir = page.locator(`#chart-stack input[data-check="${EXT_GROUP_ID}"]`).first();
  const chartChecked = (await chartDir.count()) ? await chartDir.isChecked() : null;

  // 图表树勾回来 → 打包页应恢复勾选
  if (await chartDir.count()) await chartDir.check();
  await page.waitForTimeout(200);
  await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('#extmgr-tabs .seg-btn', { hasText: '打包' }).click();
  await page.waitForTimeout(150);
  const rowsBack = page.locator('#extension-body [data-packext]');
  const backChecked = (await rowsBack.count()) ? await rowsBack.first().isChecked() : null;

  // 每包 git：改成 strip 后重渲染仍保持
  const gitSel = page.locator('#extension-body [data-packgit]').first();
  let gitAfter = null;
  if (await gitSel.count()) {
    await gitSel.selectOption('strip');
    await page.waitForTimeout(200);
    gitAfter = await page.locator('#extension-body [data-packgit]').first().inputValue();
  }

  const result = { rowCount, firstName, firstChecked, headText, chartChecked, backChecked, gitAfter, errors };
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/ext-pack-page.png' });
  await browser.close();
  const ok = rowCount === 1 && firstName === 'test-extension' && firstChecked === true
    && chartChecked === false && backChecked === true && gitAfter === 'strip' && errors.length === 0;
  if (!ok) { console.error('PACK CHECK FAILED'); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
